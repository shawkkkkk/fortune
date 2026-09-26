"use client";

import { useCallback, useEffect, useState } from "react";
import { PairAssetsPanel, type PairAssetView } from "@/components/PairAssets";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import SupplyBreakdown, { type SupplyView } from "@/components/SupplyBreakdown";
import { useLanguage } from "@/components/LanguageProvider";
import { useTheme } from "@/components/ThemeProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { formatAge, formatAmount, formatHours, formatPrice, formatUsd, shortAddress } from "@/lib/market-format";

type Activity = { volumeUsd: number | null; trades: number; buys: number; sells: number; lastTradeAt: number | null };
type Coverage = { fromBlock: string; toBlock: string; fromTimestamp: number; toTimestamp: number; complete: boolean; source: string };
type Trade = {
  source: "curve" | "pancake-v3" | "pancake-v2";
  side: "buy" | "sell";
  trader: string;
  tokenAmount: number;
  usdValue: number | null;
  priceUsd: number | null;
  transactionHash: string;
  timestamp: number;
};
type MarketResponse = {
  data?: {
    summary: {
      symbol: string;
      phase: number;
      priceUsd: number | null;
      priceSource: "curve" | "pancake-v3" | "pancake-v2";
      marketCapUsd: number | null;
      liquidityUsd: number | null;
      reserveUsd: string;
      pairs: PairAssetView[];
      activity24h: Activity | null;
      activityTrending: Activity | null;
    };
    chart: { range: Range; points: ChartPoint[]; ledger: { available: boolean; coverage: Coverage | null; coversRange: boolean } } | null;
    trades: Trade[];
    supply?: SupplyView | null;
  };
  error?: { message?: string };
};

const RANGES = [["24h", "24H"], ["7d", "7D"], ["30d", "30D"]] as const;
type Range = (typeof RANGES)[number][0];
const RANGE_SECONDS: Record<Range, number> = { "24h": 86_400, "7d": 604_800, "30d": 2_592_000 };

function sourceLabel(source: Trade["source"] | "curve") {
  return source === "curve" ? "Fortune curve" : source === "pancake-v3" ? "Pancake V3" : "Pancake V2";
}

export default function TokenMarketPanel({ token }: { token: string }) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const zh = language === "zh";
  const [range, setRange] = useState<Range>("24h");
  const [view, setView] = useState<"chart" | "dexscreener">("chart");
  const [data, setData] = useState<MarketResponse["data"] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/v1/markets/${token}?range=${range}`, { cache: "no-store" });
      const body = (await response.json()) as MarketResponse;
      if (!response.ok || !body.data) throw new Error(body.error?.message || "Market data unavailable.");
      setData(body.data);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Market data unavailable.");
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data) {
    return (
      <div className="marketInsights">
        <section className="panel marketChartPanel" aria-busy={loading}>
          <span className="eyebrow">PRICE CHART</span>
          <p className="chartCoverage">{loading ? "Reading trades and pool state from BNB Chain…" : error || "Market data unavailable."}</p>
        </section>
      </div>
    );
  }

  const { summary, chart, trades } = data;
  const coverage = chart?.ledger.coverage || null;
  const to = coverage?.toTimestamp || Math.floor(Date.now() / 1000);
  const from = chart?.ledger.coversRange ? to - RANGE_SECONDS[range] : Math.max(to - RANGE_SECONDS[range], coverage?.fromTimestamp || to);
  const points = chart?.points || [];
  const firstInWindow = points.find((point) => point.timestamp >= from);
  const change = firstInWindow && summary.priceUsd !== null && firstInWindow.priceUsd > 0
    ? (summary.priceUsd / firstInWindow.priceUsd - 1) * 100 : null;
  const officialPool = summary.pairs.find((pair) => pair.pool)?.pool || null;
  const dexscreener = FORTUNE_NETWORK.isMainnet && officialPool
    ? `https://dexscreener.com/bsc/${officialPool.address}?embed=1&theme=${theme === "dark" ? "dark" : "light"}&trades=0&info=0`
    : null;

  return (
    <div className="marketInsights">
      <section className="panel marketChartPanel">
        <div className="chartHeader">
          <div>
            <span className="eyebrow">PRICE CHART</span>
            <div className="chartPrice">
              <strong>{formatPrice(summary.priceUsd)}</strong>
              {change !== null && Math.abs(change) >= 0.01 ? (
                <span className={change >= 0 ? "chartChangeUp" : "chartChangeDown"}>
                  {(change >= 0 ? "+" : "") + change.toFixed(2)}%
                </span>
              ) : null}
            </div>
            <span className="chartSource">{summary.priceSource === "curve" ? "Fortune curve spot price" : sourceLabel(summary.priceSource) + " official pool price"}</span>
          </div>
          <div className="chartControls">
            {dexscreener ? (
              <div className="segmented" role="group" aria-label="Chart source">
                <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Fortune</button>
                <button type="button" aria-pressed={view === "dexscreener"} onClick={() => setView("dexscreener")}>DexScreener</button>
              </div>
            ) : null}
            {view === "chart" ? (
              <div className="segmented" role="group" aria-label="Chart range">
                {RANGES.map(([value, text]) => (
                  <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{text}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {view === "dexscreener" && dexscreener ? (
          <div className="dexFrame">
            <iframe src={dexscreener} title={`${summary.symbol} on DexScreener`} loading="lazy" referrerPolicy="no-referrer" />
          </div>
        ) : (
          <PriceChart
            points={points}
            trades={trades}
            fromTimestamp={from}
            toTimestamp={to}
            currentPrice={summary.priceUsd}
            label={(zh ? `${summary.symbol} 价格，` : `${summary.symbol} price, `) + RANGES.find(([value]) => value === range)![1]}
            zh={zh}
          />
        )}

        {!chart?.ledger.available ? (
          <p className="chartCoverage">Trade history is unavailable right now; price and liquidity are live contract reads.</p>
        ) : (
          <p className="chartCoverage" translate="no">
            {chart.ledger.coversRange
              ? (zh
                ? `包含区块 ${coverage!.fromBlock} 至 ${coverage!.toBlock} 之间的全部 Fortune 曲线交易和官方池兑换。`
                : `Every Fortune curve trade and official pool swap from block ${coverage!.fromBlock} to ${coverage!.toBlock}.`)
              : (zh
                ? `日志服务仅提供最近 ${formatHours(coverage!.toTimestamp - coverage!.fromTimestamp, true)}（区块 ${coverage!.fromBlock}–${coverage!.toBlock}）的数据，因此图表从那里开始。更早的交易需要完整历史的数据服务。`
                : `The log provider serves the last ${formatHours(coverage!.toTimestamp - coverage!.fromTimestamp)} (blocks ${coverage!.fromBlock}–${coverage!.toBlock}), so this chart starts there. Older trades need a full-history provider.`)}
          </p>
        )}
      </section>

      <div className="metricsGrid four marketStatsGrid">
        <div className="metric"><span>Market cap</span><strong>{formatUsd(summary.marketCapUsd)}</strong><small>Price × total supply</small></div>
        <div className="metric">
          <span>{summary.phase === 2 ? "Pool liquidity" : "Curve reserve"}</span>
          <strong>{formatUsd(summary.phase === 2 ? summary.liquidityUsd : Number(summary.reserveUsd))}</strong>
          <small>{summary.phase === 2 ? "Official locked pools" : "Accounted onchain"}</small>
        </div>
        <div className="metric">
          <span>24h volume</span>
          <strong>{summary.activity24h ? formatUsd(summary.activity24h.volumeUsd) : "—"}</strong>
          {summary.activity24h
            ? <small translate="no">{zh ? `买入 ${summary.activity24h.buys} · 卖出 ${summary.activity24h.sells}` : `${summary.activity24h.buys} buys · ${summary.activity24h.sells} sells`}</small>
            : <small>Needs 24h of trade history</small>}
        </div>
        <div className="metric">
          <span>Trades · 6h</span>
          <strong>{summary.activityTrending ? summary.activityTrending.trades : "—"}</strong>
          {summary.activityTrending?.lastTradeAt
            ? <small translate="no">{(zh ? "最近一笔 " : "Last ") + formatAge(summary.activityTrending.lastTradeAt, zh)}</small>
            : <small>No recent trades</small>}
        </div>
      </div>

      {data.supply ? <SupplyBreakdown supply={data.supply} zh={zh} /> : null}
      <PairAssetsPanel pairs={summary.pairs} graduated={summary.phase === 2} zh={zh} />

      <p className="chartCoverage" translate="no">{zh
        ? "历史池兑换的美元估值尚不可用；不会使用当前价格补算。下方最多显示最近 50 笔交易。"
        : "Historical pool-swap USD values are unavailable; current prices are not substituted. Up to 50 recent trades are shown below."}</p>

      <section className="panel tradesPanel">
        <span className="eyebrow">RECENT TRADES</span>
        {trades.length ? (
          <div className="tableWrap">
            <table className="tradesTable">
              <thead>
                <tr><th>Time</th><th>Side</th><th>Value</th><th>Tokens</th><th>Price</th><th>Venue</th><th>Wallet</th><th><span className="srOnly">Transaction</span></th></tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.transactionHash + trade.timestamp + trade.tokenAmount}>
                    <td translate="no">{formatAge(trade.timestamp, zh)}</td>
                    <td><span className={trade.side === "buy" ? "sideBuy" : "sideSell"}>{trade.side === "buy" ? "Buy" : "Sell"}</span></td>
                    <td>{formatUsd(trade.usdValue)}</td>
                    <td translate="no">{formatAmount(trade.tokenAmount)}</td>
                    <td>{formatPrice(trade.priceUsd)}</td>
                    <td>{sourceLabel(trade.source)}</td>
                    <td translate="no"><a href={`${FORTUNE_NETWORK.explorerUrl}/address/${trade.trader}`} target="_blank" rel="noreferrer">{shortAddress(trade.trader)}</a></td>
                    <td><a href={`${FORTUNE_NETWORK.explorerUrl}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer" aria-label="View transaction on BscScan">↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          coverage
            ? <p className="chartCoverage" translate="no">{zh ? `区块 ${coverage.fromBlock} 至 ${coverage.toBlock} 之间没有交易。` : `No trades between blocks ${coverage.fromBlock} and ${coverage.toBlock}.`}</p>
            : <p className="chartCoverage">Trade history is unavailable right now.</p>
        )}
      </section>
    </div>
  );
}
