"use client";

import { useEffect, useMemo, useState } from "react";
import { assetCategories, assets } from "@/data/assets";
import type { AssetCategory, FortuneAsset } from "@/lib/types";

type BscCandidate = {
  rank: number;
  symbol: string;
  name: string;
  address: string;
  marketCap?: number | null;
};

type ChinaStockCandidate = {
  rank: number;
  company: string;
  underlyingTicker: string;
  symbol?: string | null;
  wrapperAddress?: string | null;
  pairable: boolean;
  status: string;
};

type NasdaqTokenizedResult = {
  provider: string;
  tokenSymbol?: string | null;
  pairingAddress?: string | null;
  pairable: boolean;
  underlyingTicker: string;
  underlyingCompany?: string | null;
  pennyStock?: boolean | null;
  note?: string;
};

type NasdaqUnderlying = {
  verified: boolean;
  symbol: string;
  companyName?: string | null;
  exchange?: string | null;
  lastPrice?: number | null;
  isPenny?: boolean | null;
};

type LighterMarket = {
  marketId: number;
  symbol: string;
  active: boolean;
  markPrice?: number | null;
  indexPrice?: number | null;
  openInterest?: number | null;
  volume24h?: number | null;
};

type LaunchMode = "basket" | "stock-floor" | "preipo-perp";

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || "";

export default function LaunchPage() {
  const [launchMode, setLaunchMode] = useState<LaunchMode>("basket");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [metadataEditable, setMetadataEditable] = useState(true);
  const [activeCategory, setActiveCategory] = useState<AssetCategory>("Majors");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(["bnb"]);
  const [primary, setPrimary] = useState("bnb");
  const [rewardMode, setRewardMode] = useState<"standard" | "holders" | "buyback" | "split">("standard");
  const [rewardAsset, setRewardAsset] = useState("cake");
  const [devBuy, setDevBuy] = useState(0);
  const [graduation, setGraduation] = useState<"fixed" | "adaptive">("adaptive");
  const [creatorBps, setCreatorBps] = useState(25);
  const [holderBps, setHolderBps] = useState(25);
  const [buybackBps, setBuybackBps] = useState(25);
  const [liquidityBps, setLiquidityBps] = useState(15);
  const [bscCandidates, setBscCandidates] = useState<BscCandidate[]>([]);
  const [chinaStocks, setChinaStocks] = useState<ChinaStockCandidate[]>([]);
  const [nasdaqResults, setNasdaqResults] = useState<NasdaqTokenizedResult[]>([]);
  const [nasdaqUnderlying, setNasdaqUnderlying] = useState<NasdaqUnderlying | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [chinaLoading, setChinaLoading] = useState(false);
  const [nasdaqLoading, setNasdaqLoading] = useState(false);
  const [floorReservePct, setFloorReservePct] = useState(35);
  const [lighterMarkets, setLighterMarkets] = useState<LighterMarket[]>([]);
  const [lighterLoading, setLighterLoading] = useState(false);
  const [perpMarketId, setPerpMarketId] = useState<number | null>(null);
  const [referenceMultiplier, setReferenceMultiplier] = useState(1);
  const [depthTier, setDepthTier] = useState<"low" | "standard">("low");
  const protocolBps = 10;

  useEffect(() => {
    if (launchMode === "stock-floor") {
      const selectedStock = selected
        .map((id) => selectableAssets.find((asset) => asset.id === id))
        .find((asset) =>
          asset && ["xStocks", "China Stocks", "NASDAQ Penny Stocks"].includes(asset.category)
        );

      if (!selectedStock) {
        setSelected([]);
        setPrimary("");
      } else {
        setSelected([selectedStock.id]);
        setPrimary(selectedStock.id);
      }
    }

    if (launchMode === "preipo-perp") {
      setSelected(["usdt"]);
      setPrimary("usdt");
    }

    if (launchMode === "basket" && selected.length === 0) {
      setSelected(["bnb"]);
      setPrimary("bnb");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchMode]);

  useEffect(() => {
    if (launchMode !== "preipo-perp" || lighterMarkets.length > 0) return;
    setLighterLoading(true);
    void fetch("/api/registry/lighter-perps?preipo=true")
      .then((response) => response.json())
      .then((data) => {
        const markets = Array.isArray(data.markets) ? data.markets : [];
        setLighterMarkets(markets);
        const firstActive = markets.find((market: LighterMarket) => market.active);
        if (firstActive) setPerpMarketId(firstActive.marketId);
      })
      .finally(() => setLighterLoading(false));
  }, [launchMode, lighterMarkets.length]);

  useEffect(() => {
    if (activeCategory !== "BSC 400" || bscCandidates.length > 0) return;

    setCatalogLoading(true);
    void fetch("/api/registry/top-bsc")
      .then((response) => response.json())
      .then((data) =>
        setBscCandidates(Array.isArray(data.tokens) ? data.tokens : [])
      )
      .finally(() => setCatalogLoading(false));
  }, [activeCategory, bscCandidates.length]);

  useEffect(() => {
    if (activeCategory !== "China Stocks" || chinaStocks.length > 0) return;

    setChinaLoading(true);
    void fetch("/api/registry/china-stocks")
      .then((response) => response.json())
      .then((data) =>
        setChinaStocks(Array.isArray(data.stocks) ? data.stocks : [])
      )
      .finally(() => setChinaLoading(false));
  }, [activeCategory, chinaStocks.length]);

  useEffect(() => {
    if (activeCategory !== "NASDAQ Penny Stocks") return;

    const ticker = query.trim().toUpperCase();
    if (!ticker) {
      setNasdaqResults([]);
      setNasdaqUnderlying(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setNasdaqLoading(true);
      void fetch("/api/registry/nasdaq-stocks?q=" + encodeURIComponent(ticker))
        .then((response) => response.json())
        .then((data) => {
          setNasdaqResults(Array.isArray(data.results) ? data.results : []);
          setNasdaqUnderlying(data.underlying || null);
        })
        .finally(() => setNasdaqLoading(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [activeCategory, query]);

  const chinaAssets = useMemo<FortuneAsset[]>(
    () =>
      chinaStocks.map((stock) => ({
        id: "china:" + stock.rank,
        symbol: stock.symbol || stock.underlyingTicker,
        name: stock.company,
        category: "China Stocks",
        icon: "CN",
        chain: "BSC",
        verification: stock.pairable ? "Verified" : "Unavailable",
        capabilities: stock.pairable ? ["quote", "graduation"] : [],
        address: stock.wrapperAddress || undefined,
        note: stock.pairable
          ? "Official current wrapped xStock on BNB Chain. Pairing uses the non-rebasing wrapper."
          : stock.status,
      })),
    [chinaStocks]
  );

  const nasdaqAssets = useMemo<FortuneAsset[]>(
    () =>
      nasdaqResults.map((stock, index) => ({
        id:
          "nasdaq:" +
          stock.underlyingTicker +
          ":" +
          stock.provider +
          ":" +
          index,
        symbol: stock.tokenSymbol || stock.underlyingTicker,
        name:
          (stock.underlyingCompany || stock.underlyingTicker) +
          " · " +
          stock.provider,
        category: "NASDAQ Penny Stocks",
        icon: "NQ",
        chain: "BSC",
        verification: stock.pairable ? "Provider Verified" : "Unavailable",
        capabilities: stock.pairable ? ["quote", "graduation"] : [],
        address: stock.pairingAddress || undefined,
        note: stock.note,
      })),
    [nasdaqResults]
  );

  const selectableAssets = useMemo(
    () => [...assets, ...chinaAssets, ...nasdaqAssets],
    [chinaAssets, nasdaqAssets]
  );

  const filtered = useMemo(() => {
    return selectableAssets.filter((asset) => {
      const matchesCategory =
        activeCategory === "Custom" || activeCategory === "BSC 400"
          ? false
          : activeCategory === "BNB Chain"
            ? asset.chain === "BSC"
            : asset.category === activeCategory;
      const needle = query.toLowerCase();
      const matchesQuery = !needle || asset.symbol.toLowerCase().includes(needle) || asset.name.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query, selectableAssets]);

  const selectedAssets = selected.map((id) => selectableAssets.find((a) => a.id === id)).filter(Boolean);
  const equalWeight = Math.floor(100 / selected.length);
  const feeTotal = creatorBps + holderBps + buybackBps + liquidityBps + protocolBps;

  function toggleAsset(id: string) {
    const asset = selectableAssets.find((item) => item.id === id);
    if (!asset || !asset.capabilities.includes("quote")) return;

    if (launchMode === "stock-floor") {
      if (!["xStocks", "China Stocks", "NASDAQ Penny Stocks"].includes(asset.category)) return;
      setSelected([id]);
      setPrimary(id);
      return;
    }

    if (launchMode === "preipo-perp") return;

    setSelected((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        const next = current.filter((item) => item !== id);
        if (primary === id) setPrimary(next[0]);
        return next;
      }
      if (current.length >= 5) return current;
      return [...current, id];
    });
  }

  return (
    <main className="page launchPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">CREATE ON BNB CHAIN</span>
          <h1>A little idea. A whole new market.</h1>
          <p>Configure the token, its Fortune Basket Curve, fee routing, rewards and graduation in one immutable launch manifest.</p>
        </div>
        <div className="stepRail"><span className="active">01 Token</span><span>02 Market</span><span>03 Economics</span><span>04 Manifest</span></div>
      </section>

      <section className="formCard launchEngineCard">
        <div className="formSectionTitle">
          <span>00</span>
          <div>
            <h2>Choose the launch engine</h2>
            <p>Fortune supports normal Basket Curves, reserve-backed stock floors, and experimental perp-referenced pre-IPO markets.</p>
          </div>
        </div>
        <div className="launchEngineGrid">
          <button className={launchMode==="basket" ? "launchEngine selectedEngine" : "launchEngine"} onClick={()=>setLaunchMode("basket")}>
            <strong>Basket Curve</strong>
            <span>1–5 BSC quote assets · one canonical curve</span>
          </button>
          <button className={launchMode==="stock-floor" ? "launchEngine selectedEngine" : "launchEngine"} onClick={()=>setLaunchMode("stock-floor")}>
            <strong>Stock Floor</strong>
            <span>Launch on top of a real BSC stock token with a reserve-backed redemption floor</span>
          </button>
          <button className={launchMode==="preipo-perp" ? "launchEngine selectedEngine" : "launchEngine"} onClick={()=>setLaunchMode("preipo-perp")}>
            <strong>Pre-IPO Perp</strong>
            <span>Experimental Lighter-referenced market settled in a BSC stablecoin</span>
          </button>
        </div>

        {launchMode==="stock-floor" && (
          <div className="engineSettings">
            <div>
              <span className="eyebrow">STOCK FLOOR</span>
              <strong>{selectedAssets[0]?.name || "Choose one verified stock token below"}</strong>
              <small>The floor vault holds a protected share of stock-token reserves and is designed to support pro-rata redemption after activation.</small>
            </div>
            <label>
              Protected floor reserve
              <span className="fieldValue">{floorReservePct}%</span>
              <input type="range" min="15" max="70" value={floorReservePct} onChange={(e)=>setFloorReservePct(Number(e.target.value))} />
            </label>
          </div>
        )}

        {launchMode==="preipo-perp" && (
          <div className="engineSettings">
            <div>
              <span className="eyebrow">EXPERIMENTAL PRE-IPO REFERENCE</span>
              <strong>Lighter perpetual reference</strong>
              <small>The perp is not a BEP-20 reserve asset. Fortune uses an approved settlement token plus a bridged mark/index reference and separate hedging design.</small>
            </div>
            {lighterLoading ? (
              <div className="registryEmpty">Loading Lighter pre-IPO markets…</div>
            ) : lighterMarkets.length ? (
              <div className="fieldGrid">
                <label>Reference market
                  <select value={perpMarketId ?? ""} onChange={(e)=>setPerpMarketId(Number(e.target.value))}>
                    {lighterMarkets.map((market)=><option key={market.marketId} value={market.marketId} disabled={!market.active}>{market.symbol}{market.active ? "" : " · inactive"}</option>)}
                  </select>
                </label>
                <label>Reference multiplier
                  <select value={referenceMultiplier} onChange={(e)=>setReferenceMultiplier(Number(e.target.value))}>
                    <option value={1}>1x</option>
                    <option value={2}>2x experimental</option>
                    <option value={3}>3x experimental</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="registryNotice"><strong>No live pre-IPO market resolved</strong><span>Fortune will not invent an OpenAI/Anthropic market when Lighter's public API does not return one.</span></div>
            )}
            <div className="graduationToggle">
              <button className={depthTier==="low" ? "tabActive" : ""} onClick={()=>setDepthTier("low")}>Experimental low depth</button>
              <button className={depthTier==="standard" ? "tabActive" : ""} onClick={()=>setDepthTier("standard")}>Standard depth</button>
            </div>
          </div>
        )}
      </section>

      <div className="launchLayout">
        <div className="launchForm">
          <section className="formCard">
            <div className="formSectionTitle"><span>01</span><div><h2>Make it yours</h2><p>Every market starts with a story.</p></div></div>
            <div className="fieldGrid">
              <label>Token name<input value={name} onChange={(e)=>setName(e.target.value)} maxLength={32} placeholder="Token name" /></label>
              <label>Ticker<input value={symbol} onChange={(e)=>setSymbol(e.target.value.toUpperCase())} maxLength={10} placeholder="FORTUNE" /></label>
            </div>
            <label>Description<textarea value={description} onChange={(e)=>setDescription(e.target.value)} maxLength={1000} placeholder="What is the idea? Tell your future community." /></label>
            <div className="uploadBox"><span>＋</span><div><strong>Choose token image</strong><small>PNG, JPEG or WebP · square · up to 2 MB</small></div></div>
            <div className="fieldGrid">
              <label>Website<input value={website} onChange={(e)=>setWebsite(e.target.value)} placeholder="https://project.xyz" /></label>
              <label>X profile<input value={xProfile} onChange={(e)=>setXProfile(e.target.value)} placeholder="x.com/handle" /></label>
            </div>
            <label>Telegram<input value={telegram} onChange={(e)=>setTelegram(e.target.value)} placeholder="t.me/community" /></label>

            <div className="metadataPolicy">
              <div>
                <span className="eyebrow">TOKEN METADATA</span>
                <strong>{metadataEditable ? "Editable after launch" : "Immutable from launch"}</strong>
                <small>
                  {metadataEditable
                    ? "Creator can update Fortune display name, ticker, description, image and socials. Every edit is versioned onchain and can later be permanently frozen."
                    : "Fortune display metadata is frozen at launch. The ERC-20 contract name and symbol are always immutable either way."}
                </small>
              </div>
              <div className="graduationToggle">
                <button className={metadataEditable ? "tabActive" : ""} onClick={()=>setMetadataEditable(true)}>Editable</button>
                <button className={!metadataEditable ? "tabActive" : ""} onClick={()=>setMetadataEditable(false)}>Immutable</button>
              </div>
            </div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>02</span><div>
              <h2>{launchMode==="basket" ? "Build your Fortune Basket" : launchMode==="stock-floor" ? "Choose the stock floor asset" : "Choose the BSC settlement asset"}</h2>
              <p>{launchMode==="basket" ? "Choose 1–5 assets. Every purchase moves one shared curve." : launchMode==="stock-floor" ? "Use one real, pairable BSC stock-token representation." : "Perp-referenced pools settle on BSC; the external perp is a price reference, not the reserve token."}</p>
            </div></div>
            {launchMode==="basket" && <div className="modeRow"><button className={selected.length===1?"selectedMode":""}>Single</button><button className={selected.length===2?"selectedMode":""}>Dual</button><button className={selected.length>=3?"selectedMode":""}>Multi 3–5</button><span>{selected.length}/5 selected</span></div>}

            <div className="categoryTabs">
              {assetCategories
                .filter((category) =>
                  launchMode === "stock-floor"
                    ? ["xStocks", "China Stocks", "NASDAQ Penny Stocks"].includes(category)
                    : launchMode === "preipo-perp"
                      ? ["Stablecoins"].includes(category)
                      : true
                )
                .map((category) => (
                <button key={category} onClick={()=>setActiveCategory(category)} className={activeCategory===category?"tabActive":""}>{category}</button>
              ))}
            </div>
            <input
              className="searchInput"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
              placeholder={
                activeCategory === "NASDAQ Penny Stocks"
                  ? "Enter any NASDAQ ticker, e.g. FAMI"
                  : "Search approved BSC assets by symbol or name"
              }
            />

            {activeCategory==="NASDAQ Penny Stocks" && (
              <div className="registryNotice">
                <strong>NASDAQ → BNB stock-token lookup</strong>
                <span>
                  Enter a real NASDAQ ticker. Fortune verifies the listing, checks whether it is below $5 when price data is available, then searches recognized BNB stock-token providers. A ticker is never synthesized into a fake stock token.
                </span>
              </div>
            )}

            {activeCategory==="NASDAQ Penny Stocks" && nasdaqUnderlying && (
              <div className="selectedBasket">
                <div className="selectedBasketHeader">
                  <strong>{nasdaqUnderlying.companyName || nasdaqUnderlying.symbol}</strong>
                  <span>{nasdaqUnderlying.verified ? "NASDAQ verified" : "Listing not verified"}</span>
                </div>
                <div className="basketAllocation">
                  <span>{nasdaqUnderlying.symbol}</span>
                  <strong>
                    {nasdaqUnderlying.lastPrice == null
                      ? "Price unavailable"
                      : "$" + nasdaqUnderlying.lastPrice.toFixed(4)}
                  </strong>
                  <span>
                    {nasdaqUnderlying.isPenny === true
                      ? "Penny stock"
                      : nasdaqUnderlying.isPenny === false
                        ? "Above $5"
                        : "Price pending"}
                  </span>
                </div>
              </div>
            )}

            {activeCategory==="China Stocks" && (
              <div className="registryNotice">
                <strong>China blue chips on BNB</strong>
                <span>
                  Fortune only enables an equity when the official xStocks BNB deployment has a current non-rebasing wrapper. Native rebasing xStocks stay disabled for curve pairing.
                </span>
              </div>
            )}

            <div className="assetPickerGrid">
              {activeCategory==="China Stocks" && chinaLoading && (
                <div className="customAssetBox">
                  <strong>Checking official BNB China-stock deployments…</strong>
                </div>
              )}
              {filtered.map((asset) => {
                const enabled = asset.capabilities.includes("quote");
                const isSelected = selected.includes(asset.id);
                return (
                  <button key={asset.id} className={"assetOption " + (isSelected?"assetSelected ":"") + (!enabled?"assetDisabled":"")} onClick={()=>toggleAsset(asset.id)} disabled={!enabled}>
                    <span className="assetIconLarge">{asset.icon}</span>
                    <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
                    <em>{asset.verification}</em>
                  </button>
                );
              })}
              {activeCategory==="NASDAQ Penny Stocks" && nasdaqLoading && (
                <div className="customAssetBox">
                  <strong>Checking NASDAQ and BNB tokenized-stock providers…</strong>
                </div>
              )}

              {activeCategory==="NASDAQ Penny Stocks" &&
                !nasdaqLoading &&
                query.trim() &&
                nasdaqResults.length === 0 && (
                  <div className="customAssetBox">
                    <strong>No verified BNB representation found yet.</strong>
                    <p>
                      Fortune can catalog the real NASDAQ stock, but direct pairing only turns on when a recognized provider has an actual BSC token for it. We do not create synthetic ticker copies.
                    </p>
                  </div>
                )}

              {activeCategory==="BSC 400" && (
                <>
                  {catalogLoading && (
                    <div className="customAssetBox">
                      <strong>Loading ranked BNB ecosystem assets…</strong>
                    </div>
                  )}
                  {!catalogLoading && bscCandidates.slice(0, 80).map((asset) => (
                    <button
                      key={asset.address}
                      className="assetOption assetDisabled"
                      disabled
                      title="Candidate asset — Fortune registry approval required before pairing"
                    >
                      <span className="assetIconLarge">{asset.symbol.slice(0, 2)}</span>
                      <span>
                        <strong>#{asset.rank} {asset.symbol}</strong>
                        <small>{asset.name}</small>
                      </span>
                      <em>Candidate</em>
                    </button>
                  ))}
                </>
              )}

              {activeCategory==="Custom" && (
                <div className="customAssetBox">
                  <strong>Custom BEP-20</strong>
                  <p>Custom assets require contract compatibility checks, liquidity checks and explicit warnings before entering a Fortune Basket.</p>
                  <input placeholder="0x token contract" />
                </div>
              )}
            </div>

            <div className="selectedBasket">
              <div className="selectedBasketHeader"><strong>Graduation basket</strong><span>{graduation==="adaptive"?"Demand-weighted":"Fixed weights"}</span></div>
              {selectedAssets.map((asset, index) => asset && (
                <div className="basketAllocation" key={asset.id}>
                  <button className={primary===asset.id?"primaryAsset":""} onClick={()=>setPrimary(asset.id)}>{primary===asset.id?"PRIMARY":"MAKE PRIMARY"}</button>
                  <strong>{asset.symbol}</strong>
                  <span>{equalWeight + (index===selected.length-1 ? 100-(equalWeight*selected.length) : 0)}%</span>
                </div>
              ))}
              <div className="graduationToggle"><button className={graduation==="adaptive"?"tabActive":""} onClick={()=>setGraduation("adaptive")}>Demand weighted</button><button className={graduation==="fixed"?"tabActive":""} onClick={()=>setGraduation("fixed")}>Fixed basket</button></div>
            </div>
          </section>

          <section className="formCard launchShieldCard">
            <div className="formSectionTitle"><span>🛡</span><div><h2>Fortune Launch Shield</h2><p>Protocol-level opening protection is enabled on every Fortune curve.</p></div></div>
            <div className="shieldGrid">
              <div><span>Opening buy tax</span><strong>99%</strong><small>decays rapidly</small></div>
              <div><span>Tax ends</span><strong>5 sec</strong><small>cannot be extended</small></div>
              <div><span>Early wallet cap</span><strong>2%</strong><small>first 15 sec</small></div>
              <div><span>Shield proceeds</span><strong>LP vault</strong><small>never creator wallet</small></div>
            </div>
            <div className="shieldDecay">
              <span>0s · 99%</span>
              <span>1s · 24.75%</span>
              <span>2s · 3.09%</span>
              <span>3s · 0.38%</span>
              <span>4s · 0.04%</span>
              <span>5s · 0%</span>
            </div>
            <p className="fieldHint">
              Buys only. Sells are not subject to the Launch Shield. There are no creator or private-wallet exemptions. Fortune's default UI should wait for the countdown to finish unless a user explicitly chooses to buy during the protected window.
            </p>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>03</span><div><h2>Route the economics</h2><p>Decide what trading fees do after every trade.</p></div></div>
            <div className="rewardModes">
              {[
                ["standard","Standard"],
                ["holders","Holder rewards"],
                ["buyback","Buyback & burn"],
                ["split","Custom split"]
              ].map(([id,label])=><button key={id} onClick={()=>setRewardMode(id as typeof rewardMode)} className={rewardMode===id?"selectedMode":""}>{label}</button>)}
            </div>

            {(rewardMode==="holders" || rewardMode==="split") && (
              <label>Reward holders in
                <select value={rewardAsset} onChange={(e)=>setRewardAsset(e.target.value)}>
                  {assets.filter(a=>a.capabilities.includes("reward")).map(a=><option value={a.id} key={a.id}>{a.symbol} — {a.name}</option>)}
                </select>
              </label>
            )}

            <div className="feeMatrix">
              <div className="feeMatrixHeader"><strong>Fortune Fee Matrix</strong><span>{(feeTotal/100).toFixed(2)}% total</span></div>
              <FeeInput label="Creator" value={creatorBps} setValue={setCreatorBps} />
              <FeeInput label="Holders" value={holderBps} setValue={setHolderBps} />
              <FeeInput label="Buyback & burn" value={buybackBps} setValue={setBuybackBps} />
              <FeeInput label="LP reinforcement" value={liquidityBps} setValue={setLiquidityBps} />
              <div className="feeRow"><span>Fortune protocol</span><strong>{(protocolBps/100).toFixed(2)}%</strong></div>
            </div>

            <label>Developer first buy <span className="fieldValue">{devBuy}% of supply</span>
              <input type="range" min="0" max="20" value={devBuy} onChange={(e)=>setDevBuy(Number(e.target.value))} />
            </label>
            <p className="fieldHint">Capped at 20% in the Fortune default template. Fair Launch mode forces this to 0%.</p>
          </section>

          <section className="formCard manifestCard">
            <div className="formSectionTitle"><span>04</span><div><h2>Immutable Launch Manifest</h2><p>This configuration is hashed at launch so the deal cannot quietly change.</p></div></div>
            <ManifestRows
              name={name || "Untitled token"}
              symbol={symbol || "TOKEN"}
              assets={selectedAssets.map(a=>a?.symbol || "")}
              primary={selectableAssets.find(a=>a.id===primary)?.symbol || "BNB"}
              reward={rewardMode==="standard"?"None":assets.find(a=>a.id===rewardAsset)?.symbol || "None"}
              devBuy={devBuy}
              fee={(feeTotal/100).toFixed(2)}
              graduation={graduation}
              launchMode={launchMode}
              stockFloorAsset={launchMode==="stock-floor" ? selectedAssets[0]?.symbol || "None" : undefined}
              floorReservePct={floorReservePct}
              perpReference={launchMode==="preipo-perp" ? lighterMarkets.find((market)=>market.marketId===perpMarketId)?.symbol || "Unresolved" : undefined}
              referenceMultiplier={referenceMultiplier}
              depthTier={depthTier}
              metadataEditable={metadataEditable}
            />
            <button className="launchButton" disabled={!FACTORY_ADDRESS}>
              {FACTORY_ADDRESS ? "Review & deploy to configured BSC testnet →" : "BSC testnet factory not configured"}
            </button>
            <small className="launchWarning">
              {FACTORY_ADDRESS
                ? "A testnet factory is configured. This UI still requires transaction encoding before deployments are submitted."
                : "Deploy the isolated testnet stack first and set NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS. Production remains disabled until audits and adapter review are complete."}
            </small>
          </section>
        </div>

        <aside className="launchPreview">
          <span className="eyebrow">LIVE PREVIEW</span>
          <div className="previewArt"><span>✦</span><small>BNB CHAIN</small></div>
          <h3>{name || "Your token name"}</h3>
          <strong>{"$" + (symbol || "TICKER")}</strong>
          <p>{description || "A new idea. A new community. It all starts here."}</p>
          <div className="previewFacts">
            <div><span>Markets</span><strong>{selected.length}</strong></div>
            <div><span>Primary</span><strong>{selectableAssets.find(a=>a.id===primary)?.symbol}</strong></div>
            <div><span>Graduation</span><strong>{graduation==="adaptive"?"Adaptive":"Fixed"}</strong></div>
            <div><span>Dev buy</span><strong>{devBuy}%</strong></div>
            <div><span>Contract</span><strong>0x…fe</strong></div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function FeeInput({ label, value, setValue }: { label:string; value:number; setValue:(n:number)=>void }) {
  return <div className="feeRow"><span>{label}</span><label><input type="number" min="0" max="500" value={value} onChange={(e)=>setValue(Number(e.target.value))} /><em>bps</em></label></div>;
}

function ManifestRows({
  name, symbol, assets, primary, reward, devBuy, fee, graduation, launchMode,
  stockFloorAsset, floorReservePct, perpReference, referenceMultiplier, depthTier, metadataEditable
}: {
  name:string; symbol:string; assets:string[]; primary:string; reward:string; devBuy:number; fee:string; graduation:string;
  launchMode: LaunchMode; stockFloorAsset?: string; floorReservePct: number; perpReference?: string; referenceMultiplier: number; depthTier: "low" | "standard"; metadataEditable: boolean;
}) {
  const rows = [
    ["Launch engine", launchMode==="basket" ? "Basket Curve" : launchMode==="stock-floor" ? "Stock Floor" : "Pre-IPO Perp"],
    ["Token", name + " ($" + symbol + ")"],
    ["Fortune vanity address", "Every launch token ends in 0xfe"],
    ["Launch Shield", "99% → 0% over 5 sec · buy-only"],
    ["Final curve buy", "Partial fill · excess quote refunded atomically"],
    ["Market phases", "Curve → ready → pools · rescue after 7d if stuck"],
    ["Early wallet cap", "2% cumulative buys for first 15 sec"],
    ["Shield proceeds", "Liquidity reinforcement vault · no exemptions"],
    ["Accepted quote assets", assets.join(" · ")],
    ["Primary market", primary],
    ["Graduation model", graduation==="adaptive"?"Demand weighted":"Fixed basket"],
    ["Holder reward asset", reward],
    ["Developer buy", devBuy + "%"],
    ["Total configured fee", fee + "%"],
    ["Post-launch mint", "Disabled"],
    ["Arbitrary blacklist", "Disabled"],
    ["Silent fee changes", "Disabled"],
    ["Fortune display metadata", metadataEditable ? "Editable · revision history · freezable" : "Immutable"],
    ...(launchMode==="stock-floor"
      ? [["Stock floor asset", stockFloorAsset || "None"], ["Protected reserve", floorReservePct + "%"], ["Floor redemption", "Purpose-built vault"]]
      : []),
    ...(launchMode==="preipo-perp"
      ? [["Perp reference", perpReference || "Unresolved"], ["Reference multiplier", referenceMultiplier + "x"], ["Liquidity depth", depthTier==="low" ? "Experimental low" : "Standard"], ["Settlement", primary]]
      : []),
  ];
  return <div className="manifestTable">{rows.map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>;
}
