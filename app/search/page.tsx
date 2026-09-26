"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

type Launch = { id: string; token: string; curve: string; creator: string; name: string; symbol: string; status: string; mode: string };

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") || "");
    const controller = new AbortController();
    fetch("/api/public/v1/launches?limit=25", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error?.message || "Launch data unavailable.");
        setLaunches(body.data.items || []);
        setTotal(body.data.totalOnchain);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Launch data unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? launches.filter((item) => [item.name, item.symbol, item.token, item.curve, item.creator].some((field) => field.toLowerCase().includes(needle))) : launches;
  }, [query, launches]);

  return <main className="page narrowPage">
    <section className="pageHeading"><div><span className="eyebrow">DISCOVER · CHAIN {FORTUNE_NETWORK.chainId}</span><h1>Search Fortune.</h1><p>Search verified launches by name, ticker, token, curve or creator address. Results cover the most recent 25 onchain launches.</p></div></section>
    <label className="fieldGrid">Search recent launches<input className="marketSearch" value={query} onChange={(event) => { setQuery(event.target.value); const url = new URL(window.location.href); if (event.target.value) url.searchParams.set("q", event.target.value); else url.searchParams.delete("q"); window.history.replaceState(null, "", url); }} placeholder="Name, ticker or 0x address" autoComplete="off" /></label>
    {/^0x[a-fA-F0-9]{40}$/.test(query.trim()) ? <div className="heroActions"><Link className="primaryCta" href={`/token/${query.trim()}`}>Look up token in full factory history →</Link><Link className="secondaryCta" href={`/profile/${query.trim()}`}>View creator history →</Link></div> : null}
    <div className="registryNotice"><strong>{loading ? "LOADING" : error ? "UNAVAILABLE" : `${results.length} MATCHES`}</strong><span>{total == null ? "Reading configured Fortune factories" : `${total} total launches recorded by the factories; search covers the latest ${launches.length}.`}</span></div>
    {error ? <p role="alert">{error}</p> : null}
    {!loading && !error && results.length === 0 ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout-400.webp" alt="Fortune lucky cat" /><strong>No recent launch matched.</strong><p>Try a ticker or contract address. Older launches remain verifiable through the factory and BscScan.</p></section> : null}
    <div className="launchGrid">{results.map((item) => <article className="launchCard" key={item.token}><div className="launchCardTop"><div className="tokenAvatar">{item.symbol.slice(0,2)}</div><div><div className="tokenTitle"><strong>{item.name}</strong><span>{item.symbol}</span></div><div className="mutedSmall">{item.status} · {item.mode === "tax" ? "Legacy testnet" : "Standard"}</div></div></div><div className="heroActions"><Link className="secondaryCta" href={`/token/${item.token}`}>Token →</Link><Link className="secondaryCta" href={`/profile/${item.creator}`}>Creator →</Link><Link className="primaryCta" href={`/market/${item.curve}${item.mode === "tax" ? "?mode=tax" : ""}`}>Market →</Link></div></article>)}</div>
  </main>;
}
