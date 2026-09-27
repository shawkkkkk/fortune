"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, encodeFunctionData, formatUnits, http, parseEventLogs, parseUnits, zeroAddress, type Address } from "viem";
import { amountText } from "@/components/CurveTradePanel";
import { useLanguage } from "@/components/LanguageProvider";
import SlippagePicker, { useSlippage } from "@/components/SlippagePicker";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { ERC20_TRADE_ABI, PANCAKE_V3_POOL_ABI, PANCAKE_V3_QUOTER_ABI, PANCAKE_V3_ROUTER_ABI, WRAPPED_NATIVE_ABI } from "@/lib/trade-abis";
import { PANCAKE_V3, formatBps, isWrappedNative, maxSpendableNative, minimumOut, poolImpactBps } from "@/lib/trade-math";
import { walletChain, walletClients, walletErrorMessage } from "@/lib/wallet";

// After graduation, trade the launch's permanently locked PancakeSwap V3 pool
// without leaving Fortune: quotes from PancakeSwap's QuoterV2, swaps through
// its SwapRouter, BNB in and out handled by the router itself.

type Props = {
  token: Address;
  symbol: string;
  quoteAsset: { address: Address; symbol: string; decimals: number };
  account: Address | null;
  connect: () => Promise<Address>;
  onTraded: () => void;
};

type Pool = { address: Address; fee: number; tokenIsToken0: boolean };

const readClient = createPublicClient({ chain: walletChain, transport: http(FORTUNE_NETWORK.publicRpcUrl) });
const FACTORY_ABI = [{ type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] }] as const;
const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as Address;
const GRADUATION_FEE = Number(process.env.NEXT_PUBLIC_PANCAKE_V3_FEE_TIER || 500);
const TOKEN_DECIMALS = 18;

/** Output units per input unit at the pool's current mid price. */
function midPrice(pool: Pool, sqrtPriceX96: bigint, buying: boolean, quoteDecimals: number) {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  // token1 per token0, in whole units.
  const token1PerToken0 = ratio * ratio * 10 ** ((pool.tokenIsToken0 ? TOKEN_DECIMALS : quoteDecimals) - (pool.tokenIsToken0 ? quoteDecimals : TOKEN_DECIMALS));
  const quotePerToken = pool.tokenIsToken0 ? token1PerToken0 : 1 / token1PerToken0;
  return buying ? 1 / quotePerToken : quotePerToken;
}

export default function PoolTradePanel({ token, symbol, quoteAsset, account, connect, onTraded }: Props) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const periphery = PANCAKE_V3[FORTUNE_NETWORK.chainId];
  const wrapped = isWrappedNative(FORTUNE_NETWORK.chainId, quoteAsset.address);
  const [useNative, setUseNative] = useState(true);
  const native = wrapped && useNative;
  const unit = native ? FORTUNE_NETWORK.nativeSymbol : quoteAsset.symbol;

  const [pool, setPool] = useState<Pool | null>(null);
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint | null>(null);
  const [poolError, setPoolError] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [input, setInput] = useState("");
  const [slippageBps, setSlippageBps] = useSlippage();
  const [balances, setBalances] = useState({ native: 0n, quote: 0n, token: 0n });
  const [amountOut, setAmountOut] = useState<bigint | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");

  // The official pool: Fortune's markets API resolves it from the permanent LP locker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let address: Address | null = null;
      let fee = GRADUATION_FEE;
      try {
        const response = await fetch(`/api/public/v1/markets/${token}?range=24h`, { cache: "no-store" });
        const body = await response.json();
        const pairs: { address?: string; pool?: { address?: string; dex?: string; feeTier?: number } }[] = body?.data?.summary?.pairs ?? [];
        const official = pairs.find((pair) => pair.address?.toLowerCase() === quoteAsset.address.toLowerCase())?.pool;
        if (official?.dex === "pancake-v3" && official.address) {
          address = official.address as Address;
          fee = Number(official.feeTier) || fee;
        }
      } catch {
        // Fall back to the factory's pool at the graduation fee tier below.
      }
      if (!address) {
        const found = await readClient.readContract({ address: V3_FACTORY, abi: FACTORY_ABI, functionName: "getPool", args: [token, quoteAsset.address, fee] }).catch(() => zeroAddress);
        address = found !== zeroAddress ? found : null;
      }
      if (!address) {
        if (!cancelled) setPoolError(zh ? "未找到毕业后的 PancakeSwap V3 资金池。" : "The graduated PancakeSwap V3 pool could not be found.");
        return;
      }
      const [token0, slot0] = await Promise.all([
        readClient.readContract({ address, abi: PANCAKE_V3_POOL_ABI, functionName: "token0" }),
        readClient.readContract({ address, abi: PANCAKE_V3_POOL_ABI, functionName: "slot0" }),
      ]);
      if (!cancelled) {
        setPool({ address, fee, tokenIsToken0: token0.toLowerCase() === token.toLowerCase() });
        setSqrtPriceX96(slot0[0]);
      }
    })().catch(() => {
      if (!cancelled) setPoolError(zh ? "无法读取资金池。" : "The pool could not be read.");
    });
    return () => {
      cancelled = true;
    };
  }, [quoteAsset.address, token, zh]);

  const inputDecimals = side === "buy" ? quoteAsset.decimals : TOKEN_DECIMALS;
  const amount = useMemo(() => {
    try {
      const value = input.trim() ? parseUnits(input.trim(), inputDecimals) : 0n;
      return value > 0n ? value : 0n;
    } catch {
      return 0n;
    }
  }, [input, inputDecimals]);

  const refreshBalances = useCallback(async () => {
    if (!account) return;
    const [nativeBalance, quoteBalance, tokenBalance] = await Promise.all([
      readClient.getBalance({ address: account }),
      readClient.readContract({ address: quoteAsset.address, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [account] }),
      readClient.readContract({ address: token, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [account] }),
    ]);
    setBalances({ native: nativeBalance, quote: quoteBalance, token: tokenBalance });
  }, [account, quoteAsset.address, token]);

  useEffect(() => {
    void refreshBalances().catch(() => undefined);
  }, [refreshBalances]);

  const tokenIn = side === "buy" ? quoteAsset.address : token;
  const tokenOut = side === "buy" ? token : quoteAsset.address;

  // Quote a moment after typing stops, then keep the quote fresh every few
  // seconds without blanking it.
  const [quoteTick, setQuoteTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setQuoteTick((tick) => tick + 1), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const quoteRun = useRef(0);
  const quoteKey = useRef("");
  const quotedKey = useRef("");
  useEffect(() => {
    const key = `${tokenIn}:${tokenOut}:${amount}:${pool?.address}`;
    const changed = key !== quoteKey.current;
    quoteKey.current = key;
    if (changed) {
      quotedKey.current = "";
      setAmountOut(null);
      setQuoteError("");
    }
    if (!pool || !periphery || amount === 0n) return;
    const run = ++quoteRun.current;
    const timer = window.setTimeout(async () => {
      try {
        // The mid price is read with the quote so the impact compares like with like.
        const [{ result }, slot0] = await Promise.all([
          readClient.simulateContract({ address: periphery.quoter, abi: PANCAKE_V3_QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn: amount, fee: pool.fee, sqrtPriceLimitX96: 0n }] }),
          readClient.readContract({ address: pool.address, abi: PANCAKE_V3_POOL_ABI, functionName: "slot0" }),
        ]);
        if (run === quoteRun.current) {
          quotedKey.current = key;
          setSqrtPriceX96(slot0[0]);
          setAmountOut(result[0]);
          setQuoteError("");
        }
      } catch (error) {
        // A failed background refresh keeps the last good quote.
        if (run === quoteRun.current && quotedKey.current !== key) setQuoteError(walletErrorMessage(error, zh ? "资金池无法报价。" : "The pool could not quote this amount."));
      }
    }, changed ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [amount, periphery, pool, quoteTick, tokenIn, tokenOut, zh]);

  const spendable = side === "buy" ? (native ? maxSpendableNative(balances.native, 0n) : balances.quote) : balances.token;
  const insufficient = account !== null && amount > spendable;
  const outDecimals = side === "buy" ? TOKEN_DECIMALS : quoteAsset.decimals;
  const minOut = amountOut ? minimumOut(amountOut, slippageBps) : 0n;
  const impact = pool && sqrtPriceX96 && amountOut ? poolImpactBps(Number(formatUnits(amount, inputDecimals)), Number(formatUnits(amountOut, outDecimals)), midPrice(pool, sqrtPriceX96, side === "buy", quoteAsset.decimals)) : null;
  const pancakeUrl = `https://pancakeswap.finance/swap?chain=${FORTUNE_NETWORK.isMainnet ? "bsc" : "bscTestnet"}&inputCurrency=${wrapped ? "BNB" : quoteAsset.address}&outputCurrency=${token}`;

  async function submit() {
    if (!pool || !periphery || amount === 0n) return;
    setStatus("");
    try {
      const owner = account ?? (await connect());
      const { publicClient, walletClient } = walletClients(owner);
      const router = periphery.swapRouter;
      const payingNative = side === "buy" && native;
      if (!payingNative) {
        const allowance = await readClient.readContract({ address: tokenIn, abi: ERC20_TRADE_ABI, functionName: "allowance", args: [owner, router] });
        if (allowance < amount) {
          setBusy("approve");
          setStatus(zh ? "在钱包中批准本次交易金额。" : "Approve this trade's amount in your wallet.");
          const approveHash = await walletClient.writeContract({ address: tokenIn, abi: ERC20_TRADE_ABI, functionName: "approve", args: [router, amount] });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }
      const { result } = await readClient.simulateContract({ address: periphery.quoter, abi: PANCAKE_V3_QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn: amount, fee: pool.fee, sqrtPriceLimitX96: 0n }] });
      const minimum = minimumOut(result[0], slippageBps);
      // Twenty minutes of chain time; a device clock can be off.
      const deadline = (await readClient.getBlock()).timestamp + 1200n;
      const receivingNative = side === "sell" && native;
      const params = { tokenIn, tokenOut, fee: pool.fee, recipient: receivingNative ? zeroAddress : owner, deadline, amountIn: amount, amountOutMinimum: minimum, sqrtPriceLimitX96: 0n };
      setBusy("swap");
      setStatus(zh ? `确认兑换，至少获得 ${amountText(minimum, outDecimals)}。` : `Confirm the swap: at least ${amountText(minimum, outDecimals)} ${side === "buy" ? symbol : unit}.`);
      const outAsset = side === "buy" ? token : quoteAsset.address;
      let hash: `0x${string}`;
      if (receivingNative) {
        const calls = [
          encodeFunctionData({ abi: PANCAKE_V3_ROUTER_ABI, functionName: "exactInputSingle", args: [params] }),
          encodeFunctionData({ abi: PANCAKE_V3_ROUTER_ABI, functionName: "unwrapWETH9", args: [minimum, owner] }),
        ];
        const simulation = await publicClient.simulateContract({ account: owner, address: router, abi: PANCAKE_V3_ROUTER_ABI, functionName: "multicall", args: [calls] });
        hash = await walletClient.writeContract(simulation.request);
      } else {
        const simulation = await publicClient.simulateContract({ account: owner, address: router, abi: PANCAKE_V3_ROUTER_ABI, functionName: "exactInputSingle", args: [params], value: payingNative ? amount : 0n });
        hash = await walletClient.writeContract(simulation.request);
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(zh ? "兑换交易失败。" : "The swap transaction reverted.");
      // The exact output: the router's unwrap for BNB, otherwise the pool's transfer to the trader.
      const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
      const gained = receivingNative
        ? parseEventLogs({ abi: WRAPPED_NATIVE_ABI, eventName: "Withdrawal", logs: receipt.logs })
          .filter((log) => same(log.address, quoteAsset.address) && same(log.args.src, router))
          .reduce((sum, log) => sum + log.args.wad, 0n)
        : parseEventLogs({ abi: ERC20_TRADE_ABI, eventName: "Transfer", logs: receipt.logs })
          .filter((log) => same(log.address, outAsset) && same(log.args.from, pool.address) && same(log.args.to, owner))
          .reduce((sum, log) => sum + log.args.value, 0n);
      setStatus(receivingNative
        ? (zh ? `已卖出，获得 ${amountText(gained, 18)} ${FORTUNE_NETWORK.nativeSymbol}。` : `Sold for ${amountText(gained, 18)} ${FORTUNE_NETWORK.nativeSymbol}.`)
        : side === "buy"
          ? (zh ? `已买入 ${amountText(gained, TOKEN_DECIMALS)} ${symbol}。` : `Bought ${amountText(gained, TOKEN_DECIMALS)} ${symbol}.`)
          : (zh ? `已卖出，获得 ${amountText(gained, quoteAsset.decimals)} ${quoteAsset.symbol}。` : `Sold for ${amountText(gained, quoteAsset.decimals)} ${quoteAsset.symbol}.`));
      setInput("");
      onTraded();
      await refreshBalances();
    } catch (error) {
      setStatus(walletErrorMessage(error, zh ? "兑换未完成。" : "The swap did not go through."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel tradePanel curveTrade" aria-label={zh ? "在 PancakeSwap 资金池交易" : "Trade the PancakeSwap pool"}>
      <div className="poolTradeHead">
        <span className="eyebrow">{zh ? "PANCAKESWAP V3 · 已毕业" : "PANCAKESWAP V3 · GRADUATED"}</span>
        <a href={pancakeUrl} target="_blank" rel="noreferrer">{zh ? "在 PancakeSwap 打开 ↗" : "Open on PancakeSwap ↗"}</a>
      </div>
      {poolError ? <p className="fieldError" role="alert">{poolError}</p> : null}
      <div className="tradeSides" role="tablist" aria-label={zh ? "买入或卖出" : "Buy or sell"}>
        {(["buy", "sell"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={side === value} className={side === value ? "active" : ""} onClick={() => { setSide(value); setInput(""); }}>
            {value === "buy" ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}
          </button>
        ))}
      </div>
      {wrapped ? (
        <label className="tradeNative">
          <input type="checkbox" checked={useNative} onChange={(event) => setUseNative(event.target.checked)} />
          <span translate="no">{side === "buy" ? (zh ? `用 ${FORTUNE_NETWORK.nativeSymbol} 支付` : `Pay with ${FORTUNE_NETWORK.nativeSymbol}`) : (zh ? `收到 ${FORTUNE_NETWORK.nativeSymbol}` : `Receive ${FORTUNE_NETWORK.nativeSymbol}`)}</span>
        </label>
      ) : null}
      <label>
        <span translate="no">{side === "buy" ? (zh ? `支付 · ${unit}` : `You pay · ${unit}`) : (zh ? `卖出 · ${symbol}` : `You sell · ${symbol}`)}</span>
        <input value={input} inputMode="decimal" autoComplete="off" placeholder="0" onChange={(event) => setInput(event.target.value.replace(",", "."))} aria-invalid={insufficient || undefined} />
      </label>
      <div className="tradeQuick">
        <span className="mutedSmall" translate="no">{zh ? "余额 " : "Balance "}{account ? `${amountText(spendable, inputDecimals)} ${side === "buy" ? unit : symbol}` : "—"}</span>
        <span>
          {[25n, 50n, 100n].map((fraction) => (
            <button key={String(fraction)} type="button" disabled={!account || spendable === 0n} onClick={() => setInput(formatUnits((spendable * fraction) / 100n, inputDecimals))}>{fraction === 100n ? (zh ? "最大" : "Max") : `${fraction}%`}</button>
          ))}
        </span>
      </div>
      {insufficient ? <p className="fieldError" role="alert">{zh ? "余额不足。" : "That is more than your balance."}</p> : null}
      <dl className="tradeQuote" aria-live="polite">
        <div><dt>{zh ? "预计获得" : "You receive"}</dt><dd translate="no">{amountOut !== null ? `${amountText(amountOut, outDecimals)} ${side === "buy" ? symbol : unit}` : "—"}</dd></div>
        <div><dt>{zh ? `最少获得（滑点 ${formatBps(slippageBps)}）` : `Minimum (slippage ${formatBps(slippageBps)})`}</dt><dd translate="no">{amountOut !== null ? amountText(minOut, outDecimals) : "—"}</dd></div>
        <div><dt>{zh ? "价格影响（含资金池费）" : "Price impact (incl. pool fee)"}</dt><dd translate="no">{impact !== null ? formatBps(impact) : "—"}</dd></div>
        <div><dt>{zh ? "资金池费率" : "Pool fee"}</dt><dd translate="no">{pool ? formatBps(pool.fee / 100) : "—"}</dd></div>
      </dl>
      {quoteError ? <p className="fieldError" role="alert">{quoteError}</p> : null}
      {impact !== null && impact >= 1_000 ? <p className="fieldError">{zh ? `价格影响较大（${formatBps(impact)}）。` : `High price impact (${formatBps(impact)}).`}</p> : null}
      <SlippagePicker value={slippageBps} onChange={setSlippageBps} />
      <p className="tradeSteps fieldHint" translate="no">{side === "buy" && native ? (zh ? `一笔交易完成：${FORTUNE_NETWORK.nativeSymbol} 由路由自动换成 ${quoteAsset.symbol}。` : `One transaction: the router wraps your ${FORTUNE_NETWORK.nativeSymbol}.`) : side === "sell" && native ? (zh ? `批准本次金额，然后一笔交易卖出并换回 ${FORTUNE_NETWORK.nativeSymbol}。` : `Approve this amount, then one transaction sells and unwraps to ${FORTUNE_NETWORK.nativeSymbol}.`) : (zh ? "批准本次金额，然后兑换。" : "Approve this amount, then swap.")}</p>
      <button type="button" className={side === "buy" ? "launchButton" : "secondaryCta"} disabled={Boolean(busy) || !pool || amount === 0n || amountOut === null || insufficient} onClick={() => void submit()}>
        {busy === "approve" ? (zh ? "正在批准…" : "Approving…") : busy === "swap" ? (zh ? "正在兑换…" : "Swapping…") : !account ? (zh ? "连接钱包并交易" : "Connect wallet and trade") : side === "buy" ? <span translate="no">{zh ? `买入 ${symbol}` : `Buy ${symbol}`}</span> : <span translate="no">{zh ? `卖出 ${symbol}` : `Sell ${symbol}`}</span>}
      </button>
      {status ? <p className="tradeStatus" role="status">{status}</p> : null}
    </section>
  );
}
