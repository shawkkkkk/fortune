"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, formatUnits, http, parseEventLogs, parseUnits, type Address, type Log } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CURVE_TRADE_ABI, ERC20_TRADE_ABI, WRAPPED_NATIVE_ABI } from "@/lib/trade-abis";
import SlippagePicker, { useSlippage } from "@/components/SlippagePicker";
import {
  averagePriceUsd1e18,
  formatBps,
  isWrappedNative,
  maxSpendableNative,
  minimumOut,
  priceImpactBps,
  shieldStatus,
  walletCapRemaining,
  wrapShortfall,
} from "@/lib/trade-math";
import { walletChain, walletClients, walletErrorMessage } from "@/lib/wallet";

// Buy and sell on a Fortune curve. When the curve's quote asset is wrapped BNB
// the panel pays and pays out in BNB, wrapping or unwrapping only what the
// trade needs. Every trade shows its quote first, approves only the amount it
// spends, and respects the slippage the trader chose.

export type CurveQuote = { address: Address; symbol: string; decimals: number };

type Props = {
  curve: Address;
  token: Address;
  symbol: string;
  quotes: CurveQuote[];
  totalSupply: bigint;
  launchTimestamp: number;
  /** Chain time minus this device's clock, in seconds. */
  clockOffset: number;
  spotPriceUsd: bigint;
  account: Address | null;
  connect: () => Promise<Address>;
  /** Called after every trade; with a summary when the trade completed the curve and this panel is about to close. */
  onTraded: (summary?: string) => void;
};

type BuyQuote = { kind: "buy"; amount: bigint; quoteRefund: bigint; snipeTax: bigint; fee: bigint; usdIn: bigint; tokensOut: bigint };
type SellQuote = { kind: "sell"; amount: bigint; fee: bigint; quoteOut: bigint; usdGross: bigint };

const readClient = createPublicClient({ chain: walletChain, transport: http(FORTUNE_NETWORK.publicRpcUrl) });
const TOKEN_DECIMALS = 18;

export function amountText(value: bigint, decimals: number, digits = 6) {
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function usdText(value: bigint) {
  const number = Number(formatUnits(value, 18));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: number < 0.01 ? 10 : number < 1 ? 6 : 2 }).format(number);
}

export default function CurveTradePanel({ curve, token, symbol, quotes, totalSupply, launchTimestamp, clockOffset, spotPriceUsd, account, connect, onTraded }: Props) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const quoteAsset = quotes[quoteIndex] ?? quotes[0];
  const wrapped = isWrappedNative(FORTUNE_NETWORK.chainId, quoteAsset?.address);
  const [useNative, setUseNative] = useState(true);
  const native = wrapped && useNative;
  const unit = native ? FORTUNE_NETWORK.nativeSymbol : quoteAsset?.symbol ?? "";

  const [input, setInput] = useState("");
  const [slippageBps, setSlippageBps] = useSlippage();
  const [shieldAck, setShieldAck] = useState(false);
  const [balances, setBalances] = useState({ native: 0n, quote: 0n, token: 0n, bought: 0n });
  const [quote, setQuote] = useState<BuyQuote | SellQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);

  const shield = shieldStatus(launchTimestamp, Math.floor(now + clockOffset));
  const inputDecimals = side === "buy" ? quoteAsset?.decimals ?? 18 : TOKEN_DECIMALS;
  const amount = useMemo(() => {
    try {
      const value = input.trim() ? parseUnits(input.trim(), inputDecimals) : 0n;
      return value > 0n ? value : 0n;
    } catch {
      return 0n;
    }
  }, [input, inputDecimals]);

  const refreshBalances = useCallback(async () => {
    if (!account || !quoteAsset) return;
    const [nativeBalance, quoteBalance, tokenBalance, bought] = await Promise.all([
      readClient.getBalance({ address: account }),
      readClient.readContract({ address: quoteAsset.address, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [account] }),
      readClient.readContract({ address: token, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [account] }),
      readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "shieldPurchased", args: [account] }),
    ]);
    setBalances({ native: nativeBalance, quote: quoteBalance, token: tokenBalance, bought });
  }, [account, curve, quoteAsset, token]);

  useEffect(() => {
    void refreshBalances().catch(() => undefined);
  }, [refreshBalances]);

  // Quote the typed amount a moment after typing stops, then keep the quote
  // fresh every few seconds without blanking it.
  const quoteRun = useRef(0);
  const quoteKey = useRef("");
  const quotedKey = useRef("");
  const quoteTick = Math.floor(now / 5);
  const quoteAddress = quoteAsset?.address;
  useEffect(() => {
    const key = `${side}:${quoteAddress}:${amount}`;
    const changed = key !== quoteKey.current;
    quoteKey.current = key;
    if (changed) {
      quotedKey.current = "";
      setQuote(null);
      setQuoteError("");
    }
    if (!quoteAddress || amount === 0n) return;
    const run = ++quoteRun.current;
    const timer = window.setTimeout(async () => {
      try {
        if (side === "buy") {
          const [, quoteRefund, snipeTax, fee, , usdIn, tokensOut] = await readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "previewBuy", args: [quoteAddress, amount] });
          if (run === quoteRun.current) setQuote({ kind: "buy", amount, quoteRefund, snipeTax, fee, usdIn, tokensOut });
        } else {
          const [, fee, quoteOut, usdGross] = await readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "previewSell", args: [quoteAddress, amount] });
          if (run === quoteRun.current) setQuote({ kind: "sell", amount, fee, quoteOut, usdGross });
        }
        if (run === quoteRun.current) {
          quotedKey.current = key;
          setQuoteError("");
        }
      } catch (error) {
        // A failed background refresh keeps the last good quote.
        if (run === quoteRun.current && quotedKey.current !== key) setQuoteError(walletErrorMessage(error, zh ? "无法报价。" : "The curve could not quote this amount."));
      }
    }, changed ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [amount, curve, quoteAddress, quoteTick, side, zh]);

  const spendable = side === "buy" ? (native ? maxSpendableNative(balances.native, balances.quote) : balances.quote) : balances.token;
  const capLeft = walletCapRemaining(totalSupply, balances.bought);
  const exceedsCap = side === "buy" && shield.capActive && quote?.kind === "buy" && quote.tokensOut > capLeft;
  const needsShieldAck = side === "buy" && shield.taxBps > 0;
  const insufficient = account !== null && amount > spendable;

  const received = quote ? (quote.kind === "buy" ? quote.tokensOut : quote.quoteOut) : 0n;
  const receivedDecimals = side === "buy" ? TOKEN_DECIMALS : quoteAsset?.decimals ?? 18;
  const minReceived = received > 0n ? minimumOut(received, slippageBps) : 0n;
  const average = quote ? (quote.kind === "buy" ? averagePriceUsd1e18(quote.usdIn, quote.tokensOut) : averagePriceUsd1e18(quote.usdGross, quote.amount)) : 0n;
  const impact = quote ? priceImpactBps(spotPriceUsd, average) : null;

  function pickFraction(fraction: bigint) {
    if (spendable <= 0n) return;
    const value = (spendable * fraction) / 100n;
    setInput(formatUnits(value, side === "buy" ? quoteAsset?.decimals ?? 18 : TOKEN_DECIMALS));
  }

  async function ensureAllowance(owner: Address, asset: Address, spender: Address, needed: bigint, label: string) {
    const { publicClient, walletClient } = walletClients(owner);
    const current = await readClient.readContract({ address: asset, abi: ERC20_TRADE_ABI, functionName: "allowance", args: [owner, spender] });
    if (current >= needed) return;
    setBusy("approve");
    setStatus(zh ? `在钱包中批准 ${label}（仅本次交易金额）。` : `Approve ${label} in your wallet (this trade's amount only).`);
    const hash = await walletClient.writeContract({ address: asset, abi: ERC20_TRADE_ABI, functionName: "approve", args: [spender, needed] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(zh ? "批准交易失败。" : "The approval transaction reverted.");
  }

  /** The curve's own events in a receipt: the exact fill, refund and payout of a trade. */
  function curveEvents(logs: Log[]) {
    return parseEventLogs({ abi: CURVE_TRADE_ABI, logs: logs.filter((log) => log.address.toLowerCase() === curve.toLowerCase()) });
  }

  async function submit() {
    if (!quoteAsset || amount === 0n) return;
    setStatus("");
    let summary: string | undefined;
    try {
      const owner = account ?? (await connect());
      const { publicClient, walletClient } = walletClients(owner);
      if (side === "buy") {
        let wrappedForTrade = 0n;
        if (native) {
          const wrappedBalance = await readClient.readContract({ address: quoteAsset.address, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [owner] });
          const shortfall = wrapShortfall(amount, wrappedBalance);
          wrappedForTrade = shortfall;
          if (shortfall > 0n) {
            setBusy("wrap");
            setStatus(zh ? `将 ${amountText(shortfall, 18)} ${FORTUNE_NETWORK.nativeSymbol} 换成 ${quoteAsset.symbol}。` : `Wrap ${amountText(shortfall, 18)} ${FORTUNE_NETWORK.nativeSymbol} into ${quoteAsset.symbol}.`);
            const hash = await walletClient.writeContract({ address: quoteAsset.address, abi: WRAPPED_NATIVE_ABI, functionName: "deposit", value: shortfall });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error(zh ? "包装交易失败。" : "The wrap transaction reverted.");
          }
        }
        await ensureAllowance(owner, quoteAsset.address, curve, amount, `${amountText(amount, quoteAsset.decimals)} ${quoteAsset.symbol}`);
        // Re-quote right before signing so the minimum reflects the latest trades.
        const [, , , , , , previewTokensOut] = await readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "previewBuy", args: [quoteAsset.address, amount] });
        const minTokensOut = minimumOut(previewTokensOut, slippageBps);
        setBusy("buy");
        setStatus(zh ? `确认买入，至少获得 ${amountText(minTokensOut, TOKEN_DECIMALS)} ${symbol}。` : `Confirm the buy: at least ${amountText(minTokensOut, TOKEN_DECIMALS)} ${symbol}.`);
        const simulation = await publicClient.simulateContract({ account: owner, address: curve, abi: CURVE_TRADE_ABI, functionName: "buy", args: [quoteAsset.address, amount, minTokensOut] });
        const hash = await walletClient.writeContract(simulation.request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(zh ? "买入交易失败。" : "The buy transaction reverted.");
        const events = curveEvents(receipt.logs);
        const fill = events.find((event) => event.eventName === "Bought");
        const bought = `${amountText(fill?.eventName === "Bought" ? fill.args.tokensOut : simulation.result, TOKEN_DECIMALS)} ${symbol}`;
        // A buy that reaches the graduation target is refunded the part the curve could not fill.
        const partial = events.find((event) => event.eventName === "BuyPartialFill");
        const refund = partial?.eventName === "BuyPartialFill" ? partial.args.refundedQuoteIn : 0n;
        const unwrap = refund < wrappedForTrade ? refund : wrappedForTrade;
        let unwrapped = false;
        if (unwrap > 0n) {
          setBusy("unwrap");
          try {
            const unwrapHash = await walletClient.writeContract({ address: quoteAsset.address, abi: WRAPPED_NATIVE_ABI, functionName: "withdraw", args: [unwrap] });
            const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
            if (unwrapReceipt.status !== "success") throw new Error(zh ? "解包交易失败。" : "The unwrap transaction reverted.");
            unwrapped = unwrap === refund;
          } catch {
            // The buy stands; the refund stays wrapped and the status below says so.
          }
        }
        const refundUnit = unwrapped ? FORTUNE_NETWORK.nativeSymbol : quoteAsset.symbol;
        const text = refund > 0n
          ? (zh ? `已买入 ${bought}。已达到毕业目标，退回 ${amountText(refund, quoteAsset.decimals)} ${refundUnit}。` : `Bought ${bought}. The graduation target was reached, so ${amountText(refund, quoteAsset.decimals)} ${refundUnit} came back to you.`)
          : (zh ? `已买入 ${bought}。` : `Bought ${bought}.`);
        setStatus(text);
        if (events.some((event) => event.eventName === "GraduationReady")) {
          summary = text + (zh ? " 这笔买入完成了曲线，任何人现在都可以把流动性迁移到 PancakeSwap。" : " This buy completed the curve. Anyone can now finalize graduation to PancakeSwap.");
        }
      } else {
        await ensureAllowance(owner, token, curve, amount, `${amountText(amount, TOKEN_DECIMALS)} ${symbol}`);
        const [, , quoteOut] = await readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "previewSell", args: [quoteAsset.address, amount] });
        const minQuoteOut = minimumOut(quoteOut, slippageBps);
        setBusy("sell");
        setStatus(zh ? `确认卖出，至少获得 ${amountText(minQuoteOut, quoteAsset.decimals)} ${quoteAsset.symbol}。` : `Confirm the sale: at least ${amountText(minQuoteOut, quoteAsset.decimals)} ${quoteAsset.symbol}.`);
        const simulation = await publicClient.simulateContract({ account: owner, address: curve, abi: CURVE_TRADE_ABI, functionName: "sell", args: [quoteAsset.address, amount, minQuoteOut] });
        const hash = await walletClient.writeContract(simulation.request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(zh ? "卖出交易失败。" : "The sell transaction reverted.");
        const sold = curveEvents(receipt.logs).find((event) => event.eventName === "Sold");
        const gained = sold?.eventName === "Sold" ? sold.args.quoteOut : simulation.result;
        if (native && gained > 0n) {
          setBusy("unwrap");
          setStatus(zh ? `将 ${amountText(gained, 18)} ${quoteAsset.symbol} 换回 ${FORTUNE_NETWORK.nativeSymbol}。` : `Unwrap ${amountText(gained, 18)} ${quoteAsset.symbol} to ${FORTUNE_NETWORK.nativeSymbol}.`);
          try {
            const unwrapHash = await walletClient.writeContract({ address: quoteAsset.address, abi: WRAPPED_NATIVE_ABI, functionName: "withdraw", args: [gained] });
            const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
            if (unwrapReceipt.status !== "success") throw new Error(zh ? "解包交易失败。" : "The unwrap transaction reverted.");
            setStatus(zh ? `已卖出，获得 ${amountText(gained, 18)} ${FORTUNE_NETWORK.nativeSymbol}。` : `Sold for ${amountText(gained, 18)} ${FORTUNE_NETWORK.nativeSymbol}.`);
          } catch (error) {
            setStatus(zh ? `已卖出，获得 ${amountText(gained, 18)} ${quoteAsset.symbol}；未换回 ${FORTUNE_NETWORK.nativeSymbol}：${walletErrorMessage(error)}` : `Sold for ${amountText(gained, 18)} ${quoteAsset.symbol}. It stayed wrapped: ${walletErrorMessage(error)}`);
          }
        } else {
          setStatus(zh ? `已卖出，获得 ${amountText(gained, quoteAsset.decimals)} ${quoteAsset.symbol}。` : `Sold for ${amountText(gained, quoteAsset.decimals)} ${quoteAsset.symbol}.`);
        }
      }
      setInput("");
      setShieldAck(false);
      onTraded(summary);
      await refreshBalances();
    } catch (error) {
      setStatus(walletErrorMessage(error, zh ? "交易未完成。" : "The trade did not go through."));
    } finally {
      setBusy("");
    }
  }

  const disabled = Boolean(busy) || amount === 0n || !quote || insufficient || exceedsCap || (needsShieldAck && !shieldAck);
  const steps = side === "buy"
    ? [native && wrapShortfall(amount, balances.quote) > 0n ? (zh ? `换成 ${quoteAsset.symbol}` : "Wrap") : null, zh ? "批准" : "Approve", zh ? "买入" : "Buy"]
    : [zh ? "批准" : "Approve", zh ? "卖出" : "Sell", native ? (zh ? `换回 ${FORTUNE_NETWORK.nativeSymbol}` : "Unwrap") : null];

  return (
    <section className="panel tradePanel curveTrade" aria-label={zh ? "在曲线上交易" : "Trade on the curve"}>
      <div className="tradeSides" role="tablist" aria-label={zh ? "买入或卖出" : "Buy or sell"}>
        {(["buy", "sell"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={side === value} className={side === value ? "active" : ""} onClick={() => { setSide(value); setInput(""); }}>
            {value === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}
          </button>
        ))}
      </div>

      {quotes.length > 1 ? (
        <label>
          {zh ? "计价资产" : "Quote asset"}
          <select value={quoteIndex} onChange={(event) => setQuoteIndex(Number(event.target.value))}>
            {quotes.map((item, index) => <option key={item.address} value={index}>{item.symbol}</option>)}
          </select>
        </label>
      ) : null}

      {wrapped ? (
        <label className="tradeNative">
          <input type="checkbox" checked={useNative} onChange={(event) => setUseNative(event.target.checked)} />
          <span translate="no">{side === "buy" ? (zh ? `用 ${FORTUNE_NETWORK.nativeSymbol} 支付（自动换成 ${quoteAsset.symbol}）` : `Pay with ${FORTUNE_NETWORK.nativeSymbol} (wrapped to ${quoteAsset.symbol} as needed)`) : (zh ? `收到 ${FORTUNE_NETWORK.nativeSymbol}（自动从 ${quoteAsset.symbol} 换回）` : `Receive ${FORTUNE_NETWORK.nativeSymbol} (unwrapped from ${quoteAsset.symbol})`)}</span>
        </label>
      ) : null}

      <label>
        <span translate="no">{side === "buy" ? (zh ? `支付 · ${unit}` : `You pay · ${unit}`) : (zh ? `卖出 · ${symbol}` : `You sell · ${symbol}`)}</span>
        <input value={input} inputMode="decimal" autoComplete="off" placeholder="0" onChange={(event) => setInput(event.target.value.replace(",", "."))} aria-invalid={insufficient || undefined} />
      </label>
      <div className="tradeQuick">
        <span className="mutedSmall" translate="no">{zh ? "余额 " : "Balance "}{account ? `${amountText(side === "buy" ? spendable : balances.token, side === "buy" ? quoteAsset?.decimals ?? 18 : TOKEN_DECIMALS)} ${side === "buy" ? unit : symbol}` : "—"}</span>
        <span>
          {[25n, 50n, 100n].map((fraction) => (
            <button key={String(fraction)} type="button" disabled={!account || spendable === 0n} onClick={() => pickFraction(fraction)}>{fraction === 100n ? (zh ? "最大" : "Max") : `${fraction}%`}</button>
          ))}
        </span>
      </div>
      {side === "buy" && native && account ? <p className="fieldHint" translate="no">{zh ? `最大值会保留 0.003 ${FORTUNE_NETWORK.nativeSymbol} 作为手续费。` : `Max keeps 0.003 ${FORTUNE_NETWORK.nativeSymbol} back for gas.`}</p> : null}
      {insufficient ? <p className="fieldError" role="alert">{zh ? "余额不足。" : "That is more than your balance."}</p> : null}

      {needsShieldAck ? (
        <div className="shieldNotice" role="status">
          <strong translate="no">{zh ? `防狙击税 ${formatBps(shield.taxBps)} · ${shield.secondsToZero} 秒后归零` : `Launch Shield tax ${formatBps(shield.taxBps)} · 0% in ${shield.secondsToZero} s`}</strong>
          <span className="shieldTrack" aria-hidden="true"><span style={{ width: `${(shield.taxBps / 9_900) * 100}%` }} /></span>
          <label className="tradeNative">
            <input type="checkbox" checked={shieldAck} onChange={(event) => setShieldAck(event.target.checked)} />
            <span translate="no">{zh ? `仍然买入：我这笔买入的 ${formatBps(shield.taxBps)} 将进入本次发行的流动性金库，而不是给我。` : `Buy anyway: ${formatBps(shield.taxBps)} of my buy goes to this launch's liquidity vault, not to me.`}</span>
          </label>
        </div>
      ) : null}
      {side === "buy" && shield.capActive ? (
        <p className="fieldHint" translate="no">{zh ? `开盘 15 秒内每个钱包最多买入总量的 2%（剩余 ${amountText(capLeft, TOKEN_DECIMALS, 0)} ${symbol}，${shield.secondsToCapEnd} 秒后解除）。` : `For the first 15 s each wallet can buy at most 2% of supply (${amountText(capLeft, TOKEN_DECIMALS, 0)} ${symbol} left for you, lifts in ${shield.secondsToCapEnd} s).`}</p>
      ) : null}
      {exceedsCap ? <p className="fieldError" role="alert">{zh ? "超过开盘钱包上限，请减少金额或稍候。" : "This buy is over the early wallet cap. Lower it or wait a few seconds."}</p> : null}

      <dl className="tradeQuote" aria-live="polite">
        <div><dt>{zh ? "预计获得" : "You receive"}</dt><dd translate="no">{quote ? `${amountText(received, receivedDecimals)} ${side === "buy" ? symbol : native ? FORTUNE_NETWORK.nativeSymbol : quoteAsset?.symbol}` : "—"}</dd></div>
        <div><dt>{zh ? `最少获得（滑点 ${formatBps(slippageBps)}）` : `Minimum (slippage ${formatBps(slippageBps)})`}</dt><dd translate="no">{quote ? amountText(minReceived, receivedDecimals) : "—"}</dd></div>
        <div><dt>{zh ? "平均价格" : "Average price"}</dt><dd translate="no">{quote && average > 0n ? `${usdText(average)}${impact !== null ? (zh ? ` · 偏离现价 ${formatBps(impact)}` : ` · ${formatBps(impact)} from spot`) : ""}` : "—"}</dd></div>
        <div><dt>{zh ? "交易费" : "Trading fee"}</dt><dd translate="no">{quote && quoteAsset ? `${amountText(quote.fee, quoteAsset.decimals)} ${quoteAsset.symbol}` : "—"}</dd></div>
        {quote?.kind === "buy" && quote.snipeTax > 0n ? <div><dt>{zh ? "防狙击税" : "Launch Shield tax"}</dt><dd translate="no">{`${amountText(quote.snipeTax, quoteAsset.decimals)} ${quoteAsset.symbol}`}</dd></div> : null}
        {quote?.kind === "buy" && quote.quoteRefund > 0n ? <div><dt>{zh ? "达到毕业目标，退回" : "Refunded at graduation"}</dt><dd translate="no">{`${amountText(quote.quoteRefund, quoteAsset.decimals)} ${quoteAsset.symbol}`}</dd></div> : null}
      </dl>
      {quoteError ? <p className="fieldError" role="alert">{quoteError}</p> : null}
      {impact !== null && impact >= 1_000 ? <p className="fieldError">{zh ? `价格影响较大（${formatBps(impact)}），可考虑分批交易。` : `High price impact (${formatBps(impact)}). Consider a smaller trade.`}</p> : null}

      <SlippagePicker value={slippageBps} onChange={setSlippageBps} />

      <p className="tradeSteps fieldHint" translate="no">{steps.filter(Boolean).join(" → ")}{zh ? "。批准只针对本次金额。" : ". Approvals cover this trade only."}</p>
      <button type="button" className={side === "buy" ? "launchButton" : "secondaryCta"} disabled={disabled} onClick={() => void submit()}>
        {busy === "wrap" ? (zh ? "正在兑换…" : "Wrapping…") : busy === "approve" ? (zh ? "正在批准…" : "Approving…") : busy === "buy" ? (zh ? "正在买入…" : "Buying…") : busy === "sell" ? (zh ? "正在卖出…" : "Selling…") : busy === "unwrap" ? (zh ? "正在换回…" : "Unwrapping…") : !account ? (zh ? "连接钱包并交易" : "Connect wallet and trade") : side === "buy" ? <span translate="no">{zh ? `买入 ${symbol}` : `Buy ${symbol}`}</span> : <span translate="no">{zh ? `卖出 ${symbol}` : `Sell ${symbol}`}</span>}
      </button>
      {status ? <p className="tradeStatus" role="status">{status}</p> : null}
    </section>
  );
}
