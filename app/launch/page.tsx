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

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || "";

export default function LaunchPage() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
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
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [chinaLoading, setChinaLoading] = useState(false);
  const protocolBps = 10;

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

  const selectableAssets = useMemo(
    () => [...assets, ...chinaAssets],
    [chinaAssets]
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
            <div className="fieldGrid"><label>X profile<input placeholder="x.com/handle" /></label><label>Telegram<input placeholder="t.me/community" /></label></div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>02</span><div><h2>Build your Fortune Basket</h2><p>Choose 1–5 assets. Every purchase moves one shared curve.</p></div></div>
            <div className="modeRow"><button className={selected.length===1?"selectedMode":""}>Single</button><button className={selected.length===2?"selectedMode":""}>Dual</button><button className={selected.length>=3?"selectedMode":""}>Multi 3–5</button><span>{selected.length}/5 selected</span></div>

            <div className="categoryTabs">
              {assetCategories.map((category) => (
                <button key={category} onClick={()=>setActiveCategory(category)} className={activeCategory===category?"tabActive":""}>{category}</button>
              ))}
            </div>
            <input className="searchInput" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search approved BSC assets by symbol or name" />

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
          </div>
        </aside>
      </div>
    </main>
  );
}

function FeeInput({ label, value, setValue }: { label:string; value:number; setValue:(n:number)=>void }) {
  return <div className="feeRow"><span>{label}</span><label><input type="number" min="0" max="500" value={value} onChange={(e)=>setValue(Number(e.target.value))} /><em>bps</em></label></div>;
}

function ManifestRows({ name, symbol, assets, primary, reward, devBuy, fee, graduation }: { name:string; symbol:string; assets:string[]; primary:string; reward:string; devBuy:number; fee:string; graduation:string }) {
  const rows = [
    ["Token", name + " ($" + symbol + ")"],
    ["Accepted quote assets", assets.join(" · ")],
    ["Primary market", primary],
    ["Graduation model", graduation==="adaptive"?"Demand weighted":"Fixed basket"],
    ["Holder reward asset", reward],
    ["Developer buy", devBuy + "%"],
    ["Total configured fee", fee + "%"],
    ["Post-launch mint", "Disabled"],
    ["Arbitrary blacklist", "Disabled"],
    ["Silent fee changes", "Disabled"],
  ];
  return <div className="manifestTable">{rows.map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>;
}
