"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, formatUsd } from "@/lib/market-format";

export type ChartPoint = { timestamp: number; priceUsd: number; phase: "curve" | "anchor" | "amm" };
export type ChartTrade = { timestamp: number; side: "buy" | "sell"; usdValue: number | null };

type Props = {
  points: ChartPoint[];
  trades: ChartTrade[];
  fromTimestamp: number;
  toTimestamp: number;
  currentPrice: number | null;
  label: string;
  zh?: boolean;
};

const HEIGHT = 280;
const PAD = { top: 16, right: 74, bottom: 30, left: 12 };
const VOLUME_HEIGHT = 46;
const BUCKETS = 48;

function timeLabel(timestamp: number, span: number, zh: boolean) {
  const date = new Date(timestamp * 1000);
  const locale = zh ? "zh-CN" : "en-US";
  return span > 2 * 86_400
    ? date.toLocaleDateString(locale, { month: "short", day: "numeric" })
    : date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function PriceChart({ points, trades, fromTimestamp, toTimestamp, currentPrice, label, zh = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrap.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const model = useMemo(() => {
    const span = Math.max(1, toTimestamp - fromTimestamp);
    const plotWidth = width - PAD.left - PAD.right;
    const priceHeight = HEIGHT - PAD.top - PAD.bottom - VOLUME_HEIGHT - 8;
    const series = points.filter((point) => point.timestamp >= fromTimestamp && point.timestamp <= toTimestamp);
    const values = [...series.map((point) => point.priceUsd), ...(currentPrice !== null ? [currentPrice] : [])];
    let low = values.length ? Math.min(...values) : 0;
    let high = values.length ? Math.max(...values) : 1;
    if (high === low) { const pad = high === 0 ? 1 : Math.abs(high) * 0.1; low -= pad; high += pad; }
    else { const pad = (high - low) * 0.12; low -= pad; high += pad; }
    if (low < 0 && Math.min(...values) >= 0) low = 0;

    const x = (timestamp: number) => PAD.left + ((timestamp - fromTimestamp) / span) * plotWidth;
    const y = (price: number) => PAD.top + (1 - (price - low) / (high - low)) * priceHeight;

    // Step line: each price holds until the next trade; the last one runs to the head.
    let line = "";
    series.forEach((point, index) => {
      const px = x(point.timestamp), py = y(point.priceUsd);
      line += index === 0 ? `M${px},${py}` : `H${px}V${py}`;
    });
    const endPrice = currentPrice ?? series[series.length - 1]?.priceUsd ?? null;
    if (series.length) line += `H${x(toTimestamp)}` + (endPrice !== null ? `V${y(endPrice)}` : "");
    const flat = !series.length && currentPrice !== null ? `M${x(fromTimestamp)},${y(currentPrice)}H${x(toTimestamp)}` : "";
    const area = series.length ? `${line}V${PAD.top + priceHeight}H${x(series[0].timestamp)}Z` : "";

    const bucketSpan = span / BUCKETS;
    const buckets = Array.from({ length: BUCKETS }, () => ({ buy: 0, sell: 0 }));
    for (const trade of trades) {
      if (trade.timestamp < fromTimestamp || trade.timestamp > toTimestamp || trade.usdValue === null) continue;
      const index = Math.min(BUCKETS - 1, Math.floor((trade.timestamp - fromTimestamp) / bucketSpan));
      buckets[index][trade.side] += trade.usdValue;
    }
    const maxBucket = Math.max(0, ...buckets.map((bucket) => bucket.buy + bucket.sell));
    const volumeTop = HEIGHT - PAD.bottom - VOLUME_HEIGHT;
    const bars = buckets.map((bucket, index) => {
      const total = bucket.buy + bucket.sell;
      const barHeight = maxBucket > 0 ? Math.max(total > 0 ? 2 : 0, (total / maxBucket) * VOLUME_HEIGHT) : 0;
      return {
        x: PAD.left + (index / BUCKETS) * plotWidth + 1,
        width: Math.max(1, plotWidth / BUCKETS - 2),
        y: volumeTop + VOLUME_HEIGHT - barHeight,
        height: barHeight,
        buy: bucket.buy >= bucket.sell,
      };
    });

    const ticks = [0, 0.5, 1].map((t) => low + (high - low) * (1 - t));
    const timeTicks = [0, 0.5, 1].map((t) => fromTimestamp + span * t);
    return { x, y, line, flat, area, bars, ticks, timeTicks, series, span, priceHeight };
  }, [points, trades, fromTimestamp, toTimestamp, currentPrice, width]);

  const active = hover !== null ? model.series[hover] : null;

  function onPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!model.series.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    model.series.forEach((point, index) => {
      if (Math.abs(model.x(point.timestamp) - px) < Math.abs(model.x(model.series[best].timestamp) - px)) best = index;
    });
    setHover(best);
  }

  const last = model.series[model.series.length - 1];
  const summary = zh
    ? (model.series.length
      ? `${label}。${model.series.length} 个价格点，最新 ${formatPrice(last.priceUsd)}。`
      : `${label}。此时间段内没有交易${currentPrice !== null ? `；当前价格 ${formatPrice(currentPrice)}` : ""}。`)
    : (model.series.length
      ? `${label}. ${model.series.length} price points, last ${formatPrice(last.priceUsd)}.`
      : `${label}. No trades in this window${currentPrice !== null ? `; current price ${formatPrice(currentPrice)}` : ""}.`);

  return (
    <div className="priceChart" ref={wrap} translate="no">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        onPointerMove={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {model.ticks.map((price, index) => (
          <g key={index} className="chartGrid">
            <line x1={PAD.left} x2={width - PAD.right} y1={model.y(price)} y2={model.y(price)} />
            <text x={width - PAD.right + 8} y={model.y(price) + 4}>{formatPrice(price)}</text>
          </g>
        ))}
        {model.timeTicks.map((timestamp, index) => (
          <text key={index} className="chartTime" x={model.x(timestamp)} y={HEIGHT - 8} textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}>
            {timeLabel(timestamp, model.span, zh)}
          </text>
        ))}

        {model.bars.map((bar, index) => bar.height > 0 ? (
          <rect key={index} className={bar.buy ? "chartBarBuy" : "chartBarSell"} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1.5" />
        ) : null)}

        {model.area ? <path d={model.area} fill="url(#priceArea)" /> : null}
        {model.line ? <path d={model.line} className="chartLine" /> : null}
        {model.flat ? <path d={model.flat} className="chartLine chartLineIdle" /> : null}

        {model.series.map((point, index) => point.phase === "anchor" ? (
          <g key={index} className="chartAnchor">
            <line x1={model.x(point.timestamp)} x2={model.x(point.timestamp)} y1={PAD.top} y2={PAD.top + model.priceHeight} />
            <text x={model.x(point.timestamp) + 6} y={PAD.top + 12}>{zh ? "毕业" : "Graduation"}</text>
          </g>
        ) : model.series.length <= 120 ? (
          <circle key={index} className={point.phase === "amm" ? "chartDot chartDotAmm" : "chartDot"} cx={model.x(point.timestamp)} cy={model.y(point.priceUsd)} r="3" />
        ) : null)}

        {active ? (
          <g className="chartHover">
            <line x1={model.x(active.timestamp)} x2={model.x(active.timestamp)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
            <circle cx={model.x(active.timestamp)} cy={model.y(active.priceUsd)} r="5" />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div className="chartTooltip" style={{ left: Math.min(Math.max(model.x(active.timestamp), 70), width - 150) }}>
          <strong>{formatPrice(active.priceUsd)}</strong>
          <span>{new Date(active.timestamp * 1000).toLocaleString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span>{active.phase === "curve" ? (zh ? "Fortune 曲线" : "Fortune curve") : active.phase === "anchor" ? (zh ? "毕业锚点" : "Graduation anchor") : (zh ? "Pancake 池" : "Pancake pool")}</span>
        </div>
      ) : null}

      {!model.series.length ? (
        <p className="chartEmpty">
          {zh ? "此时间段内没有交易" : "No trades in this window"}{currentPrice !== null ? (zh ? ` · 价格 ${formatPrice(currentPrice)}` : ` · price ${formatPrice(currentPrice)}`) : ""}
        </p>
      ) : null}
      <span className="chartVolumeLabel">{(zh ? "所示近期交易量 · " : "Shown recent-trade volume · ") + formatUsd(
        trades.filter(trade => trade.timestamp >= fromTimestamp && trade.timestamp <= toTimestamp).every(trade => trade.usdValue !== null)
          ? trades.filter(trade => trade.timestamp >= fromTimestamp && trade.timestamp <= toTimestamp).reduce((sum, trade) => sum + trade.usdValue!, 0)
          : null
      )}</span>
    </div>
  );
}
