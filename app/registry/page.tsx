"use client";

import { useEffect, useMemo, useState } from "react";
import { assetCategories, assets } from "@/data/assets";
import type { AssetCategory } from "@/lib/types";

type Candidate = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  fortuneStatus: string;
  warning: string;
};

type XStockCandidate = {
  id: string | null;
  symbol: string | null;
  name: string;
  logo: string | null;
  isTradingHalted: boolean;
  deployments: Array<{ resolvedAddress?: string | null; [key: string]: unknown }>;
};

export default function RegistryPage() {
  const [active, setActive] = useState<AssetCategory | "Approved">("Approved");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [xstocks, setXstocks] = useState<XStockCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch("/api/registry/top-bsc")
        .then((response) => response.json())
        .then((data) => setCandidates(Array.isArray(data.tokens) ? data.tokens : [])),
      fetch("/api/registry/xstocks")
        .then((response) => response.json())
        .then((data) => setXstocks(Array.isArray(data.assets) ? data.assets : []))
        .catch(() => setXstocks([])),
    ]).finally(() => setLoading(false));
  }, []);

  const filteredApproved = useMemo(() => {
    const needle = query.toLowerCase();
    return assets.filter((asset) => {
      const categoryMatch = active === "Approved" || asset.category === active;
      const queryMatch =
        !needle ||
        asset.symbol.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle) ||
        asset.address?.toLowerCase().includes(needle);
      return categoryMatch && queryMatch;
    });
  }, [active, query]);

  const filteredCandidates = useMemo(() => {
    const needle = query.toLowerCase();
    return candidates.filter(
      (asset) =>
        !needle ||
        asset.symbol.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle) ||
        asset.address.toLowerCase().includes(needle)
    );
  }, [candidates, query]);

  const showingCandidates = active === "BSC 400";
  const showingXstocks = active === "xStocks" && xstocks.length > 0;

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE ASSET REGISTRY</span>
          <h1>Know what a market can use.</h1>
          <p>
            Discovery is permissionless. Quote, reward and graduation capabilities
            are explicit registry decisions with contract and oracle requirements.
          </p>
        </div>
        <div className="registryLegend">
          <span>● Quote</span><span>● Reward</span><span>● Graduation</span>
        </div>
      </section>

      <section className="registryPanel">
        <div className="categoryTabs">
          <button className={active === "Approved" ? "tabActive" : ""} onClick={() => setActive("Approved")}>
            Approved
          </button>
          {assetCategories.map((category) => (
            <button
              key={category}
              className={active === category ? "tabActive" : ""}
              onClick={() => setActive(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <input
          className="searchInput"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbol, name or BSC contract"
        />

        {showingXstocks && (
          <div className="registryNotice">
            <strong>Official xStocks metadata</strong>
            <span>
              BNB deployments shown here come from the xStocks public Assets API.
              Fortune capabilities still require registry approval, oracle review
              and eligibility controls.
            </span>
          </div>
        )}

        {showingCandidates && (
          <div className="registryNotice">
            <strong>BSC discovery catalog</strong>
            <span>
              The catalog ranks BNB Chain ecosystem assets by market cap when CoinGecko
              metadata includes a BSC contract. Candidate status alone does not
              grant Fortune pairing or reward permissions.
            </span>
          </div>
        )}

        <div className="registryTable">
          <div className="registryTableHead">
            <span>Asset</span><span>Category / source</span><span>Capabilities</span><span>Status</span>
          </div>

          {showingXstocks
            ? xstocks.map((asset) => {
                const address = asset.deployments[0]?.resolvedAddress || "Deployment found";
                return (
                  <div className="registryRow" key={asset.id || asset.symbol || address}>
                    <div className="registryAsset">
                      <span className="assetIconLarge">{(asset.symbol || "x").slice(0, 2)}</span>
                      <span><strong>{asset.symbol || "xStock"}</strong><small>{asset.name}</small></span>
                    </div>
                    <span>Official xStocks API · BNB</span>
                    <div className="capabilityList"><em>Awaiting Fortune approval</em></div>
                    <span className="candidateBadge">{asset.isTradingHalted ? "Trading halted" : "Discovered"}</span>
                  </div>
                );
              })
            : showingCandidates
            ? loading
              ? <div className="registryEmpty">Loading BSC catalog…</div>
              : filteredCandidates.map((asset) => (
                  <div className="registryRow" key={asset.address}>
                    <div className="registryAsset">
                      <span className="assetIconLarge">{asset.symbol.slice(0, 2)}</span>
                      <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
                    </div>
                    <span>BNB ecosystem market-cap discovery</span>
                    <div className="capabilityList"><em>Pending review</em></div>
                    <span className="candidateBadge">Candidate</span>
                  </div>
                ))
            : filteredApproved.map((asset) => (
                <div className="registryRow" key={asset.id}>
                  <div className="registryAsset">
                    <span className="assetIconLarge">{asset.icon}</span>
                    <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
                  </div>
                  <span>{asset.category}{asset.chain !== "BSC" ? " · " + asset.chain : ""}</span>
                  <div className="capabilityList">
                    {asset.capabilities.length
                      ? asset.capabilities.map((cap) => <em key={cap}>{cap}</em>)
                      : <em>None on BSC</em>}
                  </div>
                  <span className={"verificationBadge verification" + asset.verification.replace(" ", "")}>
                    {asset.verification}
                  </span>
                </div>
              ))}
        </div>
      </section>
    </main>
  );
}
