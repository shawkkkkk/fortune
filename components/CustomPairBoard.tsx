"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { PairChips } from "@/components/PairAssets";
import type { CustomPairLaunch } from "@/lib/custom-pairs-read";
import { formatAge, formatAmount, formatUnitPrice, shortAddress } from "@/lib/market-format";

type Board = { configured: boolean; total: number; launches: CustomPairLaunch[] };

function statusText(phase: CustomPairLaunch["phase"]) {
  if (phase === "GraduationReady") return "Ready to graduate";
  if (phase === "Graduated") return "Pancake V2";
  if (phase === "Rescued") return "Rescue";
  return "Curve";
}

/** Custom-pair beta launches on Explore. Hidden when the beta is not deployed. */
export default function CustomPairBoard() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/v1/custom-pairs?limit=12", { signal: controller.signal })
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
      <section className="panel customPairTeaser" id="custom-pairs">
        <div>
          <span className="eyebrow">CUSTOM PAIRS · BETA</span>
          <h2>Pair with any token</h2>
          <p className="fieldHint">Launch against any BEP-20, including tokenized stocks and tokens with a transfer tax. Check how a token behaves before you launch.</p>
        </div>
        <Link className="secondaryCta" href="/launch/custom">Check a token →</Link>
      </section>
    );
  }

  return (
    <section className="customPairBoard" id="custom-pairs" aria-busy={!board && !error}>
      <div className="holdingsHead">
        <div>
          <span className="eyebrow">CUSTOM PAIRS · BETA · UNAUDITED</span>
          <h2>Paired with any token</h2>
        </div>
        <Link className="secondaryCta" href="/launch/custom">Launch a custom pair →</Link>
      </div>
      {error ? <p className="chartCoverage" role="alert">Custom-pair launches could not be read right now.</p> : null}
      {board && !board.launches.length ? (
        <div className="emptyPanel">
          <strong>No custom-pair launches yet.</strong>
          <span>The first one will appear here, read straight from the custom-pair factory.</span>
        </div>
      ) : null}
      {board?.launches.length ? (
        <div className="launchGrid">
          {board.launches.map((launch) => {
            const price = Number(BigInt(launch.spotPriceX18)) / 1e18 / 10 ** launch.pair.decimals;
            const marketCap = price * Number(formatUnits(BigInt(launch.totalSupply), 18));
            return (
              <div className="launchCardWrap" key={launch.curve}>
                <Link href={`/custom/${launch.curve}`} className="launchCard">
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
                  <PairChips pairs={[{ address: launch.pair.address, symbol: launch.pair.symbol }]} zh={zh} />
                  <div className="marketStats">
                    <div><span>Price</span><strong translate="no">{formatUnitPrice(price)} {launch.pair.symbol}</strong></div>
                    <div><span>Market cap</span><strong translate="no">{formatAmount(marketCap)} {launch.pair.symbol}</strong></div>
                    <div><span>Trades</span><strong translate="no">{launch.tradeCount}</strong></div>
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
