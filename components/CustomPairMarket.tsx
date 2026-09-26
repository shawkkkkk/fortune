"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseAbi, parseUnits, type Address } from "viem";
import PairInspector from "@/components/PairInspector";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CUSTOM_PAIR_RULES, afterTax, pairForTokens, previewCurveBuy, shieldBpsAt } from "@/lib/custom-pairs";
import { CUSTOM_PAIR_CURVE_ABI } from "@/lib/custom-pairs-artifacts";
import type { CustomPairLaunchDetail } from "@/lib/custom-pairs-read";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatAmount, formatShare, formatUnitPrice, shortAddress } from "@/lib/market-format";
import type { PairInspection } from "@/lib/pair-inspector";
import { formatTaxBps } from "@/lib/pair-inspector-text";
import { connectWallet, connectedAccount, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;

function units(raw: string | bigint, decimals: number) {
  return Number(formatUnits(BigInt(raw), decimals));
}

function parseAmount(value: string, decimals: number) {
  const clean = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(clean) || (clean.split(".")[1] || "").length > decimals) return null;
  try {
    const parsed = parseUnits(clean, decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function phaseLabel(phase: CustomPairLaunchDetail["phase"]) {
  if (phase === "GraduationReady") return "Ready to graduate";
  if (phase === "Graduated") return "Graduated · Pancake V2";
  if (phase === "Rescued") return "Rescue open";
  return "On the curve";
}

export default function CustomPairMarket({ initial }: { initial: CustomPairLaunchDetail }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [launch, setLaunch] = useState(initial);
  const [inspection, setInspection] = useState<PairInspection | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [balances, setBalances] = useState<{ pair: bigint; token: bigint } | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => initial.blockTimestamp);

  const pair = launch.pair;
  const buyTax = inspection?.simulation.buy?.taxBps ?? 0;
  const sellTax = inspection?.simulation.sell?.taxBps ?? 0;
  const supply = BigInt(launch.supply);
  const virtualReserve = BigInt(launch.virtualReserve);
  const reserve = BigInt(launch.reserve);
  const target = BigInt(launch.graduationTarget);
  const price = Number(BigInt(launch.spotPriceX18)) / 1e18 / 10 ** pair.decimals;
  const marketCap = price * units(launch.totalSupply, 18);
  const graduated = launch.phase === "Graduated";
  const elapsed = now - launch.launchTimestamp;
  const shieldBps = shieldBpsAt(elapsed);
  const walletCapActive = elapsed < CUSTOM_PAIR_RULES.earlyWalletCapSeconds;
  const trading = launch.phase === "CurveActive";
  const impaired = BigInt(launch.pairBalance) < reserve;
  const rescueAt = launch.graduationReadyAt ? launch.graduationReadyAt + launch.rescueDelaySeconds : 0;
  const canRescue = launch.phase !== "Graduated" && launch.phase !== "Rescued" && (impaired || (launch.phase === "GraduationReady" && rescueAt > 0 && now >= rescueAt));
  const isFeeRecipient = Boolean(account && account.toLowerCase() === launch.creatorFeeRecipient.toLowerCase());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/v1/custom-pairs/${launch.curve}`, { cache: "no-store" });
      const body = await response.json();
      if (response.ok && body?.data) setLaunch(body.data);
    } catch {
      /* Keep the last good state. */
    }
  }, [launch.curve]);

  const refreshBalances = useCallback(async (wallet: Address | null) => {
    if (!wallet) return setBalances(null);
    try {
      const { publicClient } = walletClients(wallet);
      const [pairBalance, tokenBalance] = await Promise.all([
        publicClient.readContract({ address: pair.address, abi: ERC20, functionName: "balanceOf", args: [wallet] }),
        publicClient.readContract({ address: launch.token, abi: ERC20, functionName: "balanceOf", args: [wallet] }),
      ]);
      setBalances({ pair: pairBalance, token: tokenBalance });
    } catch {
      setBalances(null);
    }
  }, [pair.address, launch.token]);

  useEffect(() => {
    connectedAccount().then((wallet) => {
      setAccount(wallet);
      void refreshBalances(wallet);
    }).catch(() => undefined);
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    const poll = window.setInterval(() => void refresh(), 15_000);
    setNow(Math.floor(Date.now() / 1000));
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [refresh, refreshBalances]);

  const quote = useMemo(() => {
    if (!trading) return null;
    if (side === "buy") {
      const raw = parseAmount(amount, pair.decimals);
      if (!raw) return null;
      const received = afterTax(raw, buyTax);
      const preview = previewCurveBuy({
        supply,
        virtualReserve,
        reserve,
        target,
        received,
        shieldBps,
        protocolFeeBps: launch.protocolFeeBps,
        creatorFeeBps: launch.creatorFeeBps,
      });
      return {
        kind: "buy" as const,
        raw,
        taxed: raw - received,
        shield: preview.shield,
        fees: preview.protocolFee + preview.creatorFee,
        refund: preview.refund,
        tokens: preview.tokens,
        minOut: (preview.tokens * BigInt(10_000 - slippageBps)) / 10_000n,
        completes: preview.completesCurve,
        overCap: walletCapActive && preview.tokens > (supply * BigInt(CUSTOM_PAIR_RULES.earlyWalletCapBps)) / 10_000n,
      };
    }
    const raw = parseAmount(amount, 18);
    if (!raw) return null;
    const circulating = BigInt(launch.circulating);
    const tokens = raw > circulating ? circulating : raw;
    const gross = pairForTokens(supply, virtualReserve, reserve, tokens);
    const fee = (gross * BigInt(launch.protocolFeeBps)) / 10_000n + (gross * BigInt(launch.creatorFeeBps)) / 10_000n;
    const sent = gross - fee;
    const delivered = afterTax(sent, sellTax);
    return { kind: "sell" as const, raw: tokens, gross, fees: fee, sent, delivered, minOut: (delivered * BigInt(10_000 - slippageBps)) / 10_000n, taxed: sent - delivered };
  }, [trading, side, amount, pair.decimals, buyTax, sellTax, supply, virtualReserve, reserve, target, shieldBps, launch.protocolFeeBps, launch.creatorFeeBps, launch.circulating, slippageBps, walletCapActive]);

  async function run(label: string, action: (wallet: Address) => Promise<void>) {
    setBusy(true);
    setMessage(label);
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      await action(wallet);
      await Promise.all([refresh(), refreshBalances(wallet)]);
    } catch (error) {
      setMessage(walletErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function ensureAllowance(wallet: Address, token: Address, needed: bigint, symbol: string) {
    const { publicClient, walletClient } = walletClients(wallet);
    const allowance = await publicClient.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [wallet, launch.curve] });
    if (allowance >= needed) return;
    setMessage(zh ? `请在钱包中批准 ${symbol}…` : `Approve ${symbol} in your wallet…`);
    await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
    const hash = await walletClient.writeContract({ address: token, abi: ERC20, functionName: "approve", args: [launch.curve, needed] });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function trade() {
    if (!quote) return;
    await run(quote.kind === "buy" ? "Preparing your buy…" : "Preparing your sell…", async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      if (quote.kind === "buy") {
        await ensureAllowance(wallet, pair.address, quote.raw, pair.symbol);
        setMessage("Simulating the buy…");
        await publicClient.simulateContract({ account: wallet, address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "buy", args: [quote.raw, quote.minOut] });
        setMessage("Confirm the buy in your wallet…");
        await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
        const hash = await walletClient.writeContract({ address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "buy", args: [quote.raw, quote.minOut] });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The buy reverted.");
        setMessage(quote.completes ? "Bought. This buy completed the curve: anyone can now graduate it." : "Bought.");
      } else {
        await ensureAllowance(wallet, launch.token, quote.raw, launch.symbol);
        setMessage("Simulating the sell…");
        await publicClient.simulateContract({ account: wallet, address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "sell", args: [quote.raw, quote.minOut] });
        setMessage("Confirm the sell in your wallet…");
        await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
        const hash = await walletClient.writeContract({ address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "sell", args: [quote.raw, quote.minOut] });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The sell reverted.");
        setMessage("Sold.");
      }
      setAmount("");
    });
  }

  async function simpleCall(functionName: "graduate" | "activateRescue" | "claimCreatorFees", label: string, done: string) {
    await run(label, async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      await publicClient.simulateContract({ account: wallet, address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName });
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setMessage(done);
    });
  }

  async function redeem() {
    await run("Preparing your redemption…", async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      const held = await publicClient.readContract({ address: launch.token, abi: ERC20, functionName: "balanceOf", args: [wallet] });
      if (held === 0n) throw new Error(zh ? `该钱包没有 ${launch.symbol}。` : `This wallet holds no ${launch.symbol}.`);
      const expected = await publicClient.readContract({ address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "previewRescueRedeem", args: [held] });
      const minOut = afterTax(expected, sellTax) * BigInt(10_000 - slippageBps) / 10_000n;
      await ensureAllowance(wallet, launch.token, held, launch.symbol);
      await publicClient.simulateContract({ account: wallet, address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "rescueRedeem", args: [held, minOut] });
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: launch.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "rescueRedeem", args: [held, minOut] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The redemption reverted.");
      setMessage("Redeemed.");
    });
  }

  const progress = Math.min(100, launch.progressBps / 100);
  const pancakeUrl = `https://pancakeswap.finance/swap?chain=${FORTUNE_NETWORK.isMainnet ? "bsc" : "bscTestnet"}&inputCurrency=${pair.address}&outputCurrency=${launch.token}`;

  return (
    <>
      <div className="metricsGrid four customMarketMetrics">
        <div className="metric"><span>Price</span><strong translate="no">{formatUnitPrice(price)} {pair.symbol}</strong><small translate="no">{zh ? `每枚 ${launch.symbol} · ${graduated ? "PancakeSwap 资金池" : "曲线"}` : `per ${launch.symbol} · ${graduated ? "PancakeSwap pool" : "curve"}`}</small></div>
        <div className="metric"><span>Market cap</span><strong translate="no">{formatAmount(marketCap)} {pair.symbol}</strong><small translate="no">{zh ? `完全稀释，以 ${pair.symbol} 计` : `Fully diluted, in ${pair.symbol}`}</small></div>
        {graduated ? (
          <div className="metric"><span>Pool depth</span><strong translate="no">{formatAmount(units(launch.poolPairReserve ?? "0", pair.decimals))} {pair.symbol}</strong><small>LP burned forever</small></div>
        ) : (
          <div className="metric"><span>Curve reserve</span><strong translate="no">{formatAmount(units(launch.reserve, pair.decimals))} {pair.symbol}</strong><small translate="no">{zh ? "目标" : "of"} {formatAmount(units(launch.graduationTarget, pair.decimals))} {pair.symbol}</small></div>
        )}
        <div className="metric"><span>Trades</span><strong translate="no">{launch.tradeCount.toLocaleString("en-US")}</strong><small translate="no">{formatShare(units(launch.circulating, 18) / units(launch.supply, 18))} {zh ? "的供应量已流通" : "of supply circulating"}</small></div>
      </div>

      <div className="customProgress">
        <div className="progressHeader"><span>Graduation</span><strong translate="no">{progress.toFixed(2)}%</strong></div>
        <div className="progressTrack"><span style={{ width: progress + "%" }} /></div>
      </div>

      <div className="customMarketLayout">
        <section className="panel customTradePanel" aria-busy={busy}>
          <div className="holdingsHead">
            <div>
              <span className="eyebrow">{trading ? "TRADE ON THE CURVE" : phaseLabel(launch.phase).toUpperCase()}</span>
              {trading ? <h2 translate="no">{zh ? `买入或卖出 ${launch.symbol}` : `Buy or sell ${launch.symbol}`}</h2> : <h2>{launch.phase === "Graduated" ? "Trading moved to PancakeSwap" : launch.phase === "Rescued" ? "Redeem for your share" : "The curve is complete"}</h2>}
            </div>
            {account ? <span className="mutedSmall" translate="no">{shortAddress(account)}</span> : <button type="button" className="secondaryCta" onClick={() => void run("Connecting…", async () => setMessage(""))}>Connect wallet</button>}
          </div>

          {balances ? (
            <p className="fieldHint" translate="no">
              {zh ? "余额" : "Balance"}: {formatAmount(units(balances.pair, pair.decimals))} {pair.symbol} · {formatAmount(units(balances.token, 18))} {launch.symbol}
            </p>
          ) : null}

          {trading ? (
            <>
              <div className="tradeTabs" role="group" aria-label="Trade side">
                <button type="button" aria-pressed={side === "buy"} className={side === "buy" ? "active" : undefined} onClick={() => { setSide("buy"); setAmount(""); }}>Buy</button>
                <button type="button" aria-pressed={side === "sell"} className={side === "sell" ? "active" : undefined} onClick={() => { setSide("sell"); setAmount(""); }}>Sell</button>
              </div>
              <label><span translate="no">{side === "buy" ? (zh ? `支付 · ${pair.symbol}` : `You pay · ${pair.symbol}`) : (zh ? `卖出 · ${launch.symbol}` : `You sell · ${launch.symbol}`)}</span>
                <input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="0.0" />
              </label>
              {side === "sell" && balances?.token ? <button type="button" className="linkButton" onClick={() => setAmount(formatUnits(balances.token, 18))}>Max</button> : null}
              {shieldBps > 0 && side === "buy" ? (
                <p className="reviewWarning" translate="no">
                  {zh
                    ? `发行护盾生效中：这笔买入的 ${formatTaxBps(shieldBps)} 计入毕业流动性，${launch.launchTimestamp + CUSTOM_PAIR_RULES.snipeTaxSeconds - now} 秒后降为零。`
                    : `Launch Shield active: ${formatTaxBps(shieldBps)} of this buy goes to graduation liquidity. It reaches zero in ${launch.launchTimestamp + CUSTOM_PAIR_RULES.snipeTaxSeconds - now}s.`}
                </p>
              ) : null}

              {quote ? (
                <dl className="tradeQuote" translate="no">
                  {quote.kind === "buy" ? (
                    <>
                      {quote.taxed > 0n ? <div><dt>{zh ? `${pair.symbol} 转账税 ${formatTaxBps(buyTax)}` : `${pair.symbol} transfer tax ${formatTaxBps(buyTax)}`}</dt><dd>−{formatAmount(units(quote.taxed, pair.decimals))} {pair.symbol}</dd></div> : null}
                      {quote.shield > 0n ? <div><dt>{zh ? "发行护盾" : "Launch Shield"}</dt><dd>−{formatAmount(units(quote.shield, pair.decimals))} {pair.symbol}</dd></div> : null}
                      <div><dt>{zh ? "手续费" : "Fees"} {formatTaxBps(launch.protocolFeeBps + launch.creatorFeeBps)}</dt><dd>−{formatAmount(units(quote.fees, pair.decimals))} {pair.symbol}</dd></div>
                      {quote.refund > 0n ? <div><dt>{zh ? "退还（曲线完成）" : "Refunded (the curve completes)"}</dt><dd>≈ {formatAmount(units(afterTax(quote.refund, sellTax), pair.decimals))} {pair.symbol}</dd></div> : null}
                      <div className="firstBuyTotal"><dt>{zh ? "预计获得" : "You receive"}</dt><dd>≈ {formatAmount(units(quote.tokens, 18))} {launch.symbol}</dd></div>
                      <div><dt>{zh ? "最少获得" : "Minimum"}</dt><dd>{formatAmount(units(quote.minOut, 18))} {launch.symbol}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>{zh ? "曲线支付" : "Curve pays"}</dt><dd>{formatAmount(units(quote.gross, pair.decimals))} {pair.symbol}</dd></div>
                      <div><dt>{zh ? "手续费" : "Fees"} {formatTaxBps(launch.protocolFeeBps + launch.creatorFeeBps)}</dt><dd>−{formatAmount(units(quote.fees, pair.decimals))} {pair.symbol}</dd></div>
                      {quote.taxed > 0n ? <div><dt>{zh ? `${pair.symbol} 转账税 ${formatTaxBps(sellTax)}` : `${pair.symbol} transfer tax ${formatTaxBps(sellTax)}`}</dt><dd>−{formatAmount(units(quote.taxed, pair.decimals))} {pair.symbol}</dd></div> : null}
                      <div className="firstBuyTotal"><dt>{zh ? "到账" : "Reaches your wallet"}</dt><dd>≈ {formatAmount(units(quote.delivered, pair.decimals))} {pair.symbol}</dd></div>
                      <div><dt>{zh ? "最少到账" : "Minimum"}</dt><dd>{formatAmount(units(quote.minOut, pair.decimals))} {pair.symbol}</dd></div>
                    </>
                  )}
                </dl>
              ) : null}
              {quote?.kind === "buy" && quote.overCap ? <p className="fieldError" role="alert">Over the 2% early-wallet cap for the first 15 seconds. Lower the amount or wait.</p> : null}

              <div className="slippageRow" role="group" aria-label="Slippage tolerance">
                <span className="fieldHint">Slippage</span>
                {SLIPPAGE_OPTIONS.map((bps) => (
                  <button key={bps} type="button" className={slippageBps === bps ? "active" : undefined} aria-pressed={slippageBps === bps} onClick={() => setSlippageBps(bps)} translate="no">{formatTaxBps(bps)}</button>
                ))}
              </div>
              <button className="launchButton" disabled={busy || !quote || (quote.kind === "buy" && quote.overCap)} onClick={() => void trade()}>
                {busy ? (zh ? "处理中…" : "Working…") : side === "buy" ? (zh ? `买入 ${launch.symbol}` : `Buy ${launch.symbol}`) : (zh ? `卖出换取 ${pair.symbol}` : `Sell for ${pair.symbol}`)}
              </button>
              <p className="fieldHint" translate="no">{zh ? `滑点按扣除 ${pair.symbol} 转账税后实际到账的金额检查。` : `Slippage is checked against what actually reaches your wallet, after any ${pair.symbol} transfer tax.`}</p>
            </>
          ) : null}

          {launch.phase === "GraduationReady" ? (
            <div className="customPhaseAction">
              <p>The target is reached and trading is closed. Anyone can move the reserve into a new PancakeSwap V2 pool at the final curve price; the LP tokens are burned.</p>
              <button className="launchButton" disabled={busy} onClick={() => void simpleCall("graduate", "Preparing graduation…", "Graduated. Trading continues on PancakeSwap.")}>Graduate to PancakeSwap →</button>
            </div>
          ) : null}

          {launch.phase === "Graduated" ? (
            <div className="customPhaseAction">
              <p translate="no">
                {launch.poolReserves ? `${formatAmount(units(launch.poolReserves.pair, pair.decimals))} ${pair.symbol} + ${formatAmount(units(launch.poolReserves.launch, 18))} ${launch.symbol} ${zh ? "在池中，LP 已销毁。" : "in the pool, LP burned."}` : null}
              </p>
              <div className="heroActions">
                <a className="primaryCta" href={pancakeUrl} target="_blank" rel="noreferrer">Trade on PancakeSwap ↗</a>
                <a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/address/${launch.pool}`} target="_blank" rel="noreferrer">Pool ↗</a>
              </div>
              <p className="fieldHint" translate="no">{zh ? `当 ${pair.symbol} 收取转账税时，请使用路由器的“支持转账税”兑换；PancakeSwap 会自动处理。` : `Use the router's fee-on-transfer swap when ${pair.symbol} takes a transfer tax; PancakeSwap does this automatically.`}</p>
            </div>
          ) : null}

          {canRescue ? (
            <div className="customPhaseAction">
              <p translate="no">{zh
                ? `${impaired ? `曲线持有的 ${pair.symbol} 少于其储备。交易已停止，任何人都可以开启救援。` : "毕业已连续七天无法完成。任何人都可以开启救援。"}之后持有者可按比例赎回曲线持有的全部 ${pair.symbol}。`
                : `${impaired ? `The curve holds less ${pair.symbol} than its reserve. Trading is stopped and anyone can open rescue.` : "Graduation has been impossible for seven days. Anyone can open rescue."} Holders then redeem a pro-rata share of every ${pair.symbol} the curve holds.`}</p>
              <button className="secondaryCta" disabled={busy} onClick={() => void simpleCall("activateRescue", "Opening rescue…", "Rescue is open.")}>Open rescue</button>
            </div>
          ) : null}

          {launch.phase === "Rescued" ? (
            <div className="customPhaseAction">
              <p translate="no">{zh ? `销毁你的 ${launch.symbol}，按比例换取曲线持有的 ${pair.symbol}。` : `Burn your ${launch.symbol} for a pro-rata share of the ${pair.symbol} held by the curve.`}</p>
              <button className="launchButton" disabled={busy} onClick={() => void redeem()} translate="no">{zh ? `赎回我全部的 ${launch.symbol}` : `Redeem all my ${launch.symbol}`}</button>
            </div>
          ) : null}

          {isFeeRecipient && BigInt(launch.creatorFeesOwed) > 0n ? (
            <div className="customPhaseAction">
              <p translate="no">{zh ? "可领取创作者手续费" : "Creator fees to claim"}: {formatAmount(units(launch.creatorFeesOwed, pair.decimals))} {pair.symbol}</p>
              <button className="secondaryCta" disabled={busy} onClick={() => void simpleCall("claimCreatorFees", "Claiming creator fees…", "Creator fees claimed.")}>Claim creator fees</button>
            </div>
          ) : null}

          {message ? <p className="launchDescription" role="status">{message}</p> : null}
        </section>

        <div className="customMarketSide">
          <PairInspector address={pair.address} holder={account} onResult={setInspection} />

          <section className="panel customFacts">
            <span className="eyebrow">CONTRACTS</span>
            <div className="statRows">
              <div><span>Curve</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/address/${launch.curve}`} target="_blank" rel="noreferrer">{shortAddress(launch.curve)}</a></strong></div>
              <div><span>Token</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/token/${launch.token}`} target="_blank" rel="noreferrer">{shortAddress(launch.token)}</a></strong></div>
              <div><span>Pair token</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/token/${pair.address}`} target="_blank" rel="noreferrer">{pair.symbol} · {shortAddress(pair.address)}</a></strong></div>
              <div><span>Pancake V2 pool</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/address/${launch.pool}`} target="_blank" rel="noreferrer">{shortAddress(launch.pool)}</a></strong></div>
              <div><span>Creator</span><strong><Link translate="no" href={`/profile/${launch.creator}`}>{shortAddress(launch.creator)}</Link></strong></div>
              <div><span>Fees</span><strong translate="no">{formatTaxBps(launch.protocolFeeBps)} protocol · {formatTaxBps(launch.creatorFeeBps)} creator</strong></div>
              <div><span>Launch Shield reserve</span><strong translate="no">{formatAmount(units(launch.shieldReserve, pair.decimals))} {pair.symbol}</strong></div>
            </div>
            <p className="fieldHint">Custom-pair contracts are an unaudited beta, separate from Fortune&apos;s audited Standard launch.</p>
          </section>
        </div>
      </div>
    </>
  );
}
