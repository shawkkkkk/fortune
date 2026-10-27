"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { LAUNCH_RULES_ABI } from "@/lib/custom-pairs-artifacts";
import {
  MARKET_IGNORE_HOLIDAYS,
  MARKET_SELLS_OPEN,
  capTokens,
  describeLaunchRules,
  formatDuration,
  lockedAt,
  nextWalletUnlock,
  walletCapBps,
  walletLockedAt,
  walletVestLength,
  type LaunchRulesView,
} from "@/lib/launch-rules";
import { marketSession } from "@/lib/market-calendar";
import { formatEtTime } from "@/lib/market-hours";
import { formatAmount, shortAddress } from "@/lib/market-format";
import { walletClients } from "@/lib/wallet";

export type RulesWalletStatus = {
  locked: bigint;
  vested: bigint;
  unlockStart: number;
  unlockEnd: number;
  sellReadyAt: number;
  canBuy: boolean;
  exempt: boolean;
  /** Holder vesting: what was locked when this wallet's clock last started, and when. */
  clockLocked: bigint;
  clockStart: number;
  /** The most this wallet may sell at once now (0: no cap). */
  sellCap: bigint;
};

/** The connected wallet's standing under a launch's rules, refreshed with `refreshKey`. */
export function useRulesWalletStatus(rules: LaunchRulesView | null, token: Address, account: Address | null, refreshKey: number) {
  const [status, setStatus] = useState<RulesWalletStatus | null>(null);
  useEffect(() => {
    if (!rules?.active || !account) {
      setStatus(null);
      return undefined;
    }
    let live = true;
    const { publicClient } = walletClients(account);
    const read = <T,>(functionName: "lockOf" | "sellReadyAt" | "canBuyNow" | "isExempt" | "walletClockOf" | "sellCapOf") =>
      publicClient.readContract({ address: rules.address, abi: LAUNCH_RULES_ABI, functionName, args: [token, account] }) as Promise<T>;
    Promise.all([
      read<readonly [bigint, bigint, bigint, bigint]>("lockOf"),
      read<bigint>("sellReadyAt"),
      read<boolean>("canBuyNow"),
      read<boolean>("isExempt"),
      read<readonly [bigint, bigint]>("walletClockOf"),
      read<bigint>("sellCapOf"),
    ])
      .then(([lock, readyAt, canBuy, exempt, clock, sellCap]) => {
        if (!live) return;
        setStatus({
          locked: lock[0],
          vested: lock[1],
          unlockStart: Number(lock[2]),
          unlockEnd: Number(lock[3]),
          sellReadyAt: Number(readyAt),
          canBuy,
          exempt,
          clockLocked: clock[0],
          clockStart: Number(clock[1]),
          sellCap,
        });
      })
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [rules, token, account, refreshKey]);
  return status;
}

/** Tokens this wallet still has locked at `now`, under whichever vesting the launch uses. */
export function lockedNow(rules: LaunchRulesView, status: RulesWalletStatus | null, now: number): bigint {
  if (!status) return 0n;
  if (rules.walletVestPeriod) {
    return walletLockedAt(status.clockLocked, status.clockStart, rules.walletVestCliff, rules.walletVestPeriod, rules.walletVestUnlockBps, now);
  }
  return lockedAt(status.vested, status.unlockStart, status.unlockEnd, now);
}

/** Whether the market-hours rule lets buys and sells through at `now`, and when that changes. */
export function marketState(rules: LaunchRulesView, now: number) {
  if (!rules.marketHours || !rules.active) return null;
  const session = marketSession(now, (rules.marketHours & MARKET_IGNORE_HOLIDAYS) === 0);
  return { ...session, sellsAlwaysOpen: (rules.marketHours & MARKET_SELLS_OPEN) !== 0 };
}

const when = (timestamp: number, zh: boolean) => new Date(timestamp * 1000).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" });

/** A launch's rules in plain words, whether they still apply, and where the connected wallet stands. */
export default function LaunchRulesPanel({
  rules,
  symbol,
  supply,
  phase,
  progressBps,
  status,
  account,
  now,
  zh = false,
}: {
  rules: LaunchRulesView;
  symbol: string;
  supply: bigint;
  phase: string;
  progressBps: number;
  status: RulesWalletStatus | null;
  account: Address | null;
  now: number;
  zh?: boolean;
}) {
  const gateMin = rules.gate ? formatAmount(Number(formatUnits(BigInt(rules.gateMinBalance), rules.gate.decimals))) : null;
  const lines = describeLaunchRules(
    { ...rules, gateLabel: rules.gate?.symbol ?? null, gateMin, exemptCount: rules.exempt.length },
    zh
  );
  const tokens = (raw: bigint) => `${formatAmount(Number(formatUnits(raw, 18)))} ${symbol}`;
  const allowlistOpensAt = rules.allowlistSeconds ? rules.launchTimestamp + rules.allowlistSeconds : 0;
  const gateOpensAt = rules.gateSeconds ? rules.launchTimestamp + rules.gateSeconds : 0;
  const accessUntil = Math.max(allowlistOpensAt, gateOpensAt);
  const ended = !rules.active;
  const locked = lockedNow(rules, status, now);
  const market = marketState(rules, now);
  const gasCapUntil = BigInt(rules.maxGasPrice) > 0n ? rules.launchTimestamp + rules.gasCapSeconds : 0;

  // The caps in force now: the wallet cap grows with time (rising) or volume (chapters).
  const live: string[] = [];
  if (!ended) {
    const walletBps = walletCapBps(rules, now, BigInt(rules.volume), supply);
    if (rules.risingStartBps) {
      const nextAt = rules.launchTimestamp + (Math.floor((now - rules.launchTimestamp) / rules.risingPeriod) + 1) * rules.risingPeriod;
      live.push(walletBps
        ? (zh ? `当前每个钱包最多 ${tokens(capTokens(supply, walletBps))}，${formatDuration(nextAt - now, true)}后上调` : `Max per wallet now ${tokens(capTokens(supply, walletBps))}, rising in ${formatDuration(nextAt - now)}`)
        : (zh ? "持仓上限已放开" : "The max per wallet no longer limits anyone"));
    }
    if (rules.chapterStartBps) {
      const perChapter = capTokens(supply, rules.chapterVolumeBps);
      const traded = BigInt(rules.volume);
      const chapter = perChapter > 0n ? traded / perChapter : 0n;
      live.push(walletBps
        ? (zh
          ? `第 ${chapter + 1n} 章：每个钱包最多 ${tokens(capTokens(supply, walletBps))}，再成交 ${tokens((chapter + 1n) * perChapter - traded)} 后翻倍`
          : `Chapter ${chapter + 1n}: max per wallet ${tokens(capTokens(supply, walletBps))}, doubling after ${tokens((chapter + 1n) * perChapter - traded)} more trades`)
        : (zh ? "持仓上限已放开" : "The max per wallet no longer limits anyone"));
    }
    if (rules.levels.length) {
      const from = rules.level ? rules.levels[rules.level - 1].fromProgressBps : 0;
      const buy = BigInt(rules.caps.maxBuy);
      const sell = BigInt(rules.caps.maxSell);
      const caps = zh
        ? `${buy > 0n ? `每笔买入最多 ${tokens(buy)}` : "买入不设上限"}、${sell > 0n ? `每笔卖出最多 ${tokens(sell)}` : "卖出不设上限"}`
        : `${buy > 0n ? `${tokens(buy)} per buy` : "no buy cap"}, ${sell > 0n ? `${tokens(sell)} per sell` : "no sell cap"}`;
      live.push(zh
        ? `当前处于${rules.level ? `进度 ${from / 100}% 起的第 ${rules.level} 档` : "开盘档"}（毕业进度 ${(progressBps / 100).toFixed(1)}%）：${caps}`
        : `Now at ${rules.level ? `level ${rules.level}, from ${from / 100}%` : "the launch level"} (graduation progress ${(progressBps / 100).toFixed(1)}%): ${caps}`);
    }
    if (gasCapUntil > now) {
      live.push(zh
        ? `Gas 上限生效至 ${when(gasCapUntil, true)}（还有 ${formatDuration(gasCapUntil - now, true)}）`
        : `The gas cap applies until ${when(gasCapUntil, false)} (in ${formatDuration(gasCapUntil - now)})`);
    }
  }

  return (
    <section className="panel launchRulesPanel" aria-labelledby="launch-rules-title">
      <span className="eyebrow">LAUNCH RULES</span>
      <h2 id="launch-rules-title">Rules this launch chose</h2>
      <p className={"recipientBadge " + (ended ? "" : "recipientVerified")} translate="no">
        {ended
          ? phase === "Rescued"
            ? (zh ? "救援开启后规则已结束" : "Ended when rescue opened")
            : (zh ? "毕业后规则已结束" : "Ended at graduation")
          : (zh ? "生效中，直到毕业" : "In force until graduation")}
      </p>
      {market ? (
        <p className={"recipientBadge " + (market.open ? "recipientVerified" : "")} role="status" translate="no">
          {market.open
            ? (zh ? `美股交易中 · ${formatEtTime(market.changesAt * 1000, now * 1000)} 收市${market.earlyClose ? "（提前收市）" : ""}` : `Market open · closes ${formatEtTime(market.changesAt * 1000, now * 1000)}${market.earlyClose ? " (early close)" : ""}`)
            : (zh
              ? `美股休市${market.holiday ? `（${market.holiday}）` : ""} · ${formatEtTime(market.changesAt * 1000, now * 1000)} 开市${market.sellsAlwaysOpen ? " · 卖出仍可进行" : ""}`
              : `Market closed${market.holiday ? ` for ${market.holiday}` : ""} · opens ${formatEtTime(market.changesAt * 1000, now * 1000)}${market.sellsAlwaysOpen ? " · sells stay open" : ""}`)}
        </p>
      ) : null}
      <ul className="launchRulesList" translate="no">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {live.length ? (
        <ul className="launchRulesList launchRulesLive" translate="no" aria-label={zh ? "当前状态" : "Right now"}>
          {live.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      {!ended && accessUntil > now ? (
        <p className="fieldHint" translate="no">{zh ? `访问限制将在 ${when(accessUntil, true)} 结束（还有 ${formatDuration(accessUntil - now, true)}）。` : `Access limits end at ${when(accessUntil, false)} (in ${formatDuration(accessUntil - now)}).`}</p>
      ) : null}
      {rules.exempt.length ? (
        <details className="launchRulesExempt">
          <summary translate="no">{zh ? `豁免钱包（${rules.exempt.length}）` : `Exempt wallets (${rules.exempt.length})`}</summary>
          <ul translate="no">{rules.exempt.map((address) => <li key={address}>{shortAddress(address)}</li>)}</ul>
        </details>
      ) : null}

      {!ended && account && status ? (
        <div className="launchRulesWallet">
          <strong>Your wallet</strong>
          <ul translate="no">
            {status.exempt ? <li>{zh ? "该钱包是豁免钱包：不受持仓和买入上限限制" : "This wallet is exempt from the wallet and buy caps"}</li> : null}
            {rules.walletVestPeriod && status.clockLocked > 0n ? (
              <li>
                {locked > 0n
                  ? (() => {
                    const next = nextWalletUnlock(status.clockStart, rules.walletVestCliff, rules.walletVestPeriod, rules.walletVestUnlockBps, now);
                    const free = status.clockStart + walletVestLength(rules.walletVestCliff, rules.walletVestPeriod, rules.walletVestUnlockBps);
                    return zh
                      ? `${tokens(locked)} 锁仓中：${next ? `${when(next, true)} 再解锁 ${rules.walletVestUnlockBps / 100}%，` : ""}${when(free, true)} 全部解锁`
                      : `${tokens(locked)} locked: ${next ? `another ${rules.walletVestUnlockBps / 100}% unlocks ${when(next, false)}, ` : ""}all free by ${when(free, false)}`;
                  })()
                  : (zh ? "该钱包的锁仓已全部解锁" : "Everything this wallet vested is unlocked")}
              </li>
            ) : null}
            {!rules.walletVestPeriod && status.vested > 0n ? (
              <li>
                {locked > 0n
                  ? (zh
                    ? `${tokens(locked)} 锁仓中：${now < status.unlockStart ? `${when(status.unlockStart, true)} 开始解锁，` : ""}${when(status.unlockEnd, true)} 全部解锁`
                    : `${tokens(locked)} locked: ${now < status.unlockStart ? `unlocking starts ${when(status.unlockStart, false)}, ` : ""}all free by ${when(status.unlockEnd, false)}`)
                  : (zh ? `早期买入的 ${tokens(status.vested)} 已全部解锁` : `All ${tokens(status.vested)} from early buys are unlocked`)}
              </li>
            ) : null}
            {rules.sellTierSmallBps && status.sellCap > 0n ? (
              <li>{zh ? `按持仓大小，该钱包每笔最多卖出 ${tokens(status.sellCap)}` : `For this wallet's bag, each sell may return up to ${tokens(status.sellCap)}`}</li>
            ) : null}
            {status.sellReadyAt > now ? <li>{zh ? `下次可卖出：${formatDuration(status.sellReadyAt - now, true)}后` : `Next sell: in ${formatDuration(status.sellReadyAt - now)}`}</li> : null}
            {!status.canBuy && !(market && !market.open) ? <li>{zh ? "该钱包暂时不能买入：未在白名单中或未持有门槛代币" : "This wallet cannot buy yet: it is not allowlisted or does not hold the gate token"}</li> : null}
            {status.canBuy && !status.exempt && locked === 0n && status.sellReadyAt <= now && !rules.sellTierSmallBps ? <li>{zh ? "该钱包没有受限的持仓" : "Nothing in this wallet is restricted"}</li> : null}
          </ul>
        </div>
      ) : null}
      <p className="fieldHint">The token itself checks these rules on every transfer, and they stop at graduation or rescue. They were fixed when the launch was created: nobody can change them, not the creator and not Fortune.</p>
    </section>
  );
}
