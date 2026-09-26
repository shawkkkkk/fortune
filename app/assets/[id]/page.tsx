import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import UsSessionBadge from "@/components/UsSessionBadge";
import { formatPrice, formatUsd } from "@/lib/market-format";
import { CONTROL_TEXT, REASON_TEXT, tracksUsSession } from "@/lib/pair-reasons";
import { readUniverseAsset, safeImage, snapshotAsset, type UniverseAsset } from "@/lib/pair-universe";

// Rendered on first request, then served from cache and refreshed every five minutes.
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

const BSC_EXPLORER = "https://bscscan.com";

type Base = NonNullable<ReturnType<typeof snapshotAsset>>;

function kindLabel(asset: Pick<Base, "group" | "kind">) {
  if (asset.group === "stocks") return asset.kind === "etf" ? "TOKENIZED ETF" : "TOKENIZED STOCK";
  if (asset.group === "rwa") return "GOLD & COMMODITIES";
  if (asset.group === "preipo") return "PRE-IPO TOKEN";
  return "CRYPTO";
}

function sourceLabel(source: UniverseAsset["market"]["source"]) {
  if (source === "coingecko") return "CoinGecko";
  if (source === "dexscreener") return "DexScreener pools";
  if (source === "lighter") return "Lighter";
  if (source === "registry") return "Fortune oracle";
  return null;
}

function change(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return { text: (value >= 0 ? "+" : "") + value.toFixed(2) + "%", up: value >= 0 };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const asset = snapshotAsset(id);
  // Throwing here (not only in the page) gives crawlers a real 404 status.
  if (!asset) notFound();
  const title = `${asset.name} (${asset.symbol}) on BNB Chain`;
  const description = asset.group === "stocks"
    ? `${asset.symbol} is ${asset.provider ?? "an issuer"}'s tokenized ${asset.underlying ?? asset.name} on BNB Smart Chain. Live price, issuer controls, US market hours and whether Fortune launches can pair with it.`
    : `${asset.name} (${asset.symbol}) on BNB Smart Chain: live price, contract controls and whether Fortune launches can pair with it.`;
  return {
    title,
    description,
    alternates: { canonical: `/assets/${asset.id}` },
    openGraph: { type: "website", siteName: "Fortune", title, description, url: `/assets/${asset.id}` },
    twitter: { card: "summary", title, description },
  };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = snapshotAsset(id);
  if (!base) notFound();

  const live = await readUniverseAsset(id).catch(() => null);
  const asset = live?.asset ?? null;
  const image = safeImage(base.image);
  const market = asset?.market ?? null;
  const delta = change(market?.change24h ?? null);
  const stockLike = tracksUsSession(base);
  // Eligibility is only stated when the onchain registry answered.
  const checked = Boolean(asset && live?.registryChecked);
  const launchable = checked && asset?.fortune.status === "launchable";
  const controls = asset?.controls ?? base.controls;
  const siblings = live?.siblings ?? [];
  const compared = asset && siblings.length ? [asset, ...siblings] : [];

  return (
    <main className="page assetPage">
      <nav className="assetCrumbs" aria-label="Breadcrumb">
        <Link href="/assets">Stocks &amp; pairs</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" translate="no">{base.symbol}</span>
      </nav>

      <section className="pageHeading assetHeading">
        <div className="assetTitle">
          {image ? (
            <img className="assetLogo" src={image} alt="" width="64" height="64" />
          ) : (
            <span className="tokenAvatar assetMonogram" aria-hidden="true">{base.symbol.slice(0, 2)}</span>
          )}
          <div>
            <span className="eyebrow">{kindLabel(base)}</span>
            <h1 translate="no">{base.name}</h1>
            <p>
              <span translate="no">{base.symbol}</span>
              {base.provider ? <> · <span translate="no">{base.provider}</span></> : null}
              {base.underlying && base.underlying !== base.name ? <> · Tracks <span translate="no">{base.underlying}</span></> : null}
            </p>
          </div>
        </div>
        <div className="tokenHeadingActions">
          {launchable && base.address ? <Link className="primaryCta" href={`/launch?pair=${base.address}`}>Launch paired with {base.symbol} →</Link> : null}
          <a className="secondaryCta" href={`${BSC_EXPLORER}/token/${base.address}`} target="_blank" rel="noreferrer">BscScan ↗</a>
        </div>
      </section>

      <div className="metricsGrid four assetMarket">
        <div className="metric">
          <span>Price</span>
          <strong translate="no">{formatPrice(market?.priceUsd ?? null)}</strong>
          {delta ? <small className={delta.up ? "chartChangeUp" : "chartChangeDown"} translate="no">{delta.text} · 24h</small> : <small>24h change unavailable</small>}
        </div>
        <div className="metric"><span>Market cap</span><strong translate="no">{formatUsd(market?.marketCap ?? null)}</strong><small>Onchain supply × price</small></div>
        <div className="metric"><span>24h volume</span><strong translate="no">{formatUsd(market?.volume24h ?? null)}</strong><small>All tracked venues</small></div>
        <div className="metric">
          <span>Data source</span>
          <strong translate="no">{sourceLabel(market?.source ?? null) ?? "—"}</strong>
          <small>{live ? "Refreshed every few minutes" : "Live data unavailable right now"}</small>
        </div>
      </div>

      {stockLike ? (
        <div className="assetSession">
          <UsSessionBadge />
          <p className="fieldHint">Tokenized stocks trade onchain 24/7. Outside US market hours the price can drift from the listed share and gap at the next open.</p>
        </div>
      ) : null}

      <section className={"panel assetEligibility assetEligibility-" + (checked && asset ? asset.fortune.status : "unknown")}>
        <span className="eyebrow">FORTUNE PAIRING</span>
        {!asset || !checked ? (
          <>
            <h2>Eligibility could not be checked right now</h2>
            <p className="fieldHint">Fortune reads its onchain Asset Registry for every check. Try again in a minute.</p>
          </>
        ) : launchable ? (
          <>
            <h2>Launches can pair with {base.symbol}</h2>
            <p className="fieldHint">Eligibility is checked again onchain, with a fresh oracle price, before your wallet signs.</p>
          </>
        ) : (
          <>
            <h2>{asset.fortune.status === "reference" ? "Price reference only" : "Not available for Fortune launches yet"}</h2>
            <ul className="pickReasons">
              {asset.fortune.reasons.map((reason) => <li key={reason}>{REASON_TEXT[reason] ?? reason}</li>)}
            </ul>
            <p className="fieldHint">Discovery is broad; reserve custody is strict. Only registry-approved, oracle-healthy assets can hold launch reserves.</p>
          </>
        )}
        {asset?.notice ? (
          <p className="assetNotice">
            {asset.notice}{" "}
            {asset.noticeSource ? <a href={asset.noticeSource} target="_blank" rel="noreferrer">Source ↗</a> : null}
          </p>
        ) : null}
        {base.leveraged ? <p className="reviewWarning">Leveraged or inverse fund: its value resets daily and can fall much faster than the index it tracks.</p> : null}
        {!launchable ? <div className="heroActions"><Link className="secondaryCta" href="/launch">Launch with an approved pair →</Link></div> : null}
      </section>

      <section className="panel assetContract">
        <span className="eyebrow">CONTRACT</span>
        <h2>On BNB Smart Chain</h2>
        <div className="statRows">
          <div><span>Address</span><strong><a translate="no" href={`${BSC_EXPLORER}/token/${base.address}`} target="_blank" rel="noreferrer">{base.address}</a></strong></div>
          <div><span>Decimals</span><strong translate="no">{base.decimals}</strong></div>
          {base.provider ? <div><span>Issuer</span><strong translate="no">{base.provider}</strong></div> : null}
        </div>
        <ul className="assetControls">
          {(["upgradeable", "pausable", "rebasing"] as const).map((key) => (
            <li key={key} className={controls[key] ? "controlOn" : "controlOff"}>
              <b aria-hidden="true">{controls[key] ? "!" : "✓"}</b>
              <span>{controls[key] ? CONTROL_TEXT[key].on : CONTROL_TEXT[key].off}</span>
            </li>
          ))}
        </ul>
        {live ? (
          <p className="fieldHint">
            Address and controls verified onchain at block <span translate="no">{live.snapshot.verifiedAtBlock.toLocaleString("en-US")}</span> (<span translate="no">{live.snapshot.generatedAt.slice(0, 10)}</span>).
          </p>
        ) : (
          <p className="fieldHint">Address and controls come from Fortune&apos;s verified pair-universe snapshot.</p>
        )}
      </section>

      {compared.length ? (
        <section className="panel assetSiblings">
          <span className="eyebrow">SAME STOCK, OTHER ISSUERS</span>
          <h2><span translate="no">{base.underlying}</span> on BNB Chain</h2>
          <p className="fieldHint">Each issuer&apos;s token is a separate contract with its own controls, liquidity and eligibility.</p>
          <div className="tableWrap">
            <table className="tradesTable assetCompare">
              <thead>
                <tr><th>Token</th><th>Issuer</th><th>Price</th><th>Market cap</th><th>24h volume</th><th>Controls</th></tr>
              </thead>
              <tbody>
                {compared.map((item) => (
                  <tr key={item.id} className={item.id === base.id ? "assetCompareCurrent" : undefined}>
                    <td translate="no">{item.id === base.id ? <strong>{item.symbol}</strong> : <Link href={`/assets/${item.id}`}>{item.symbol}</Link>}</td>
                    <td translate="no">{item.provider ?? "—"}</td>
                    <td translate="no">{formatPrice(item.market.priceUsd)}</td>
                    <td translate="no">{formatUsd(item.market.marketCap)}</td>
                    <td translate="no">{formatUsd(item.market.volume24h)}</td>
                    <td className="assetCompareControls">
                      {!item.controls ? "—" : item.controls.upgradeable || item.controls.pausable || item.controls.rebasing ? (
                        <>
                          {item.controls.upgradeable ? <span>Upgradeable</span> : null}
                          {item.controls.pausable ? <span>Pausable</span> : null}
                          {item.controls.rebasing ? <span>Rebasing</span> : null}
                        </>
                      ) : <span>None found</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="dataDisclaimer">
        Fortune lists assets that exist on BNB Chain so launches can be compared honestly. A listing is not an endorsement, and tokenized stocks are issuer claims with their own terms and eligibility rules.
      </p>
    </main>
  );
}
