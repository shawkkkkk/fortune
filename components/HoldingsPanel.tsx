"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { PairChips } from "@/components/PairAssets";
import WatchButton from "@/components/WatchButton";
import { formatAmount, formatPrice, formatShare, formatUsd } from "@/lib/market-format";

type Position = {
  token: string;
  curve: string;
  mode: "standard" | "tax";
  name: string;
  symbol: string;
  status: "Curve" | "GraduationReady" | "Pancake" | "Rescued";
  graduationProgress: number;
  priceUsd: number | null;
  pairs: Array<{ address: string; symbol: string }>;
  balance: string;
  share: number | null;
  valueUsd: number | null;
};

type Portfolio = {
  blockNumber: string | null;
  launchesScanned: number;
  held: number;
  created: number;
  totalValueUsd: number | null;
  unpricedPositions: number;
  positions: Position[];
};

function statusText(position: Position, zh: boolean) {
  if (position.status === "Pancake") return zh ? "已毕业" : "Graduated";
  if (position.status === "GraduationReady") return zh ? "即将毕业" : "Ready to graduate";
  if (position.status === "Rescued") return zh ? "已救援" : "Rescued";
  return zh ? `曲线 ${position.graduationProgress.toFixed(1)}%` : `Curve ${position.graduationProgress.toFixed(1)}%`;
}

/** Every Fortune launch an address holds, read onchain through the public portfolio API. */
export default function HoldingsPanel({ address, self = false }: { address: string; self?: boolean }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/public/v1/portfolio/${address}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error?.message || "Balances are unavailable right now.");
        setData(body.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Balances are unavailable right now.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [address]);

  const positions = data?.positions || [];
  return (
    <section className="panel holdingsPanel" aria-busy={loading}>
      <div className="holdingsHead">
        <div>
          <span className="eyebrow">HOLDINGS</span>
          <h2>{self ? "Your Fortune tokens" : "Fortune tokens held"}</h2>
        </div>
        <dl className="holdingsTotals">
          <div><dt>Total value</dt><dd translate="no">{data ? formatUsd(data.totalValueUsd) : "—"}</dd></div>
          <div><dt>Positions</dt><dd translate="no">{data ? data.held : "—"}</dd></div>
          <div><dt>Launched</dt><dd translate="no">{data ? data.created : "—"}</dd></div>
        </dl>
      </div>

      {loading && !data ? <p className="chartCoverage">Reading balances from BNB Chain…</p> : null}
      {error ? <p className="chartCoverage" role="alert">{error}</p> : null}

      {data && !positions.length ? (
        <div className="emptyPanel">
          <strong>{self ? "No Fortune tokens in this wallet yet." : "This address holds no Fortune tokens."}</strong>
          <span>Balances cover every launch recorded by the Fortune factory.</span>
          <div className="heroActions">
            <Link className="primaryCta" href="/explore">Explore launches →</Link>
          </div>
        </div>
      ) : null}

      {positions.length ? (
        <ul className="holdingsList">
          {positions.map((position) => (
            <li className="holdingRow" key={position.token}>
              <div className="holdingToken">
                <span className="tokenAvatar" aria-hidden="true">{position.symbol.slice(0, 2)}</span>
                <div>
                  <Link className="holdingName" href={`/token/${position.token}`} translate="no">
                    <strong>{position.name}</strong> <span>{position.symbol}</span>
                  </Link>
                  <span className={"holdingStatus" + (position.status === "Pancake" ? " graduated" : "")} translate="no">{statusText(position, zh)}</span>
                  <PairChips pairs={position.pairs} zh={zh} />
                </div>
              </div>
              <div className="holdingFigure">
                <span>Balance</span>
                <strong translate="no">{formatAmount(Number(position.balance))}</strong>
                <small translate="no">{position.share === null ? "—" : (zh ? `占供应量 ${formatShare(position.share)}` : `${formatShare(position.share)} of supply`)}</small>
              </div>
              <div className="holdingFigure">
                <span>Price</span>
                <strong translate="no">{formatPrice(position.priceUsd)}</strong>
              </div>
              <div className="holdingFigure holdingValue">
                <span>Value</span>
                <strong translate="no">{formatUsd(position.valueUsd)}</strong>
              </div>
              <div className="holdingActions">
                <WatchButton token={position.token} symbol={position.symbol} />
                <Link className="secondaryCta" href={`/market/${position.curve}${position.mode === "tax" ? "?mode=tax" : ""}`}>Trade →</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {data ? (
        <p className="fieldHint" translate="no">
          {zh
            ? `在区块 ${data.blockNumber} 读取全部 ${data.launchesScanned} 个 Fortune 发行的余额。价值按实时曲线或官方池价格计算，并非卖出报价。`
            : `Balances of all ${data.launchesScanned} Fortune launches, read at block ${data.blockNumber}. Values use live curve or official-pool prices and are not sale quotes.`}
          {data.held > positions.length ? (zh ? ` 显示最新的 ${positions.length} 个持仓（共 ${data.held} 个）。` : ` Showing the newest ${positions.length} of ${data.held} positions.`) : ""}
          {data.unpricedPositions ? (zh ? ` ${data.unpricedPositions} 个持仓暂无价格，未计入总价值。` : ` ${data.unpricedPositions} unpriced position${data.unpricedPositions === 1 ? " is" : "s are"} left out of the total.`) : ""}
        </p>
      ) : null}
    </section>
  );
}
