"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { PairChips } from "@/components/PairAssets";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { formatAge, formatHours, formatPrice, formatUsd, shortAddress } from "@/lib/market-format";

type Activity = { volumeUsd: number; trades: number; buys: number; sells: number; lastTradeAt: number | null };

type Market = {
  id: string;
  mode: "standard" | "tax";
  creator: string;
  token: string;
  curve: string;
  name: string;
  symbol: string;
  status: "Curve" | "GraduationReady" | "Pancake" | "Rescued";
  reserveUsd: string;
  graduationProgress: number;
  createdAt: number;
  priceUsd: number | null;
  priceSource: "curve" | "pancake-v3" | "pancake-v2";
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  pairs: Array<{ address: string; symbol: string }>;
  activity24h: Activity | null;
  activityTrending: Activity | null;
};

type Coverage = { fromBlock: string; toBlock: string; fromTimestamp: number; toTimestamp: number };

type BoardResponse = {
  data?: {
    items: Market[];
    total: number;
    rankedAmong: number;
    sortAvailable: boolean;
    hasMore: boolean;
    blockNumber: string | null;
    ledger: { available: boolean; coverage: Coverage | null; covers24h: boolean; coversTrending: boolean; trendingWindowSeconds: number };
  };
  error?: { message?: string };
};

const SORTS = [
  ["newest", "Newest"],
  ["volume24h", "24H Volume"],
  ["trending", "Trending"],
  ["marketCap", "Highest Market Cap"],
] as const;
type Sort = (typeof SORTS)[number][0];

function statusLabel(status: Market["status"], mode: Market["mode"]) {
  if (status === "GraduationReady") return "Ready to graduate";
  if (status === "Pancake") return mode === "tax" ? "Pancake V2" : "Pancake V3";
  return status;
}

function readSort(): Sort {
  if (typeof window === "undefined") return "newest";
  const value = new URLSearchParams(window.location.search).get("sort");
  return SORTS.some(([key]) => key === value) ? (value as Sort) : "newest";
}

export default function MarketsPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [sort, setSort] = useState<Sort>("newest");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [board, setBoard] = useState<BoardResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(1);

  useEffect(() => setSort(readSort()), []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const loaded: Market[] = [];
      let last: BoardResponse["data"] | null = null;
      for (let page = 0; page < pages; page++) {
        const response = await fetch(`/api/public/v1/markets?sort=${sort}&limit=25&offset=${page * 25}`, { cache: "no-store" });
        const body = (await response.json()) as BoardResponse;
        if (!response.ok || !body.data) throw new Error(body.error?.message || "Could not load Fortune markets.");
        loaded.push(...body.data.items);
        last = body.data;
        if (!body.data.hasMore) break;
      }
      setMarkets(loaded);
      setBoard(last);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load Fortune markets.");
    } finally {
      setLoading(false);
    }
  }, [sort, pages]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function choose(next: Sort) {
    setSort(next);
    setPages(1);
    const url = new URL(window.location.href);
    if (next === "newest") url.searchParams.delete("sort");
    else url.searchParams.set("sort", next);
    window.history.replaceState(null, "", url.toString());
  }

  const coverage = board?.ledger.coverage || null;
  const covered = coverage ? formatHours(coverage.toTimestamp - coverage.fromTimestamp, zh) : null;
  const bounded = board && sort !== "newest" && board.total > board.rankedAmong
    ? (zh ? ` 仅在最近 ${board.rankedAmong} 个发行中排名（共 ${board.total} 个）。` : ` Ranked among the ${board.rankedAmong} most recent of ${board.total} launches.`)
    : "";
  // Static captions go through the DOM dictionary; sentences with numbers are built per language.
  const staticCaption = !board ? "" : sort === "newest"
    ? "Newest launches first, straight from the Fortune factories."
    : sort === "marketCap" && !bounded
      ? "Price × total supply. Graduated tokens are priced from their official locked Pancake pools."
      : board.sortAvailable && !bounded
        ? (sort === "volume24h"
          ? "Fortune curve trades plus official Pancake pool swaps over the last 24 hours."
          : "Most trades in the last 6 hours, then 6-hour volume.")
        : "";
  const dynamicCaption = !board || staticCaption ? "" : sort === "marketCap"
    ? (zh ? "价格 × 总供应量。已毕业代币按其官方锁定的 Pancake 池定价。" : "Price × total supply. Graduated tokens are priced from their official locked Pancake pools.") + bounded
    : board.sortAvailable
      ? (sort === "volume24h"
        ? (zh ? "过去 24 小时内 Fortune 曲线交易与官方 Pancake 池兑换之和。" : "Fortune curve trades plus official Pancake pool swaps over the last 24 hours.")
        : (zh ? "按过去 6 小时的交易笔数排序，其次按 6 小时交易量。" : "Most trades in the last 6 hours, then 6-hour volume.")) + bounded
      : !covered
        ? (zh ? "近期交易历史暂不可用，因此按最新发行排序。" : "Recent trade history is unavailable right now, so launches are shown newest first.")
        : sort === "volume24h"
          ? (zh
            ? `24 小时交易量需要一整天的交易历史。当前日志服务仅提供最近 ${covered} 的数据，因此该排序暂不可用，按最新发行显示。`
            : `24-hour volume needs a full day of trade history. The current log provider serves the last ${covered}, so this ranking is unavailable and launches are shown newest first.`)
          : (zh
            ? `热门排序需要 6 小时的交易历史。当前日志服务仅提供最近 ${covered} 的数据，因此该排序暂不可用，按最新发行显示。`
            : `Trending needs 6 hours of trade history. The current log provider serves the last ${covered}, so this ranking is unavailable and launches are shown newest first.`);

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">LIVE ONCHAIN MARKETS</span>
          <h1>Fortune launches</h1>
          <p>
            Every market below is read directly from the configured Fortune
            factory, token, and curve contracts. No demo listings.
          </p>
        </div>

        <div className="heroActions">
          <button className="secondaryCta" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/launch" className="primaryCta">
            {FORTUNE_NETWORK.isMainnet ? "Launch token →" : "Create test launch →"}
          </Link>
        </div>
      </section>

      <section className="registryNotice">
        <strong>{FORTUNE_NETWORK.isMainnet ? "BNB CHAIN MAINNET" : "BSC TESTNET"}</strong>
        {board ? (
          <span role="status" translate="no">
            {zh
              ? `在链 ${FORTUNE_NETWORK.chainId} 上找到 ${board.total} 个 Fortune 链上发行。`
              : `${board.total} onchain Fortune launch${board.total === 1 ? "" : "es"} found on chain ${FORTUNE_NETWORK.chainId}.`}
          </span>
        ) : (
          <span role="status">{loading ? "Reading onchain launches…" : "Onchain launch count unavailable."}</span>
        )}
      </section>

      <div className="sortTabs" role="group" aria-label="Sort launches">
        {SORTS.map(([key, text]) => (
          <button key={key} type="button" aria-pressed={sort === key} onClick={() => choose(key)}>
            {text}
          </button>
        ))}
      </div>
      {staticCaption ? <p className="sortCaption">{staticCaption}</p> : null}
      {dynamicCaption ? <p className="sortCaption" translate="no">{dynamicCaption}</p> : null}

      {error ? (
        <section className="registryNotice statusError">
          <strong>MARKET READ FAILED</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {!loading && markets.length === 0 && !error ? (
        <section className="panel">
          <div className="emptyPanel">
            <strong>No launches on this deployment yet.</strong>
            <span>The first confirmed Fortune launch will appear here directly from the factory.</span>
          </div>
        </section>
      ) : (
        <div className="launchGrid">
          {markets.map((market, index) => {
            const activity = sort === "trending" ? market.activityTrending : market.activity24h;
            return (
              <Link
                href={"/market/" + market.curve + (market.mode === "tax" ? "?mode=tax" : "")}
                className="launchCard"
                key={market.curve}
              >
                <div className="launchCardTop">
                  <div className="tokenAvatar">{market.symbol.slice(0, 2)}</div>
                  <div>
                    <div className="tokenTitle">
                      {sort !== "newest" && board?.sortAvailable ? <span className="rankBadge">#{index + 1}</span> : null}
                      <strong translate="no">{market.name}</strong>
                      <span translate="no">{market.symbol}</span>
                    </div>
                    <div className="mutedSmall" translate="no">
                      {zh ? "创建者 " : "by "}{shortAddress(market.creator)} · {formatAge(market.createdAt, zh)}
                    </div>
                  </div>
                  <span className={"statusPill " + (market.status === "Pancake" ? "statusGraduated" : market.status === "GraduationReady" ? "statusGraduating" : "")}>
                    {statusLabel(market.status, market.mode)}
                  </span>
                </div>

                <PairChips pairs={market.pairs} zh={zh} />

                <div className="marketStats">
                  <div>
                    <span>Price</span>
                    <strong>{formatPrice(market.priceUsd)}</strong>
                  </div>
                  <div>
                    <span>Market cap</span>
                    <strong>{formatUsd(market.marketCapUsd)}</strong>
                  </div>
                  <div>
                    <span>{sort === "trending" ? "Trades · 6h" : "Volume · 24h"}</span>
                    <strong>{activity ? (sort === "trending" ? String(activity.trades) : formatUsd(activity.volumeUsd)) : "—"}</strong>
                  </div>
                </div>

                {market.status === "Pancake" ? (
                  <div className="progressHeader">
                    <span>Pool liquidity</span>
                    <strong>{formatUsd(market.liquidityUsd)}</strong>
                  </div>
                ) : (
                  <>
                    <div className="progressHeader">
                      <span>Graduation</span>
                      <strong>{market.graduationProgress.toFixed(2)}%</strong>
                    </div>
                    <div className="progressTrack">
                      <span style={{ width: Math.min(100, market.graduationProgress) + "%" }} />
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {board?.hasMore ? (
        <div className="heroActions loadMore">
          <button className="secondaryCta" disabled={loading} onClick={() => setPages((count) => count + 1)}>
            {loading ? "Loading…" : "Show more launches"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
