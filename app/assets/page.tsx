"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";

type Row = {
  key: string;
  symbol: string;
  name: string;
  address?: string | null;
  category: string;
  source: string;
  launchable: boolean;
  status: string;
  priceUsd?: number | string | null;
};

type Tab = "approved" | "bnb" | "stocks" | "penny" | "china";

function asRows(tab: Tab, body: any): Row[] {
  if (tab === "approved") {
    return (body?.data?.items || []).map((item: any) => ({
      key: item.address,
      symbol: item.symbol || "TOKEN",
      name: item.name || item.symbol || "Asset",
      address: item.address,
      category: item.category || "Registered",
      source: "Fortune onchain registry",
      launchable: Boolean(item.launchable),
      status: item.launchable
        ? "Launchable now"
        : item.healthy
          ? "Registered"
          : item.healthReason || "Health check failed",
      priceUsd: item.priceUsd1e18
        ? Number(item.priceUsd1e18) / 1e18
        : null,
    }));
  }

  if (tab === "bnb") {
    return (body?.tokens || []).map((item: any, index: number) => ({
      key: item.address || item.id || String(index),
      symbol: item.symbol || "TOKEN",
      name: item.name || item.symbol || "BSC asset",
      address: item.address || null,
      category: item.category || "BNB Chain",
      source: body?.source || "BNB discovery",
      launchable: false,
      status: "Discovery candidate",
      priceUsd: item.priceUsd ?? null,
    }));
  }

  if (tab === "stocks") {
    const list = body?.assets || [];
    return list.flatMap((item: any, index: number) => {
      const deployments = Array.isArray(item.deployments)
        ? item.deployments
        : [];
      if (!deployments.length) {
        return [{
          key: item.id || item.symbol || String(index),
          symbol: item.symbol || "STOCK",
          name: item.name || item.symbol || "Tokenized stock",
          address: null,
          category: "Tokenized stocks",
          source: "xStocks",
          launchable: false,
          status: "Discovery only",
        }];
      }

      return deployments.map((deployment: any, depIndex: number) => ({
        key:
          deployment.pairingAsset ||
          deployment.resolvedWrapperAddress ||
          deployment.resolvedAddress ||
          (item.id || item.symbol || String(index)) + "-" + depIndex,
        symbol: item.symbol || "STOCK",
        name: item.name || item.symbol || "Tokenized stock",
        address:
          deployment.pairingAsset ||
          deployment.resolvedWrapperAddress ||
          deployment.resolvedAddress ||
          null,
        category: "Tokenized stocks",
        source: "xStocks",
        launchable: false,
        status: deployment.pairable
          ? "Pairing candidate"
          : "Wrapper / eligibility required",
      }));
    });
  }

  if (tab === "penny") {
    return (body?.catalog || []).map((item: any, index: number) => ({
      key:
        item.pairableRepresentations?.[0]?.pairingAddress ||
        item.symbol ||
        String(index),
      symbol: item.symbol || "STOCK",
      name: item.name || item.symbol || "NASDAQ stock",
      address:
        item.pairableRepresentations?.[0]?.pairingAddress || null,
      category: "NASDAQ Penny Stocks",
      source: "NASDAQ + BSC token providers",
      launchable: false,
      status: item.pairable
        ? "BSC representation found"
        : "Discovery only",
      priceUsd: item.lastPrice ?? null,
    }));
  }

  return (body?.stocks || []).map((item: any, index: number) => ({
    key: item.pairingAsset || item.underlyingTicker || String(index),
    symbol: item.symbol || item.underlyingTicker || "STOCK",
    name: item.company || item.xstockName || "China stock",
    address: item.pairingAsset || null,
    category: "China Stocks",
    source: "xStocks",
    launchable: false,
    status: item.pairable ? "BSC representation found" : item.status || "Discovery only",
  }));
}

const endpoints: Record<Tab, string> = {
  approved: "/api/public/v1/assets?limit=250",
  bnb: "/api/registry/top-bsc",
  stocks: "/api/registry/xstocks",
  penny: "/api/registry/penny-stocks?limit=300",
  china: "/api/registry/china-stocks",
};

const labels: Record<Tab, string> = {
  approved: "Launchable",
  bnb: "BNB universe",
  stocks: "Tokenized stocks",
  penny: "Penny stocks",
  china: "China stocks",
};

function short(address?: string | null) {
  if (!address) return "—";
  return address.slice(0, 7) + "…" + address.slice(-5);
}

export default function AssetsPage() {
  const [tab, setTab] = useState<Tab>("approved");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(endpoints[tab], { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            body?.error?.message ||
            body?.error ||
            "Asset universe unavailable."
          );
        }
        if (!cancelled) setRows(asRows(tab, body));
      })
      .catch((nextError) => {
        if (!cancelled) {
          setRows([]);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Asset universe unavailable."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [
        row.symbol,
        row.name,
        row.address,
        row.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, query]);

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <FortuneLogo size="md" />
          <span className="eyebrow">FORTUNE ASSET UNIVERSE</span>
          <h1>Launch against the BNB economy.</h1>
          <p>
            Crypto assets, stablecoins, wrapped real-world assets, tokenized
            stocks, and discovery catalogs live in one place. Fortune only
            labels an asset “Launchable now” after the active onchain registry
            and oracle checks actually pass.
          </p>
        </div>
        <Link href="/launch" className="primaryCta">
          Build a launch →
        </Link>
      </section>

      <section className="registryNotice">
        <strong>UNIVERSE-FIRST, NOT FAKE SUPPORT</strong>
        <span>
          Discovery is broad. Reserve custody is strict. Any asset can be
          surfaced; only registry-approved, oracle-healthy assets can hold
          launch reserves.
        </span>
      </section>

      <section className="panel assetUniverseControls">
        <div className="filterTabs">
          {(Object.keys(labels) as Tab[]).map((key) => (
            <button
              key={key}
              className={tab === key ? "tabActive" : ""}
              onClick={() => setTab(key)}
            >
              {labels[key]}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbol, name or address"
        />
      </section>

      {error ? (
        <section className="registryNotice statusError">
          <strong>CATALOG READ FAILED</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="registryPanel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">{labels[tab]}</span>
            <h2>
              {loading
                ? "Loading…"
                : filtered.length.toLocaleString() + " assets"}
            </h2>
          </div>
          <span>
            {tab === "approved"
              ? "Onchain source of truth"
              : "Discovery catalog"}
          </span>
        </div>

        <div className="registryTable">
          <div className="registryTableHead assetUniverseHead">
            <span>Asset</span>
            <span>Category</span>
            <span>Address</span>
            <span>Status</span>
          </div>

          {filtered.map((row) => (
            <div className="registryRow assetUniverseRow" key={row.key}>
              <div className="registryAsset">
                <span className="assetIconLarge">
                  {row.symbol.slice(0, 2)}
                </span>
                <span>
                  <strong>{row.symbol}</strong>
                  <small>{row.name}</small>
                </span>
              </div>
              <span>{row.category}</span>
              <span title={row.address || undefined}>
                {short(row.address)}
              </span>
              <span
                className={
                  "verificationBadge " +
                  (row.launchable
                    ? "verificationVerified"
                    : "")
                }
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
