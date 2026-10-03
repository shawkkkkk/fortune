"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { PairChips } from "@/components/PairAssets";
import type { StockRewardsLaunch } from "@/lib/stock-rewards-read";
import { formatAge, formatPrice, formatUsd, shortAddress } from "@/lib/market-format";

type Board = { configured: boolean; total: number; launches: StockRewardsLaunch[] };

function statusText(phase: StockRewardsLaunch["phase"]) {
  if (phase === "GraduationReady") return "Ready to graduate";
  if (phase === "Graduated") return "Pancake V3";
  if (phase === "Rescued") return "Rescue";
  return "Curve";
}

/** Stock Rewards beta launches on Explore. A teaser when the beta is not deployed. */
export default function StockRewardsBoard() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/v1/stock-rewards?limit=12", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (body?.data) setBoard(body.data);
        else setError(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  if (!board?.configured && !error) {
    return (
      <section className="panel customPairTeaser" id="stock-rewards">
        <div>
          <span className="eyebrow">STOCK REWARDS · BETA</span>
          <h2>Holders earn the stocks</h2>
          <p className="fieldHint">Pair a token with up to five tokenized stocks and pay its holders in every one of them, claimable onchain at any time.</p>
        </div>
        <Link className="secondaryCta" href="/launch/stock-rewards">See how it works →</Link>
      </section>
    );
  }

  return (
    <section className="customPairBoard" id="stock-rewards" aria-busy={!board && !error}>
      <div className="holdingsHead">
        <div>
          <span className="eyebrow">STOCK REWARDS · BETA · UNAUDITED</span>
          <h2>Holders earn the stocks</h2>
        </div>
        <Link className="secondaryCta" href="/launch/stock-rewards">Launch with stock rewards →</Link>
      </div>
      {error ? <p className="chartCoverage" role="alert">Stock Rewards launches could not be read right now.</p> : null}
      {board && !board.launches.length ? (
        <div className="emptyPanel">
          <strong>No Stock Rewards launches yet.</strong>
          <span>The first one will appear here, read straight from the Stock Rewards factory.</span>
        </div>
      ) : null}
      {board?.launches.length ? (
        <div className="launchGrid">
          {board.launches.map((launch) => {
            const price = Number(formatUnits(BigInt(launch.priceUsd1e18), 18));
            const marketCap = price * Number(formatUnits(BigInt(launch.totalSupply), 18));
            return (
              <div className="launchCardWrap" key={launch.curve}>
                <Link href={`/stock-rewards/${launch.curve}`} className="launchCard">
                  <div className="launchCardTop">
                    <div className="tokenAvatar" translate="no">{launch.symbol.slice(0, 2)}</div>
                    <div>
                      <div className="tokenTitle">
                        <strong translate="no">{launch.name}</strong>
                        <span translate="no">{launch.symbol}</span>
                      </div>
                      <div className="mutedSmall" translate="no">{zh ? "创建者 " : "by "}{shortAddress(launch.creator)} · {formatAge(launch.createdAt, zh)}</div>
                    </div>
                    <span className={"statusPill " + (launch.phase === "Graduated" ? "statusGraduated" : launch.phase === "GraduationReady" ? "statusGraduating" : "")}>{statusText(launch.phase)}</span>
                  </div>
                  <PairChips pairs={launch.stocks.map((stock) => ({ address: stock.address, symbol: stock.symbol }))} zh={zh} />
                  <div className="marketStats">
                    <div><span>Price</span><strong translate="no">{formatPrice(price)}</strong></div>
                    <div><span>Market cap</span><strong translate="no">{formatUsd(marketCap)}</strong></div>
                    <div><span>Holders get</span><strong translate="no">{(launch.holderFeeBps / 100).toFixed(2).replace(/\.?0+$/, "")}%</strong></div>
                  </div>
                  <div className="progressHeader"><span>Graduation</span><strong translate="no">{(launch.progressBps / 100).toFixed(2)}%</strong></div>
                  <div className="progressTrack"><span style={{ width: Math.min(100, launch.progressBps / 100) + "%" }} /></div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
      {board && board.total > board.launches.length ? <p className="fieldHint" translate="no">{zh ? `显示最新的 ${board.launches.length} 个（共 ${board.total} 个）。` : `Showing the newest ${board.launches.length} of ${board.total}.`}</p> : null}
    </section>
  );
}
