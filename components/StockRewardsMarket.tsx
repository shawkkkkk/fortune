"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, hexToString, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { chainClockSkew, shieldBpsAt } from "@/lib/custom-pairs";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatAmount, formatHours, formatPrice, formatShare, formatUsd, shortAddress } from "@/lib/market-format";
import { graduationGasLimit } from "@/lib/graduation-gas";
import { formatTaxBps } from "@/lib/pair-inspector-text";
import { STOCK_REWARDS, STOCK_REWARDS_RULES, graduationPlan, streamProgress, withRewardsHeadroom } from "@/lib/stock-rewards";
import {
  STOCK_REWARDS_CURVE_ABI,
  STOCK_REWARDS_FACTORY_ABI,
  STOCK_REWARDS_FEE_ROUTER_ABI,
  STOCK_REWARDS_TOKEN_ABI,
  TEST_STOCK_ABI,
} from "@/lib/stock-rewards-artifacts";
import type { BasketStock, StockRewardsLaunchDetail } from "@/lib/stock-rewards-read";
import { connectWallet, connectedAccount, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;

type Quote =
  | { kind: "buy"; amountIn: bigint; spent: bigint; refund: bigint; shield: bigint; fee: bigint; tokens: bigint; minOut: bigint }
  | { kind: "sell"; amountIn: bigint; gross: bigint; fee: bigint; out: bigint; minOut: bigint };

const CURVE_REASONS: Record<string, { en: string; zh: string }> = {
  FIXED_ASSET_FILLED: { en: "This stock's share of the raise is full. Pay with another stock.", zh: "该股票的筹集份额已满，请改用其他股票支付。" },
  INSUFFICIENT_QUOTE_RESERVE: { en: "The curve holds too little of this stock for that sell. Sell less, or take another stock.", zh: "曲线中该股票不足以完成这笔卖出。请减少数量或换一只股票。" },
  GRADUATION_THRESHOLD_REACHED: { en: "The curve has reached its target.", zh: "曲线已达到目标。" },
  TRADING_CLOSED: { en: "Trading on the curve is closed.", zh: "曲线交易已关闭。" },
  STALE_PRICE: { en: "This stock's price is stale. Try again shortly.", zh: "该股票价格已过期，请稍后再试。" },
  BAD_TOKEN_AMOUNT: { en: "That is more than has been sold on the curve.", zh: "数量超过曲线已售出的数量。" },
  INSUFFICIENT_CURVE_TOKENS: { en: "The curve does not have that many tokens left.", zh: "曲线剩余代币不足。" },
  LAUNCH_SHIELD_WALLET_CAP: { en: "Over the 2% early-wallet cap for the first 15 seconds. Lower the amount or wait.", zh: "超过前 15 秒每个钱包 2% 的上限。请减少数量或稍候。" },
  SLIPPAGE: { en: "The price moved past your slippage. Try again.", zh: "价格变动超过滑点设置，请重试。" },
};

function curveReason(error: unknown, zh: boolean) {
  const text = error instanceof Error ? error.message : String(error ?? "");
  for (const [code, reason] of Object.entries(CURVE_REASONS)) {
    if (text.includes(code)) return zh ? reason.zh : reason.en;
  }
  return null;
}

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

function phaseLabel(phase: StockRewardsLaunchDetail["phase"], zh: boolean) {
  if (phase === "GraduationReady") return zh ? "可以毕业" : "Ready to graduate";
  if (phase === "Graduated") return zh ? "已毕业 · PancakeSwap V3" : "Graduated · PancakeSwap V3";
  if (phase === "Rescued") return zh ? "救援已开启" : "Rescue open";
  return zh ? "曲线交易中" : "On the curve";
}

export default function StockRewardsMarket({ initial }: { initial: StockRewardsLaunchDetail }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [launch, setLaunch] = useState(initial);
  const [account, setAccount] = useState<Address | null>(null);
  const [balances, setBalances] = useState<{ token: bigint; stocks: bigint[] } | null>(null);
  const [claimable, setClaimable] = useState<{ amounts: bigint[]; at: number } | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [stockIndex, setStockIndex] = useState(0);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => initial.blockTimestamp);
  const skew = useRef(0);
  const syncClock = useCallback((blockTimestamp: number) => {
    const device = Date.now() / 1000;
    skew.current = chainClockSkew(blockTimestamp, device);
    setNow(Math.floor(device) + skew.current);
  }, []);

  const stocks = launch.stocks;
  const stock = stocks[Math.min(stockIndex, stocks.length - 1)];
  const trading = launch.phase === "CurveActive";
  const graduated = launch.phase === "Graduated";
  const price = units(launch.priceUsd1e18, 18);
  const marketCap = price * units(launch.totalSupply, 18);
  const elapsed = now - launch.launchTimestamp;
  const shieldBps = shieldBpsAt(elapsed);
  const walletCapActive = elapsed < STOCK_REWARDS_RULES.earlyWalletCapSeconds;
  const rescueAt = launch.graduationReadyAt ? launch.graduationReadyAt + launch.rescueDelaySeconds : 0;
  const canRescue = launch.phase === "GraduationReady" && rescueAt > 0 && now >= rescueAt;
  const isCreator = Boolean(account && account.toLowerCase() === launch.creator.toLowerCase());
  const filled = (item: BasketStock) => BigInt(item.reserveUsd1e18) >= BigInt(item.targetUsd1e18);
  const lifetimeUsd = stocks.reduce((sum, item) => sum + units(item.rewards.totalReceived, item.decimals) * units(item.priceUsd1e18, 18), 0);
  const waiting = stocks.some((item) => BigInt(item.rewards.waiting) > 0n);
  const uncollected = stocks.some((item) => item.poolFees && (BigInt(item.poolFees.stock) > 0n || BigInt(item.poolFees.token) > 0n));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/v1/stock-rewards/${launch.curve}`, { cache: "no-store" });
      const body = await response.json();
      if (response.ok && body?.data) {
        setLaunch(body.data);
        syncClock(body.data.blockTimestamp);
      }
    } catch {
      /* Keep the last good state. */
    }
  }, [launch.curve, syncClock]);

  // Stable across refreshes, so polling does not restart the wallet reads.
  const stockKey = launch.stocks.map((item) => item.address).join(",");
  const refreshWallet = useCallback(async (wallet: Address | null) => {
    if (!wallet) {
      setBalances(null);
      setClaimable(null);
      return;
    }
    try {
      const { publicClient } = walletClients(wallet);
      const addresses = stockKey.split(",") as Address[];
      const [token, stockBalances, owed] = await Promise.all([
        publicClient.readContract({ address: launch.token, abi: ERC20, functionName: "balanceOf", args: [wallet] }),
        Promise.all(addresses.map((address) => publicClient.readContract({ address, abi: ERC20, functionName: "balanceOf", args: [wallet] }))),
        publicClient.readContract({ address: launch.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "claimable", args: [wallet] }) as Promise<
          readonly [readonly Address[], readonly bigint[]]
        >,
      ]);
      setBalances({ token, stocks: stockBalances });
      setClaimable({ amounts: [...owed[1]], at: Math.floor(Date.now() / 1000) + skew.current });
    } catch {
      setBalances(null);
    }
  }, [launch.token, stockKey]);

  useEffect(() => {
    connectedAccount().then((wallet) => {
      setAccount(wallet);
      void refreshWallet(wallet);
    }).catch(() => undefined);
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000) + skew.current), 1_000);
    const poll = window.setInterval(() => void refresh(), 15_000);
    syncClock(initial.blockTimestamp);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [refresh, refreshWallet, syncClock, initial.blockTimestamp]);

  useEffect(() => {
    if (!account) return undefined;
    const poll = window.setInterval(() => void refreshWallet(account), 15_000);
    return () => window.clearInterval(poll);
  }, [account, refreshWallet]);

  // The exact quote, from the curve itself at current oracle prices.
  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!trading || !stock) return undefined;
    const raw = parseAmount(amount, side === "buy" ? stock.decimals : 18);
    if (!raw) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { publicClient } = walletClients(account ?? launch.creator);
        if (side === "buy") {
          const preview = (await publicClient.readContract({ address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "previewBuy", args: [stock.address, raw] })) as readonly bigint[];
          const [spent, refund, shield, fee, , , tokens] = preview;
          if (!cancelled) setQuote({ kind: "buy", amountIn: raw, spent, refund, shield, fee, tokens, minOut: (tokens * BigInt(10_000 - slippageBps)) / 10_000n });
        } else {
          const preview = (await publicClient.readContract({ address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "previewSell", args: [stock.address, raw] })) as readonly bigint[];
          const [gross, fee, out] = preview;
          if (!cancelled) setQuote({ kind: "sell", amountIn: raw, gross, fee, out, minOut: (out * BigInt(10_000 - slippageBps)) / 10_000n });
        }
      } catch (error) {
        if (!cancelled) setQuoteError(curveReason(error, zh) ?? (zh ? "无法报价这笔交易。" : "This trade could not be quoted."));
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trading, stock, amount, side, slippageBps, account, launch.curve, launch.creator, zh, launch.blockNumber]);

  async function run(label: string, action: (wallet: Address) => Promise<void>) {
    setBusy(true);
    setMessage(label);
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      await action(wallet);
      await Promise.all([refresh(), refreshWallet(wallet)]);
    } catch (error) {
      setMessage(curveReason(error, zh) ?? walletErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sends a call with room for the token's once-per-block reward release. Calls that catch
   * their own failures (graduation, pool-fee collection) pass a fixed `gas`: an estimate would
   * settle on a limit at which the inner work runs out of gas and is caught, and they `expect`
   * a simulated result that proves the inner work ran.
   */
  async function send(
    wallet: Address,
    request: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] },
    failed: string,
    options: { gas?: bigint; expect?: (result: unknown) => string | null } = {}
  ) {
    const { publicClient, walletClient } = walletClients(wallet);
    const call = { account: wallet, address: request.address, abi: request.abi, functionName: request.functionName, args: request.args ?? [] };
    const { result } = await publicClient.simulateContract({ ...call, ...(options.gas ? { gas: options.gas } : {}) } as never);
    const problem = options.expect?.(result);
    if (problem) throw new Error(problem);
    const gas = options.gas ?? withRewardsHeadroom(await publicClient.estimateContractGas(call as never), stocks.length);
    await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
    const hash = await walletClient.writeContract({ ...call, gas } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
    if (receipt.status !== "success") throw new Error(failed);
    return publicClient;
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
    if (!quote || !stock) return;
    if (quote.kind === "buy") {
      await run(zh ? "正在准备买入…" : "Preparing your buy…", async (wallet) => {
        await ensureAllowance(wallet, stock.address, quote.amountIn, stock.symbol);
        setMessage(zh ? "请在钱包中确认买入…" : "Confirm the buy in your wallet…");
        await send(wallet, { address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "buy", args: [stock.address, quote.amountIn, quote.minOut] }, zh ? "买入被回滚。" : "The buy reverted.");
        setMessage(quote.refund > 0n
          ? (zh ? `已买入。${stock.symbol} 的份额已满，未用完的部分已退还。` : `Bought. ${stock.symbol}'s share filled, so the rest came back to you.`)
          : (zh ? "已买入。" : "Bought."));
        setAmount("");
      });
    } else {
      await run(zh ? "正在准备卖出…" : "Preparing your sell…", async (wallet) => {
        await ensureAllowance(wallet, launch.token, quote.amountIn, launch.symbol);
        setMessage(zh ? "请在钱包中确认卖出…" : "Confirm the sell in your wallet…");
        await send(wallet, { address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "sell", args: [stock.address, quote.amountIn, quote.minOut] }, zh ? "卖出被回滚。" : "The sell reverted.");
        setMessage(zh ? "已卖出。" : "Sold.");
        setAmount("");
      });
    }
  }

  async function claim() {
    await run(zh ? "正在领取你的股票…" : "Claiming your stocks…", async (wallet) => {
      await send(wallet, { address: launch.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "claim" }, zh ? "领取被回滚。" : "The claim reverted.");
      setMessage(zh ? "已领取。股票已到你的钱包。" : "Claimed. The stocks are in your wallet.");
    });
  }

  async function sync() {
    await run(zh ? "正在开始分发新到账的奖励…" : "Starting new rewards…", async (wallet) => {
      await send(wallet, { address: launch.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "sync" }, zh ? "交易被回滚。" : "The transaction reverted.");
      setMessage(zh ? "新到账的奖励将在接下来 6 小时内分发给持有者。" : "New rewards now stream to holders over the next 6 hours.");
    });
  }

  async function collectPoolFees() {
    if (!STOCK_REWARDS.factory) return;
    const factory = STOCK_REWARDS.factory;
    await run(zh ? "正在收取资金池手续费…" : "Collecting pool fees…", async (wallet) => {
      const positions = launch.positionIds.length;
      await send(wallet, { address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "collectPoolFees", args: [launch.token] }, zh ? "收取被回滚。" : "The collection reverted.", {
        // Each locked position's collection runs inside try/catch.
        gas: 200_000n + 400_000n * BigInt(Math.max(1, positions)) + withRewardsHeadroom(0n, stocks.length),
        expect: (collected) => (Number(collected) < positions ? (zh ? "有资金池暂时无法收取手续费，请稍后再试。" : "A pool's fees could not be collected right now. Try again shortly.") : null),
      });
      setMessage(zh ? "已收取。股票部分将在 6 小时内分发给持有者，代币部分已销毁。" : "Collected. The stock side streams to holders over 6 hours; the token side was burned.");
    });
  }

  async function graduate() {
    if (!STOCK_REWARDS.factory) return;
    const factory = STOCK_REWARDS.factory;
    await run(zh ? "正在准备毕业…" : "Preparing graduation…", async (wallet) => {
      const { publicClient } = walletClients(wallet);
      const plan = graduationPlan(stocks.length, launch.poolFee, Math.floor(Date.now() / 1000) + skew.current + 15 * 60);
      const adapter = (await publicClient.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "graduationAdapter" })) as Address;
      const [ready, reason] = (await publicClient.readContract({ address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "preflightGraduation", args: [adapter, plan] })) as readonly [boolean, Hex];
      if (!ready) {
        const code = hexToString(reason).replace(/\0/g, "");
        throw new Error(zh ? `目前还不能毕业：${code}` : `Graduation cannot go through yet: ${code}`);
      }
      setMessage(zh ? "请在钱包中确认毕业…" : "Confirm graduation in your wallet…");
      const notGraduated = zh ? "毕业未完成，已记录在链上，可以重试。" : "Graduation did not go through; the attempt is recorded and can be retried.";
      // The factory catches a failed migration (see lib/graduation-gas.ts), so it sends a
      // fixed limit, checks the simulated result, and reads the curve afterwards.
      const client = await send(wallet, { address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "graduate", args: [launch.curve, plan] }, notGraduated, {
        gas: graduationGasLimit(stocks.length) + withRewardsHeadroom(0n, stocks.length),
        expect: (done) => (done === true ? null : notGraduated),
      });
      const graduatedNow = await client.readContract({ address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "graduated" });
      if (!graduatedNow) throw new Error(notGraduated);
      setMessage(zh ? "已毕业。每只股票都有了自己永久锁定的 PancakeSwap 资金池。" : "Graduated. Every stock now has its own permanently locked PancakeSwap pool.");
    });
  }

  async function openRescue() {
    await run(zh ? "正在开启救援…" : "Opening rescue…", async (wallet) => {
      await send(wallet, { address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "activateRescue" }, zh ? "交易被回滚。" : "The transaction reverted.");
      setMessage(zh ? "救援已开启。" : "Rescue is open.");
    });
  }

  async function redeem() {
    await run(zh ? "正在准备赎回…" : "Preparing your redemption…", async (wallet) => {
      const { publicClient } = walletClients(wallet);
      const held = await publicClient.readContract({ address: launch.token, abi: ERC20, functionName: "balanceOf", args: [wallet] });
      if (held === 0n) throw new Error(zh ? `该钱包没有 ${launch.symbol}。` : `This wallet holds no ${launch.symbol}.`);
      const remaining = launch.rescue ? BigInt(launch.rescue.supply) - BigInt(launch.rescue.redeemed) : 0n;
      if (remaining === 0n) throw new Error(zh ? "救援已全部赎回。" : "Everything has been redeemed.");
      const minOut = stocks.map((item) => ((BigInt(item.reserve) * held) / remaining) * 995n / 1_000n);
      await ensureAllowance(wallet, launch.token, held, launch.symbol);
      await send(wallet, { address: launch.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "rescueRedeem", args: [held, minOut] }, zh ? "赎回被回滚。" : "The redemption reverted.");
      setMessage(zh ? "已赎回。" : "Redeemed.");
    });
  }

  async function handToHolders() {
    await run(zh ? "正在把创作者费转给持有者…" : "Handing your creator fee to holders…", async (wallet) => {
      await send(wallet, { address: launch.feeRouter, abi: STOCK_REWARDS_FEE_ROUTER_ABI, functionName: "surrenderCreatorFeesToHolders" }, zh ? "交易被回滚。" : "The transaction reverted.");
      setMessage(zh ? "完成。从现在起你的创作者费归持有者所有，且无法撤销。" : "Done. From now on your creator fee goes to holders, for good.");
    });
  }

  async function faucet(item: BasketStock) {
    await run(zh ? `正在领取测试 ${item.symbol}…` : `Getting test ${item.symbol}…`, async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      await publicClient.simulateContract({ account: wallet, address: item.address, abi: TEST_STOCK_ABI, functionName: "faucet" });
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: item.address, abi: TEST_STOCK_ABI, functionName: "faucet" });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(zh ? `已领取测试 ${item.symbol}。` : `Test ${item.symbol} received.`);
    });
  }

  // Claimable now, moving forward between reads at the wallet's share of each stream.
  const live = useMemo(() => {
    if (!claimable || !balances) return null;
    const eligible = BigInt(launch.eligibleSupply);
    return stocks.map((item, index) => {
      const base = claimable.amounts[index] ?? 0n;
      const streaming = BigInt(item.rewards.streaming);
      const { perSecond } = streamProgress(streaming, item.rewards.streamEnd, claimable.at);
      if (eligible === 0n || perSecond === 0n) return base;
      const elapsedSince = BigInt(Math.max(0, Math.min(now - claimable.at, item.rewards.streamEnd - claimable.at)));
      const mine = (perSecond * elapsedSince * balances.token) / eligible;
      return base + mine;
    });
  }, [claimable, balances, launch.eligibleSupply, stocks, now]);
  const hasClaimable = Boolean(live?.some((value) => value > 0n));
  const pancakeUrl = (item: BasketStock) =>
    `https://pancakeswap.finance/swap?chain=${FORTUNE_NETWORK.isMainnet ? "bsc" : "bscTestnet"}&inputCurrency=${item.address}&outputCurrency=${launch.token}`;
  const progress = Math.min(100, launch.progressBps / 100);

  return (
    <>
      <div className="metricsGrid four customMarketMetrics">
        <div className="metric"><span>Price</span><strong translate="no">{formatPrice(price)}</strong><small translate="no">{zh ? `每枚 ${launch.symbol} · ${graduated ? "资金池" : "曲线"}` : `per ${launch.symbol} · ${graduated ? "pool" : "curve"}`}</small></div>
        <div className="metric"><span>Market cap</span><strong translate="no">{formatUsd(marketCap)}</strong><small>Fully diluted</small></div>
        <div className="metric"><span>Raised</span><strong translate="no">{graduated ? formatUsd(units(launch.graduationUsd1e18, 18)) : formatUsd(units(launch.netReserveUsd1e18, 18))}</strong><small translate="no">{zh ? "目标 " : "of "}{formatUsd(units(launch.graduationUsd1e18, 18))}</small></div>
        <div className="metric"><span>Paid to holders</span><strong translate="no">{formatUsd(lifetimeUsd)}</strong><small translate="no">{zh ? `${stocks.length} 只股票 · 当前价格` : `in ${stocks.length} stock${stocks.length === 1 ? "" : "s"} · at today's prices`}</small></div>
      </div>

      {trading ? (
        <div className="customProgress">
          <div className="progressHeader"><span>Graduation</span><strong translate="no">{progress.toFixed(2)}%</strong></div>
          <div className="progressTrack"><span style={{ width: progress + "%" }} /></div>
        </div>
      ) : null}

      <section className="panel stockBasket" aria-label="Stocks in this launch">
        <div className="holdingsHead">
          <div>
            <span className="eyebrow">THE BASKET</span>
            <h2>{zh ? `${stocks.length} 只股票，全部分给持有者` : `${stocks.length} stock${stocks.length === 1 ? "" : "s"}, all paid to holders`}</h2>
          </div>
        </div>
        <div className="stockBasketRows">
          {stocks.map((item) => {
            const raised = units(item.reserveUsd1e18, 18);
            const goal = units(item.targetUsd1e18, 18);
            const share = graduated ? 1 : goal > 0 ? Math.min(1, raised / goal) : 0;
            const { remainingSeconds } = streamProgress(BigInt(item.rewards.streaming), item.rewards.streamEnd, now);
            return (
              <div className="stockBasketRow" key={item.address}>
                <div className="stockBasketName">
                  <strong translate="no">{item.symbol}</strong>
                  <span translate="no">{item.name}</span>
                  <small translate="no">{formatTaxBps(item.weightBps)} {zh ? "份额" : "share"} · {formatUsd(units(item.priceUsd1e18, 18))}{item.category === "penny-stock" ? (zh ? " · 低价股" : " · penny stock") : ""}</small>
                </div>
                <div className="stockBasketFill">
                  {graduated ? (
                    <span className="mutedSmall" translate="no">{item.pool ? <a href={`${FORTUNE_NETWORK.explorerUrl}/address/${item.pool}`} target="_blank" rel="noreferrer">{zh ? "PancakeSwap 资金池 ↗" : "PancakeSwap pool ↗"}</a> : (zh ? "无资金池" : "No pool")}</span>
                  ) : (
                    <>
                      <div className="progressHeader"><span translate="no">{formatUsd(raised)} / {formatUsd(goal)}</span><strong>{filled(item) ? (zh ? "已满" : "Full") : formatShare(share)}</strong></div>
                      <div className="progressTrack"><span style={{ width: share * 100 + "%" }} /></div>
                    </>
                  )}
                </div>
                <div className="stockBasketRewards" translate="no">
                  <span>{zh ? "持有者累计获得" : "Holders received"}</span>
                  <strong>{formatAmount(units(item.rewards.totalReceived, item.decimals))} {item.symbol}</strong>
                  <small>{BigInt(item.rewards.streaming) > 0n && remainingSeconds > 0
                    ? (zh ? `${formatAmount(units(item.rewards.streaming, item.decimals))} 正在 ${formatHours(remainingSeconds, true)}内发放` : `${formatAmount(units(item.rewards.streaming, item.decimals))} streaming over ${formatHours(remainingSeconds)}`)
                    : (zh ? "暂无正在发放的奖励" : "Nothing streaming right now")}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="customMarketLayout">
        <section className="panel customTradePanel" aria-busy={busy}>
          <div className="holdingsHead">
            <div>
              <span className="eyebrow">{trading ? "TRADE ON THE CURVE" : phaseLabel(launch.phase, zh).toUpperCase()}</span>
              {trading ? <h2 translate="no">{zh ? `买入或卖出 ${launch.symbol}` : `Buy or sell ${launch.symbol}`}</h2> : <h2>{graduated ? "Trading moved to PancakeSwap" : launch.phase === "Rescued" ? "Redeem for your share" : "The curve is complete"}</h2>}
            </div>
            {account ? <span className="mutedSmall" translate="no">{shortAddress(account)}</span> : <button type="button" className="secondaryCta" onClick={() => void run(zh ? "正在连接…" : "Connecting…", async (wallet) => { await refreshWallet(wallet); setMessage(""); })}>Connect wallet</button>}
          </div>

          {trading ? (
            <>
              <div className="tradeTabs" role="group" aria-label="Trade side">
                <button type="button" aria-pressed={side === "buy"} className={side === "buy" ? "active" : undefined} onClick={() => { setSide("buy"); setAmount(""); }}>Buy</button>
                <button type="button" aria-pressed={side === "sell"} className={side === "sell" ? "active" : undefined} onClick={() => { setSide("sell"); setAmount(""); }}>Sell</button>
              </div>
              <div className="stockPayRow" role="group" aria-label={side === "buy" ? "Pay with" : "Receive"}>
                <span className="fieldHint">{side === "buy" ? (zh ? "支付方式" : "Pay with") : (zh ? "换取" : "Receive")}</span>
                {stocks.map((item, index) => {
                  const unavailable = side === "buy" ? filled(item) : BigInt(item.reserve) === 0n;
                  return (
                    <button key={item.address} type="button" className={index === stockIndex ? "active" : undefined} aria-pressed={index === stockIndex} disabled={unavailable} title={unavailable ? (side === "buy" ? "This stock's share is full" : "The curve holds none of this stock") : undefined} onClick={() => { setStockIndex(index); setAmount(""); }} translate="no">
                      {item.symbol}{unavailable && side === "buy" ? (zh ? " · 已满" : " · full") : ""}
                    </button>
                  );
                })}
              </div>
              {balances && stock ? (
                <p className="fieldHint" translate="no">
                  {zh ? "余额" : "Balance"}: {formatAmount(units(balances.stocks[stockIndex] ?? 0n, stock.decimals))} {stock.symbol} · {formatAmount(units(balances.token, 18))} {launch.symbol}
                  {stock.faucetAmount ? <> · <button type="button" className="linkButton" disabled={busy} onClick={() => void faucet(stock)}>{zh ? `领取测试 ${stock.symbol}` : `Get test ${stock.symbol}`}</button></> : null}
                </p>
              ) : null}
              <label><span translate="no">{side === "buy" ? (zh ? `支付 · ${stock?.symbol}` : `You pay · ${stock?.symbol}`) : (zh ? `卖出 · ${launch.symbol}` : `You sell · ${launch.symbol}`)}</span>
                <input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="0.0" />
              </label>
              {side === "sell" && balances?.token ? <button type="button" className="linkButton" onClick={() => setAmount(formatUnits(balances.token, 18))}>Max</button> : null}
              {shieldBps > 0 && side === "buy" ? (
                <p className="reviewWarning" translate="no">
                  {zh
                    ? `发行护盾生效中：这笔买入的 ${formatTaxBps(shieldBps)} 归协议所有，${launch.launchTimestamp + STOCK_REWARDS_RULES.snipeTaxSeconds - now} 秒后降为零。`
                    : `Launch Shield active: ${formatTaxBps(shieldBps)} of this buy goes to the protocol. It reaches zero in ${launch.launchTimestamp + STOCK_REWARDS_RULES.snipeTaxSeconds - now}s.`}
                </p>
              ) : null}
              {quote && stock ? (
                <dl className="tradeQuote" translate="no">
                  {quote.kind === "buy" ? (
                    <>
                      {quote.shield > 0n ? <div><dt>{zh ? "发行护盾" : "Launch Shield"}</dt><dd>−{formatAmount(units(quote.shield, stock.decimals))} {stock.symbol}</dd></div> : null}
                      <div><dt>{zh ? "手续费" : "Fees"} {formatTaxBps(launch.creatorFeeBps + launch.holderFeeBps + launch.protocolFeeBps)}</dt><dd>−{formatAmount(units(quote.fee, stock.decimals))} {stock.symbol}</dd></div>
                      {quote.refund > 0n ? <div><dt>{zh ? `退还（${stock.symbol} 份额已满）` : `Refunded (${stock.symbol}'s share fills)`}</dt><dd>{formatAmount(units(quote.refund, stock.decimals))} {stock.symbol}</dd></div> : null}
                      <div className="firstBuyTotal"><dt>{zh ? "预计获得" : "You receive"}</dt><dd>≈ {formatAmount(units(quote.tokens, 18))} {launch.symbol}</dd></div>
                      <div><dt>{zh ? "最少获得" : "Minimum"}</dt><dd>{formatAmount(units(quote.minOut, 18))} {launch.symbol}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>{zh ? "曲线支付" : "Curve pays"}</dt><dd>{formatAmount(units(quote.gross, stock.decimals))} {stock.symbol}</dd></div>
                      <div><dt>{zh ? "手续费" : "Fees"} {formatTaxBps(launch.creatorFeeBps + launch.holderFeeBps + launch.protocolFeeBps)}</dt><dd>−{formatAmount(units(quote.fee, stock.decimals))} {stock.symbol}</dd></div>
                      <div className="firstBuyTotal"><dt>{zh ? "到账" : "You receive"}</dt><dd>≈ {formatAmount(units(quote.out, stock.decimals))} {stock.symbol}</dd></div>
                      <div><dt>{zh ? "最少到账" : "Minimum"}</dt><dd>{formatAmount(units(quote.minOut, stock.decimals))} {stock.symbol}</dd></div>
                    </>
                  )}
                </dl>
              ) : null}
              {quoteError ? <p className="fieldError" role="alert">{quoteError}</p> : null}
              {walletCapActive && side === "buy" ? <p className="fieldHint">For the first 15 seconds each wallet can buy at most 2% of the supply.</p> : null}
              <div className="slippageRow" role="group" aria-label="Slippage tolerance">
                <span className="fieldHint">Slippage</span>
                {SLIPPAGE_OPTIONS.map((bps) => (
                  <button key={bps} type="button" className={slippageBps === bps ? "active" : undefined} aria-pressed={slippageBps === bps} onClick={() => setSlippageBps(bps)} translate="no">{formatTaxBps(bps)}</button>
                ))}
              </div>
              <button className="launchButton" disabled={busy || !quote} onClick={() => void trade()} translate="no">
                {busy ? (zh ? "处理中…" : "Working…") : side === "buy" ? (zh ? `买入 ${launch.symbol}` : `Buy ${launch.symbol}`) : (zh ? `卖出换取 ${stock?.symbol}` : `Sell for ${stock?.symbol}`)}
              </button>
              <p className="fieldHint" translate="no">{zh
                ? `每笔交易的 ${formatTaxBps(launch.holderFeeBps)} 以所用股票支付给持有者。`
                : `${formatTaxBps(launch.holderFeeBps)} of every trade goes to holders, in the stock it uses.`}</p>
            </>
          ) : null}

          {launch.phase === "GraduationReady" ? (
            <div className="customPhaseAction">
              <p>The target is reached and trading is closed. Anyone can move the reserves into one PancakeSwap V3 pool per stock, locked forever, at the final curve price.</p>
              {launch.graduation.lastFailure ? <p className="fieldError" translate="no">{zh ? `上次尝试未成功：${launch.graduation.lastFailure}` : `The last attempt did not go through: ${launch.graduation.lastFailure}`}</p> : null}
              <button className="launchButton" disabled={busy} onClick={() => void graduate()}>Graduate to PancakeSwap →</button>
            </div>
          ) : null}

          {graduated ? (
            <div className="customPhaseAction">
              <p>Every stock has its own pool. Pool fees go to holders in that stock; the token side of every fee is burned.</p>
              <div className="heroActions">
                {stocks.filter((item) => item.pool).map((item) => (
                  <a key={item.address} className="secondaryCta" href={pancakeUrl(item)} target="_blank" rel="noreferrer" translate="no">{zh ? `用 ${item.symbol} 交易 ↗` : `Trade with ${item.symbol} ↗`}</a>
                ))}
              </div>
              {stocks.length >= 4 ? <p className="fieldHint">Tokens paying four or five stocks need more gas on their first transfer in a block. If a swap elsewhere runs out of gas, raise its gas limit.</p> : null}
            </div>
          ) : null}

          {canRescue ? (
            <div className="customPhaseAction">
              <p>Graduation has been impossible for seven days. Anyone can open rescue; holders then redeem a pro-rata share of every stock the curve holds.</p>
              <button className="secondaryCta" disabled={busy} onClick={() => void openRescue()}>Open rescue</button>
            </div>
          ) : null}

          {launch.phase === "Rescued" ? (
            <div className="customPhaseAction">
              <p translate="no">{zh ? `销毁你的 ${launch.symbol}，按比例换取曲线持有的每只股票。` : `Burn your ${launch.symbol} for a pro-rata share of every stock the curve holds.`}</p>
              <button className="launchButton" disabled={busy} onClick={() => void redeem()} translate="no">{zh ? `赎回我全部的 ${launch.symbol}` : `Redeem all my ${launch.symbol}`}</button>
            </div>
          ) : null}

          {message ? <p className="launchDescription" role="status">{message}</p> : null}
        </section>

        <div className="customMarketSide">
          <section className="panel stockRewardsPanel" aria-label="Your stock rewards">
            <span className="eyebrow">YOUR STOCK REWARDS</span>
            {!account ? (
              <p className="fieldHint" translate="no">{zh ? `连接持有 ${launch.symbol} 的钱包，即可查看它赚到的股票。` : `Connect a wallet that holds ${launch.symbol} to see what it has earned.`}</p>
            ) : (
              <>
                <div className="statRows" translate="no">
                  {stocks.map((item, index) => (
                    <div key={item.address}>
                      <span>{item.symbol}</span>
                      <strong>{formatAmount(units(live?.[index] ?? 0n, item.decimals))}</strong>
                    </div>
                  ))}
                </div>
                <button className="launchButton" disabled={busy || !hasClaimable} onClick={() => void claim()}>{zh ? "领取全部股票" : "Claim all stocks"}</button>
                <p className="fieldHint" translate="no">{balances && BigInt(launch.eligibleSupply) > 0n
                  ? (zh
                    ? `你持有 ${formatShare(units(balances.token, 18) / units(launch.eligibleSupply, 18))} 的分红份额。新奖励在 6 小时内分发，期间按持有量分配。`
                    : `You hold ${formatShare(units(balances.token, 18) / units(launch.eligibleSupply, 18))} of the earning supply. New rewards stream out over 6 hours, pro rata to what you hold while they do.`)
                  : (zh ? "新奖励在 6 小时内分发，期间按持有量分配。" : "New rewards stream out over 6 hours, pro rata to what you hold while they do.")}</p>
              </>
            )}
            {waiting ? (
              <div className="customPhaseAction">
                <p>New rewards arrived since the last transfer. Anyone can start streaming them.</p>
                <button className="secondaryCta" disabled={busy} onClick={() => void sync()}>Start streaming</button>
              </div>
            ) : null}
            {graduated ? (
              <div className="customPhaseAction">
                <p translate="no">{uncollected
                  ? (zh
                    ? `资金池手续费待收取：${stocks.filter((item) => item.poolFees && BigInt(item.poolFees.stock) > 0n).map((item) => `${formatAmount(units(item.poolFees!.stock, item.decimals))} ${item.symbol}`).join("、") || "仅代币部分"}。`
                    : `Pool fees waiting: ${stocks.filter((item) => item.poolFees && BigInt(item.poolFees.stock) > 0n).map((item) => `${formatAmount(units(item.poolFees!.stock, item.decimals))} ${item.symbol}`).join(", ") || "token side only"}.`)
                  : (zh ? "暂无待收取的资金池手续费。" : "No pool fees are waiting right now.")}</p>
                <button className="secondaryCta" disabled={busy || !uncollected} onClick={() => void collectPoolFees()}>Collect pool fees for holders</button>
                <p className="fieldHint">PancakeSwap keeps 32% of every pool fee; the rest goes to holders and the burn.</p>
              </div>
            ) : null}
          </section>

          {isCreator && launch.creatorFeeBps > 0 && !launch.creatorFeesToHolders ? (
            <section className="panel customFacts">
              <span className="eyebrow">YOU CREATED THIS</span>
              <p className="fieldHint" translate="no">{zh
                ? `你的 ${formatTaxBps(launch.creatorFeeBps)} 创作者费会以股票直接打到你的钱包。你可以把它永久转给持有者，此操作无法撤销。`
                : `Your ${formatTaxBps(launch.creatorFeeBps)} creator fee is paid straight to your wallet in stocks. You can hand it to holders for good; this cannot be undone.`}</p>
              <button className="secondaryCta" disabled={busy} onClick={() => void handToHolders()}>Give my fee to holders</button>
            </section>
          ) : null}

          <section className="panel customFacts">
            <span className="eyebrow">CONTRACTS</span>
            <div className="statRows">
              <div><span>Token</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/token/${launch.token}`} target="_blank" rel="noreferrer">{shortAddress(launch.token)}</a></strong></div>
              <div><span>Curve</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/address/${launch.curve}`} target="_blank" rel="noreferrer">{shortAddress(launch.curve)}</a></strong></div>
              <div><span>Fee router</span><strong><a translate="no" href={`${FORTUNE_NETWORK.explorerUrl}/address/${launch.feeRouter}`} target="_blank" rel="noreferrer">{shortAddress(launch.feeRouter)}</a></strong></div>
              <div><span>Creator</span><strong><Link translate="no" href={`/profile/${launch.creator}`}>{shortAddress(launch.creator)}</Link></strong></div>
              <div><span>Fees</span><strong translate="no">{formatTaxBps(launch.holderFeeBps)} {zh ? "持有者" : "holders"} · {formatTaxBps(launch.creatorFeeBps)} {launch.creatorFeesToHolders ? (zh ? "创作者 → 持有者" : "creator → holders") : (zh ? "创作者" : "creator")} · 0.5% {zh ? "协议" : "protocol"}</strong></div>
              <div><span>Pool fee</span><strong translate="no">{launch.poolFee === 2_500 ? "0.25%" : "1%"}</strong></div>
              <div><span>Earning supply</span><strong translate="no">{formatAmount(units(launch.eligibleSupply, 18))} {launch.symbol}</strong></div>
            </div>
            <p className="fieldHint">Stock Rewards contracts are an unaudited beta, separate from Fortune&apos;s frozen Standard candidate.</p>
          </section>
        </div>
      </div>
    </>
  );
}
