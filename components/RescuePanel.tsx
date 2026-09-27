"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, parseEventLogs, parseUnits, type Address } from "viem";
import { amountText } from "@/components/CurveTradePanel";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CURVE_TRADE_ABI, ERC20_TRADE_ABI, WRAPPED_NATIVE_ABI } from "@/lib/trade-abis";
import { isWrappedNative, rescueOpensAt, rescuePayout } from "@/lib/trade-math";
import { walletChain, walletClients, walletErrorMessage } from "@/lib/wallet";

// A curve that reached its graduation target but could not graduate for seven
// days can be put into rescue by anyone. Holders then hand back tokens for a
// pro-rata share of every quote reserve the curve still holds.

type Props = {
  curve: Address;
  token: Address;
  symbol: string;
  quotes: { address: Address; symbol: string; decimals: number }[];
  rescued: boolean;
  graduationReadyAt: number;
  clockOffset: number;
  account: Address | null;
  connect: () => Promise<Address>;
  onDone: () => void;
};

const readClient = createPublicClient({ chain: walletChain, transport: http(FORTUNE_NETWORK.publicRpcUrl) });
const TOKEN_DECIMALS = 18;

/** Wrapped BNB is paid out as BNB: redeem unwraps it in the same flow. */
function receiveSymbol(quote: { address: Address; symbol: string }) {
  return isWrappedNative(FORTUNE_NETWORK.chainId, quote.address) ? FORTUNE_NETWORK.nativeSymbol : quote.symbol;
}

function untilText(seconds: number, zh: boolean) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.max(1, Math.ceil((seconds % 3_600) / 60));
  if (days > 0) return zh ? `${days} 天 ${hours} 小时` : `${days} d ${hours} h`;
  if (hours > 0) return zh ? `${hours} 小时 ${minutes} 分钟` : `${hours} h ${minutes} min`;
  return zh ? `${minutes} 分钟` : `${minutes} min`;
}

export default function RescuePanel({ curve, token, symbol, quotes, rescued, graduationReadyAt, clockOffset, account, connect, onDone }: Props) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [state, setState] = useState<{ supply: bigint; redeemed: bigint; reserves: bigint[]; balance: bigint } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!rescued) return;
    const [supply, redeemed, reserves, balance] = await Promise.all([
      readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "rescueSupply" }),
      readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "rescueRedeemed" }),
      Promise.all(quotes.map((quote) => readClient.readContract({ address: curve, abi: CURVE_TRADE_ABI, functionName: "reserve", args: [quote.address] }))),
      account ? readClient.readContract({ address: token, abi: ERC20_TRADE_ABI, functionName: "balanceOf", args: [account] }) : Promise.resolve(0n),
    ]);
    setState({ supply, redeemed, reserves, balance });
  }, [account, curve, quotes, rescued, token]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const chainNow = Math.floor(now + clockOffset);
  const opensAt = rescueOpensAt(graduationReadyAt);
  const canOpen = !rescued && opensAt !== null && chainNow >= opensAt;

  let amount = 0n;
  try {
    amount = input.trim() ? parseUnits(input.trim(), TOKEN_DECIMALS) : state?.balance ?? 0n;
  } catch {
    amount = 0n;
  }
  const payouts = state ? state.reserves.map((reserve) => rescuePayout(reserve, amount, state.supply, state.redeemed)) : [];

  async function openRescue() {
    setStatus("");
    try {
      const owner = account ?? (await connect());
      const { publicClient, walletClient } = walletClients(owner);
      setBusy("open");
      const simulation = await publicClient.simulateContract({ account: owner, address: curve, abi: CURVE_TRADE_ABI, functionName: "activateRescue" });
      const hash = await walletClient.writeContract(simulation.request);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(zh ? "救援已开启，持有人现在可以赎回。" : "Rescue is open. Holders can now redeem.");
      onDone();
    } catch (error) {
      setStatus(walletErrorMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function redeem() {
    if (!state || amount === 0n) return;
    setStatus("");
    try {
      const owner = account ?? (await connect());
      const { publicClient, walletClient } = walletClients(owner);
      const allowance = await readClient.readContract({ address: token, abi: ERC20_TRADE_ABI, functionName: "allowance", args: [owner, curve] });
      if (allowance < amount) {
        setBusy("approve");
        setStatus(zh ? `批准 ${amountText(amount, TOKEN_DECIMALS)} ${symbol}（仅本次金额）。` : `Approve ${amountText(amount, TOKEN_DECIMALS)} ${symbol} (this redemption only).`);
        const approveHash = await walletClient.writeContract({ address: token, abi: ERC20_TRADE_ABI, functionName: "approve", args: [curve, amount] });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      // The share per token cannot fall as others redeem, so the preview is the floor.
      const minOut = payouts.map((payout) => (payout * 999n) / 1000n);
      setBusy("redeem");
      const simulation = await publicClient.simulateContract({ account: owner, address: curve, abi: CURVE_TRADE_ABI, functionName: "rescueRedeem", args: [amount, minOut] });
      const hash = await walletClient.writeContract(simulation.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(zh ? "赎回交易失败。" : "The redemption transaction reverted.");
      // What the curve actually paid out, per quote asset.
      const transfers = parseEventLogs({ abi: ERC20_TRADE_ABI, eventName: "Transfer", logs: receipt.logs });
      const paid = quotes.map((quote) => transfers
        .filter((log) => log.address.toLowerCase() === quote.address.toLowerCase() && log.args.from.toLowerCase() === curve.toLowerCase() && log.args.to.toLowerCase() === owner.toLowerCase())
        .reduce((sum, log) => sum + log.args.value, 0n));
      const wrappedIndex = quotes.findIndex((quote) => isWrappedNative(FORTUNE_NETWORK.chainId, quote.address));
      let unwrapped = false;
      if (wrappedIndex >= 0 && paid[wrappedIndex] > 0n) {
        setBusy("unwrap");
        try {
          const unwrapHash = await walletClient.writeContract({ address: quotes[wrappedIndex].address, abi: WRAPPED_NATIVE_ABI, functionName: "withdraw", args: [paid[wrappedIndex]] });
          await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
          unwrapped = true;
        } catch {
          // The redemption stands; the share stays wrapped.
        }
      }
      const received = quotes
        .map((quote, index) => paid[index] > 0n ? `${amountText(paid[index], quote.decimals)} ${index === wrappedIndex && unwrapped ? FORTUNE_NETWORK.nativeSymbol : quote.symbol}` : "")
        .filter(Boolean)
        .join(" + ");
      setStatus(zh ? `已赎回${received ? `，获得 ${received}` : ""}。` : `Redeemed${received ? ` for ${received}` : ""}.`);
      setInput("");
      onDone();
      await refresh();
    } catch (error) {
      setStatus(walletErrorMessage(error));
    } finally {
      setBusy("");
    }
  }

  if (!rescued) {
    return (
      <section className="panel rescuePanel" aria-label={zh ? "毕业救援" : "Graduation rescue"}>
        <span className="eyebrow">{zh ? "持有人保护 · 救援" : "HOLDER PROTECTION · RESCUE"}</span>
        <p>
          {zh
            ? "如果毕业一直无法完成，达到目标 7 天后任何人都可以开启救援，持有人可按比例赎回曲线中的储备。"
            : "If graduation keeps failing, anyone can open rescue seven days after the target was reached. Holders then redeem a pro-rata share of the curve's reserve."}
        </p>
        {opensAt !== null ? (
          <p className="fieldHint" translate="no">
            {canOpen
              ? (zh ? "现在可以开启救援。" : "Rescue can be opened now.")
              : (zh ? `救援将于 ${new Date(opensAt * 1000).toLocaleString("zh-CN")} 可开启（还有 ${untilText(opensAt - chainNow, true)}）。` : `Rescue opens ${new Date(opensAt * 1000).toLocaleString("en-US")} (in ${untilText(opensAt - chainNow, false)}).`)}
          </p>
        ) : null}
        {canOpen ? <button type="button" className="secondaryCta" disabled={Boolean(busy)} onClick={() => void openRescue()}>{busy ? (zh ? "正在开启…" : "Opening…") : (zh ? "开启救援" : "Open rescue")}</button> : null}
        {status ? <p className="tradeStatus" role="status">{status}</p> : null}
      </section>
    );
  }

  return (
    <section className="panel rescuePanel tradePanel" aria-label={zh ? "救援赎回" : "Rescue redemption"}>
      <span className="eyebrow">{zh ? "救援已开启" : "RESCUE OPEN"}</span>
      <h2>{zh ? "赎回你的储备份额" : "Redeem your share of the reserve"}</h2>
      <p className="fieldHint">{zh ? "交还代币，按比例领取曲线仍持有的每种计价资产。" : "Hand back tokens for a pro-rata share of every quote asset the curve still holds."}</p>
      <label>
        <span translate="no">{zh ? `交还 · ${symbol}` : `You hand back · ${symbol}`}</span>
        <input value={input} inputMode="decimal" placeholder={state ? formatUnits(state.balance, TOKEN_DECIMALS) : "0"} onChange={(event) => setInput(event.target.value.replace(",", "."))} />
      </label>
      <dl className="tradeQuote">
        {quotes.map((quote, index) => (
          <div key={quote.address}><dt translate="no">{zh ? `获得 ${receiveSymbol(quote)}` : `You receive ${receiveSymbol(quote)}`}</dt><dd translate="no">{state ? amountText(payouts[index] ?? 0n, quote.decimals) : "—"}</dd></div>
        ))}
      </dl>
      <button type="button" className="launchButton" disabled={Boolean(busy) || !state || amount === 0n} onClick={() => void redeem()}>
        {busy === "approve" ? (zh ? "正在批准…" : "Approving…") : busy === "redeem" ? (zh ? "正在赎回…" : "Redeeming…") : busy === "unwrap" ? (zh ? `正在换回 ${FORTUNE_NETWORK.nativeSymbol}…` : "Unwrapping…") : !account ? (zh ? "连接钱包并赎回" : "Connect wallet and redeem") : (zh ? "赎回" : "Redeem")}
      </button>
      {status ? <p className="tradeStatus" role="status">{status}</p> : null}
    </section>
  );
}
