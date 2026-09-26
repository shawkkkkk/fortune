"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PairPicker, { type PairUniverseSummary } from "@/components/PairPicker";
import { useLanguage } from "@/components/LanguageProvider";

type Row = {
  key: string;
  symbol: string;
  name: string;
  address?: string | null;
  category: string;
  status: string;
  priceUsd?: number | string | null;
};

type ResearchTab = "penny" | "china";

function asRows(tab: ResearchTab, body: any): Row[] {
  if (tab === "penny") {
    return (body?.catalog || []).map((item: any, index: number) => ({
      key: item.pairableRepresentations?.[0]?.pairingAddress || item.symbol || String(index),
      symbol: item.symbol || "STOCK",
      name: item.name || item.symbol || "NASDAQ stock",
      address: item.pairableRepresentations?.[0]?.pairingAddress || null,
      category: "NASDAQ Penny Stocks",
      status: item.pairable ? "BSC representation found" : "Discovery only",
      priceUsd: item.lastPrice ?? null,
    }));
  }

  return (body?.stocks || []).map((item: any, index: number) => ({
    key: item.pairingAsset || item.underlyingTicker || String(index),
    symbol: item.symbol || item.underlyingTicker || "STOCK",
    name: item.company || item.xstockName || "China stock",
    address: item.pairingAsset || null,
    category: "China Stocks",
    status: item.pairable ? "BSC representation found" : item.status || "Discovery only",
  }));
}

const endpoints: Record<ResearchTab, string> = {
  penny: "/api/registry/penny-stocks?limit=300",
  china: "/api/registry/china-stocks",
};

const labels: Record<ResearchTab, string> = {
  penny: "NASDAQ penny stocks",
  china: "China stocks",
};

function short(address?: string | null) {
  if (!address) return "—";
  return address.slice(0, 7) + "…" + address.slice(-5);
}

function ResearchCatalogs() {
  const [tab, setTab] = useState<ResearchTab>("penny");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(endpoints[tab], { cache: "no-store", signal: AbortSignal.timeout(45_000) })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || body?.error || "Catalog unavailable.");
        if (!cancelled) setRows(asRows(tab, body));
      })
      .catch((nextError) => {
        if (!cancelled) {
          setRows([]);
          setError(nextError instanceof Error ? nextError.message : "Catalog unavailable.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.symbol, row.name, row.address, row.category].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <>
      <div className="panel assetUniverseControls">
        <div className="filterTabs">
          {(Object.keys(labels) as ResearchTab[]).map((key) => (
            <button key={key} type="button" className={tab === key ? "tabActive" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>
              {labels[key]}
            </button>
          ))}
        </div>
        <input aria-label="Search research catalog" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol, name or address" />
      </div>

      {error ? <div className="registryNotice statusError"><strong>CATALOG READ FAILED</strong><span>{error}</span></div> : null}

      <div className="registryTable">
        <div className="registryTableHead assetUniverseHead">
          <span>Asset</span>
          <span>Category</span>
          <span>Address</span>
          <span>Status</span>
        </div>
        {loading ? <p className="pickNote">Loading…</p> : filtered.map((row) => (
          <div className="registryRow assetUniverseRow" key={row.key}>
            <div className="registryAsset">
              <span className="assetIconLarge" translate="no">{row.symbol.slice(0, 2)}</span>
              <span>
                <strong translate="no">{row.symbol}</strong>
                <small translate="no">{row.name}</small>
              </span>
            </div>
            <span>{row.category}</span>
            <span title={row.address || undefined} translate="no">{short(row.address)}</span>
            <span className="verificationBadge">{row.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function AssetsPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [summary, setSummary] = useState<PairUniverseSummary | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);

  const counts = useMemo(() => {
    if (!summary) return null;
    const onBnb = summary.items.filter((item) => item.chainId === 56);
    return {
      stocks: onBnb.filter((item) => item.group === "stocks").length,
      issuers: new Set(onBnb.filter((item) => item.group === "stocks").map((item) => item.provider)).size,
      rwa: onBnb.filter((item) => item.group === "rwa").length,
      preipo: summary.items.filter((item) => item.group === "preipo").length,
      crypto: onBnb.filter((item) => item.group === "crypto").length,
      launchable: summary.items.filter((item) => item.fortune.status === "launchable").length,
    };
  }, [summary]);

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE PAIR UNIVERSE</span>
          <h1>Pair with the whole BNB economy.</h1>
          <p>
            Tokenized stocks, funds, gold and pre-IPO tokens on BNB Smart Chain,
            next to the majors, with live prices, issuer controls and US market
            hours. A launch can use an asset only after Fortune&apos;s onchain
            registry and oracle checks pass.
          </p>
        </div>
        <Link href="/launch" className="primaryCta">
          Build a launch →
        </Link>
      </section>

      {counts ? (
        <dl className="universeStats" translate="no">
          <div><dt>{zh ? "代币化股票与 ETF" : "Tokenized stocks & ETFs"}</dt><dd>{counts.stocks.toLocaleString()}</dd><dd className="universeNote">{zh ? `${counts.issuers} 家发行方` : `${counts.issuers} issuers on BNB Chain`}</dd></div>
          <div><dt>{zh ? "黄金与大宗商品" : "Gold & commodities"}</dt><dd>{counts.rwa}</dd><dd className="universeNote">{zh ? "BNB Chain 上" : "on BNB Chain"}</dd></div>
          <div><dt>{zh ? "IPO 前" : "Pre-IPO"}</dt><dd>{counts.preipo}</dd><dd className="universeNote">{zh ? "代币与参考市场" : "tokens and reference markets"}</dd></div>
          <div><dt>{zh ? "可发行配对" : "Launchable now"}</dt><dd>{counts.launchable}</dd><dd className="universeNote">{zh ? "已通过链上注册表" : "passed the onchain registry"}</dd></div>
        </dl>
      ) : null}

      <section className="registryNotice">
        <strong>UNIVERSE-FIRST, NOT FAKE SUPPORT</strong>
        <span>
          Discovery is broad. Reserve custody is strict. Any asset can be
          surfaced; only registry-approved, oracle-healthy assets can hold
          launch reserves.
        </span>
      </section>

      <section className="panel universePanel" aria-label="Pair universe">
        <PairPicker mode="browse" onLoaded={setSummary} />
      </section>

      <details className="panel researchCatalogs" onToggle={(event) => setResearchOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>More research catalogs · NASDAQ penny stocks and China stocks</summary>
        <p className="fieldHint">Tickers without a recognized BNB Chain token stay discoverable but are not pairable. A ticker alone is never enough.</p>
        {researchOpen ? <ResearchCatalogs /> : null}
      </details>
    </main>
  );
}
