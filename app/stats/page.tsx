"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

type Stats = {
  chainId: number;
  totalLaunches: number;
  asOf: string;
  blockNumber: string;
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/v1/stats", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error?.message || "Onchain statistics unavailable.");
        setStats(body.data);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Onchain statistics unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <main className="page">
    <section className="pageHeading"><div><span className="eyebrow">FORTUNE STATS</span><h1>Numbers you can verify.</h1><p>Launch counts come from the configured onchain factories. Burns, rewards, revenue and volume appear only when their full event ledgers can be reconstructed.</p></div><Link href="/status" className="secondaryCta">System status →</Link></section>
    {error ? <div className="registryNotice statusError"><strong>DATA UNAVAILABLE</strong><span>{error}</span></div> : null}
    <div className="metricsGrid five">
      <div className="metric"><span>Network</span><strong>{FORTUNE_NETWORK.chainName}</strong><small>Chain {FORTUNE_NETWORK.chainId}</small></div>
      <div className="metric"><span>Verified launches</span><strong>{loading ? "Checking…" : stats ? stats.totalLaunches.toLocaleString() : "Unavailable"}</strong><small>Factory launchCount</small></div>
      <div className="metric"><span>Markets</span><strong><Link href="/explore">Explore →</Link></strong><small>Recent onchain launch details</small></div>
      <div className="metric"><span>Burn + Rewards v2</span><strong>Research</strong><small>Separate audit boundary</small></div>
      <div className="metric"><span>Primary DEX</span><strong>PancakeSwap</strong><small>Standard graduation path</small></div>
    </div>
    <div className="twoColumn">
      <section className="panel"><span className="eyebrow">ONCHAIN RECORD</span><p>The launch total comes directly from the configured Standard and legacy testnet factories. Explore reads token and curve details from those contracts. A complete indexed phase and trading ledger is pending, so no aggregate phase or volume count is shown here.</p><p className="dataDisclaimer">Last checked: {stats ? new Date(stats.asOf).toLocaleString() : "—"}. {stats?.blockNumber ? <a href={`${FORTUNE_NETWORK.explorerUrl}/block/${stats.blockNumber}`} target="_blank" rel="noreferrer">Verify block {stats.blockNumber} ↗</a> : null}</p></section>
      <section className="panel"><span className="eyebrow">EVENT LEDGERS</span><div className="statRows"><div><span>Volume</span><strong>Not indexed</strong></div><div><span>Burns</span><strong>Not indexed</strong></div><div><span>Holder rewards</span><strong>Not indexed</strong></div><div><span>Revenue</span><strong>Not indexed</strong></div></div><p className="dataDisclaimer">No simulated volume, payout, or revenue totals.</p></section>
    </div>
  </main>;
}
