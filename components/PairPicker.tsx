"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import PairAddressCheck from "@/components/PairAddressCheck";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assetCoinStyle, formatPrice, formatUsd, shortAddress } from "@/lib/market-format";
import { formatEtTime, usMarketStatus, type UsMarketStatus } from "@/lib/market-hours";
import type { UniverseAsset } from "@/lib/pair-universe";

type Universe = {
  chainId: number;
  snapshot: { generatedAt: string; verifiedAtBlock: number; chainId: number };
  coverage: { registry: boolean; marketData: boolean; preIpoReferences: boolean };
  featured: string[];
  items: UniverseAsset[];
};

type Tab = "featured" | "crypto" | "stocks" | "rwa" | "preipo" | "new" | "any";
type Issuer = "all" | "bStocks" | "Ondo" | "xStocks";
type Kind = "all" | "stock" | "etf";

const PAGE = 36;
const BSC_EXPLORER = "https://bscscan.com";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "featured", label: "Featured" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "rwa", label: "RWA" },
  { key: "preipo", label: "Pre-IPO" },
  { key: "new", label: "New" },
  { key: "any", label: "Any token" },
];

export const REASON_TEXT: Record<string, string> = {
  MAINNET_ONLY: "Lives on BNB Smart Chain mainnet. This testnet alpha pairs only with its own valueless test assets.",
  NOT_IN_ACTIVE_REGISTRY: "Not approved in Fortune's onchain Asset Registry.",
  RWA_OUT_OF_SCOPE_V1: "Tokenized stocks, funds, commodities and pre-IPO tokens are outside the mainnet v1 asset policy.",
  REBASING_NEEDS_WRAPPER: "Balances follow a share multiplier. Fortune needs a non-rebasing wrapper before pairing.",
  STANDARD_MAINNET_WBNB_ONLY: "Standard launches on mainnet v1 pair with WBNB only.",
  EXTERNAL_PERP_REFERENCE: "An external perpetual market, not a BEP-20 token. Shown as a price reference.",
  NOT_ON_BNB_CHAIN: "Not deployed on BNB Chain. Shown as a price reference.",
  ASSET_INACTIVE: "The registry has this asset switched off.",
  ORACLE_UNHEALTHY: "Its price oracle is stale or unhealthy right now.",
  QUOTE_DISABLED: "Not enabled as a payment asset.",
  GRADUATION_DISABLED: "Not enabled for graduation pools.",
  UNSUPPORTED_CHAIN: "Unsupported network.",
};

function Coin({ asset }: { asset: UniverseAsset }) {
  const [failed, setFailed] = useState(false);
  if (asset.image && !failed) {
    return <img className="pickCoin" src={asset.image} alt="" width={40} height={40} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return <span className="pickCoin pickCoinMono" style={assetCoinStyle(asset.symbol)} aria-hidden="true">{asset.symbol.replace(/^W(?=BNB)/, "").slice(0, 2)}</span>;
}

function Flame() {
  // Heroicons "fire" (MIT).
  return (
    <svg className="pickFlame" viewBox="0 0 20 20" width="14" height="14" role="img" aria-label="Hot">
      <path fill="currentColor" fillRule="evenodd" d="M13.5 4.938a7 7 0 1 1-9.006 1.737c.202-.257.59-.218.793.039.278.352.594.672.943.954.332.269.786-.049.773-.476a5.977 5.977 0 0 1 .572-2.759 6.026 6.026 0 0 1 2.486-2.665c.247-.14.55-.016.677.238A6.967 6.967 0 0 0 13.5 4.938ZM14 12a4 4 0 0 1-4 4c-1.913 0-3.52-1.398-3.91-3.182-.093-.429.44-.643.814-.413a4.043 4.043 0 0 0 1.601.564c.303.038.531-.24.51-.544a5.975 5.975 0 0 1 1.315-4.192.447.447 0 0 1 .431-.16A4.001 4.001 0 0 1 14 12Z" clipRule="evenodd" />
    </svg>
  );
}

function changeText(value: number | null) {
  if (value === null) return null;
  return (value > 0 ? "+" : "") + value.toFixed(Math.abs(value) >= 10 ? 1 : 2) + "%";
}

function isStockLike(asset: UniverseAsset) {
  return asset.chainId === 56 && (asset.kind === "stock" || asset.kind === "etf" || (asset.kind === "commodity" && asset.provider !== "Tether" && asset.provider !== "Matrixdock"));
}

function sessionLine(status: UsMarketStatus, zh: boolean, now: number) {
  const when = status.nextChange ? formatEtTime(status.nextChange, now) : null;
  if (zh) {
    if (status.session === "regular") return "美股交易中" + (when ? ` · ${when} 收盘` : "");
    if (status.session === "pre") return "盘前交易" + (when ? ` · ${when} 开盘` : "");
    if (status.session === "after") return "盘后交易" + (when ? ` · ${when} 结束` : "");
    return "美股休市" + (when ? ` · ${when} 盘前开始` : "");
  }
  if (status.session === "regular") return "US market open" + (when ? ` · closes ${when}` : "");
  if (status.session === "pre") return "Pre-market" + (when ? ` · opens ${when}` : "");
  if (status.session === "after") return "After hours" + (when ? ` · ends ${when}` : "");
  return (status.holiday ? `US market closed for ${status.holiday}` : "US market closed") + (when ? ` · pre-market ${when}` : "");
}

export type PairUniverseSummary = Pick<Universe, "chainId" | "snapshot" | "coverage" | "items">;

export default function PairPicker({
  mode,
  selectable = [],
  selected = null,
  onSelect,
  onLoaded,
}: {
  mode: "browse" | "select";
  /** Select mode: addresses from the launch form's own registry read. Nothing else can be chosen. */
  selectable?: string[];
  selected?: string | null;
  onSelect?: (address: string) => void;
  onLoaded?: (universe: PairUniverseSummary) => void;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const router = useRouter();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("featured");
  const [issuer, setIssuer] = useState<Issuer>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [inspected, setInspected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch("/api/public/v1/universe", { cache: "no-store", signal: AbortSignal.timeout(30_000) })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body?.data?.items)) throw new Error(body?.error?.message || "Pair universe unavailable.");
        if (!cancelled) {
          setUniverse(body.data as Universe);
          onLoaded?.(body.data as Universe);
        }
      })
      .catch(() => { if (!cancelled) setError("The pair universe could not load. Registry-approved pairs are still checked when you launch."); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectableSet = useMemo(() => new Set(selectable.map((address) => address.toLowerCase())), [selectable]);
  const canUse = (asset: UniverseAsset) => mode === "select" && asset.fortune.status === "launchable" && Boolean(asset.address && selectableSet.has(asset.address.toLowerCase()));

  // A selection made elsewhere (draft restore, default pair) is shown in the panel.
  useEffect(() => {
    if (!selected || !universe) return;
    const match = universe.items.find((item) => item.address?.toLowerCase() === selected.toLowerCase());
    if (match) setInspected((current) => current ?? match.id);
  }, [selected, universe]);

  const hasNew = Boolean(universe?.items.some((item) => item.isNew));
  const tabs = TABS.filter((item) => item.key !== "new" || hasNew);

  const rows = useMemo(() => {
    if (!universe) return [];
    const needle = query.trim().toLowerCase();
    let list = universe.items;
    if (needle) {
      list = list.filter((item) => [item.symbol, item.name, item.provider, item.underlying, item.address].filter(Boolean).join(" ").toLowerCase().includes(needle));
    } else if (tab === "featured") {
      const order = new Map(universe.featured.map((id, index) => [id, index]));
      list = list.filter((item) => order.has(item.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    } else if (tab === "new") {
      list = list.filter((item) => item.isNew);
    } else if (tab !== "any") {
      list = list.filter((item) => item.group === tab);
    }
    if (tab === "stocks" && !needle) {
      if (issuer !== "all") list = list.filter((item) => item.provider === issuer);
      if (kind !== "all") list = list.filter((item) => item.kind === kind);
    }
    return list;
  }, [universe, tab, issuer, kind, query]);

  const inspectedAsset = universe?.items.find((item) => item.id === inspected) ?? null;
  const market = usMarketStatus(now);
  const addressQuery = /^0x[0-9a-fA-F]{40}$/.test(query.trim()) ? query.trim() : "";

  function choose(asset: UniverseAsset) {
    setInspected(asset.id);
    setCopied(false);
    if (canUse(asset) && asset.address) onSelect?.(asset.address);
  }

  function switchTab(next: Tab) {
    setTab(next);
    setShown(PAGE);
    setQuery("");
  }

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch { setCopied(false); }
  }

  return (
    <div className={"pairPicker pairPicker-" + mode}>
      <div className="pickTabs" role="group" aria-label="Pair categories">
        {tabs.map((item) => (
          <button key={item.key} type="button" className={tab === item.key ? "active" : ""} aria-pressed={tab === item.key} onClick={() => switchTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "any" ? (
        <div className="pickAny">
          <PairAddressCheck
            key={addressQuery}
            initialAddress={addressQuery}
            onSelect={(address) => {
              // Browse mode hands a checked, launchable pair to the launch form, which re-reads the registry.
              if (mode === "browse") { router.push(`/launch?pair=${address}`); return true; }
              if (!selectableSet.has(address.toLowerCase())) return false;
              onSelect?.(address);
              return true;
            }}
          />
        </div>
      ) : (
        <>
          <div className="pickToolbar">
            <input type="search" aria-label="Search pairs by name, ticker or contract" value={query} onChange={(event) => { setQuery(event.target.value); setShown(PAGE); }} placeholder="Search name, ticker or contract" />
            {tab === "stocks" || tab === "rwa" ? (
              <span className={"pickSession pickSession-" + market.session} translate="no" title="Tokenized stocks trade onchain 24/7. Outside US market hours their price can drift from the listed share and gap at the next open.">
                <i aria-hidden="true" />{sessionLine(market, zh, now)}
              </span>
            ) : null}
          </div>

          {tab === "stocks" && !query.trim() ? (
            <div className="pickFilters">
              <div role="group" aria-label="Stock issuer">
                {(["all", "bStocks", "Ondo", "xStocks"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={issuer === value} className={issuer === value ? "active" : ""} onClick={() => { setIssuer(value); setShown(PAGE); }}>{value === "all" ? "All issuers" : value}</button>
                ))}
              </div>
              <div role="group" aria-label="Stock type">
                {(["all", "stock", "etf"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => { setKind(value); setShown(PAGE); }}>{value === "all" ? "All types" : value === "stock" ? "Stocks" : "ETFs"}</button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "preipo" && !query.trim() ? (
            <p className="pickNote">Pre-IPO tokens are issuer-structured claims, not shares. Fortune lists what exists on BNB Chain and shows other venues as price references.</p>
          ) : null}

          {error ? (
            <div className="registryNotice statusError" role="status"><strong>PAIR UNIVERSE UNAVAILABLE</strong><span>{error}</span><button type="button" className="secondaryCta" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>
          ) : !universe ? (
            <div className="pickGrid" aria-busy="true" aria-label="Loading pairs">
              {Array.from({ length: 8 }, (_, index) => <span key={index} className="pickTile pickSkeleton" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="pickEmpty" role="status">
              <strong>No pair matches.</strong>
              {addressQuery ? <button type="button" className="secondaryCta" onClick={() => setTab("any")}>Check this contract on {FORTUNE_NETWORK.chainName}</button> : <p>Try a ticker such as NVDA, a company name or a contract address.</p>}
            </div>
          ) : (
            <>
              <p className="pickCount" translate="no" aria-live="polite">{zh ? `${rows.length.toLocaleString()} 个资产` : `${rows.length.toLocaleString()} ${rows.length === 1 ? "asset" : "assets"}`}</p>
              <div className="pickGrid">
                {rows.slice(0, shown).map((asset) => {
                  const usable = canUse(asset);
                  const isSelected = Boolean(selected && asset.address && selected.toLowerCase() === asset.address.toLowerCase());
                  const change = changeText(asset.market.change24h);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={"pickTile" + (inspected === asset.id ? " inspected" : "") + (isSelected ? " selected" : "") + (usable ? " usable" : "")}
                      aria-pressed={mode === "select" ? isSelected : inspected === asset.id}
                      onClick={() => choose(asset)}
                    >
                      <Coin asset={asset} />
                      <span className="pickTileText">
                        <span className="pickTileTitle">
                          <strong translate="no">{asset.symbol}</strong>
                          {asset.hot ? <Flame /> : null}
                          {asset.isNew ? <em className="pickNew">NEW</em> : null}
                        </span>
                        <small translate="no">{asset.name}{asset.provider ? " · " + asset.provider : ""}</small>
                      </span>
                      <span className="pickTileMarket" translate="no">
                        <span>{formatPrice(asset.market.priceUsd)}</span>
                        {change ? <small className={asset.market.change24h! >= 0 ? "up" : "down"}>{change}</small> : null}
                      </span>
                      {asset.fortune.status === "launchable" ? <span className="pickBadge pickBadgeOk">{isSelected ? "Selected" : "Launchable"}</span>
                        : asset.fortune.status === "reference" ? <span className="pickBadge">Reference</span> : null}
                    </button>
                  );
                })}
              </div>
              {rows.length > shown ? <button type="button" className="secondaryCta pickMore" onClick={() => setShown((value) => value + PAGE * 2)}>Show more</button> : null}
            </>
          )}
        </>
      )}

      {inspectedAsset ? (
        <section className={"pickDetail pickDetail-" + inspectedAsset.fortune.status} aria-live="polite" aria-label="Eligibility check">
          <header>
            <Coin asset={inspectedAsset} />
            <div>
              <strong translate="no">{inspectedAsset.symbol} · {inspectedAsset.name}</strong>
              <span translate="no">{[inspectedAsset.provider, inspectedAsset.venue].filter(Boolean).join(" · ") || (inspectedAsset.chainId === 56 ? "BNB Smart Chain" : FORTUNE_NETWORK.chainName)}</span>
            </div>
          </header>

          {inspectedAsset.fortune.status === "launchable" ? (
            <p className="pickVerdict ok"><b aria-hidden="true">✓</b><span>Eligibility check passed</span></p>
          ) : inspectedAsset.fortune.status === "reference" ? (
            <p className="pickVerdict ref"><b aria-hidden="true">i</b><span>Price reference only</span></p>
          ) : (
            <p className="pickVerdict no"><b aria-hidden="true">✕</b><span>Not available for Fortune launches yet</span></p>
          )}
          {inspectedAsset.fortune.status === "launchable" ? (
            <p className="fieldHint">{mode === "select" && !canUse(inspectedAsset) ? "Reload the page to refresh this form's approved pairs." : "Eligibility is checked again onchain, with a fresh oracle price, before your wallet signs."}</p>
          ) : (
            <ul className="pickReasons">{inspectedAsset.fortune.reasons.map((reason) => <li key={reason}>{REASON_TEXT[reason] ?? reason}</li>)}</ul>
          )}

          <dl className="pickFacts">
            <div><dt>Price</dt><dd translate="no">{formatPrice(inspectedAsset.market.priceUsd)}{changeText(inspectedAsset.market.change24h) ? " · " + changeText(inspectedAsset.market.change24h) : ""}</dd></div>
            <div><dt>24h volume</dt><dd translate="no">{formatUsd(inspectedAsset.market.volume24h)}</dd></div>
            {inspectedAsset.market.marketCap ? <div><dt>Market cap</dt><dd translate="no">{formatUsd(inspectedAsset.market.marketCap)}</dd></div> : null}
            {inspectedAsset.underlying && inspectedAsset.underlying !== inspectedAsset.name ? <div><dt>Underlying</dt><dd translate="no">{inspectedAsset.underlying}</dd></div> : null}
            {inspectedAsset.address ? (
              <div className="pickContract">
                <dt>Contract</dt>
                <dd>
                  <a translate="no" href={`${inspectedAsset.chainId === 56 ? BSC_EXPLORER : FORTUNE_NETWORK.explorerUrl}/token/${inspectedAsset.address}`} target="_blank" rel="noreferrer">{shortAddress(inspectedAsset.address)} ↗</a>
                  <button type="button" className="pickCopy" onClick={() => void copy(inspectedAsset.address!)}>{copied ? "Copied" : "Copy"}</button>
                </dd>
              </div>
            ) : null}
            {inspectedAsset.decimals !== null ? <div><dt>Decimals</dt><dd translate="no">{inspectedAsset.decimals}</dd></div> : null}
            {inspectedAsset.controls ? (
              <div className="pickControls">
                <dt>Issuer controls</dt>
                <dd>
                  {inspectedAsset.controls.upgradeable ? <span>Upgradeable contract</span> : null}
                  {inspectedAsset.controls.pausable ? <span>Pause switch</span> : null}
                  {inspectedAsset.controls.rebasing ? <span>Share multiplier</span> : null}
                  {!inspectedAsset.controls.upgradeable && !inspectedAsset.controls.pausable && !inspectedAsset.controls.rebasing ? <span>None detected by Fortune's probe</span> : null}
                </dd>
              </div>
            ) : null}
            {isStockLike(inspectedAsset) ? <div><dt>Underlying market</dt><dd translate="no">{sessionLine(market, zh, now)}</dd></div> : null}
          </dl>
          {inspectedAsset.leveraged ? <p className="reviewWarning">Leveraged or inverse fund: its value resets daily and can fall much faster than the index it tracks.</p> : null}
          {inspectedAsset.notice ? (
            <p className="reviewWarning">{inspectedAsset.notice} {inspectedAsset.noticeSource ? <a href={inspectedAsset.noticeSource} target="_blank" rel="noreferrer">Source ↗</a> : null}</p>
          ) : null}
          {mode === "browse" && inspectedAsset.fortune.status === "launchable" && inspectedAsset.address ? (
            <Link className="primaryCta" href={`/launch?pair=${inspectedAsset.address}`}>Launch with {inspectedAsset.symbol} →</Link>
          ) : null}
        </section>
      ) : null}

      {universe ? (
        <p className="pickSource" translate="no">
          {zh
            ? `价格来自 CoinGecko、DexScreener 和 Lighter，可能延迟。合约身份已于 BNB Smart Chain 区块 ${universe.snapshot.verifiedAtBlock.toLocaleString()} 链上核验。`
            : `Prices from CoinGecko, DexScreener and Lighter; they can be delayed. Contract identity checked onchain at BNB Smart Chain block ${universe.snapshot.verifiedAtBlock.toLocaleString()}.`}
          {!universe.coverage.marketData ? (zh ? " 部分行情暂不可用。" : " Some market data is unavailable right now.") : ""}
        </p>
      ) : null}
    </div>
  );
}
