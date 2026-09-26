import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { isAddress, type Address } from "viem";
import { notFound } from "next/navigation";
import { readFortuneLaunchByToken as readLaunch } from "@/lib/onchain-launches";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { shortAddress } from "@/lib/market-format";
import { readCreatorRecord } from "@/lib/market-insights";
import ShareBar from "@/components/ShareBar";
import TokenMarketPanel from "@/components/TokenMarketPanel";
import TokenProjectProfile from "@/components/TokenProjectProfile";
import WatchButton from "@/components/WatchButton";

export const dynamic = "force-dynamic";

// Metadata and the page read the same launch once per request.
const readFortuneLaunchByToken = cache(readLaunch);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isAddress(id)) return {};
  try {
    const { launch } = await readFortuneLaunchByToken(id);
    if (!launch) return { title: "Token lookup" };
    const title = `${launch.name} ($${launch.symbol})`;
    const description = `${launch.name} is a Fortune launch on ${FORTUNE_NETWORK.chainName}. Live price, chart, pair assets and where the supply sits.`;
    return {
      title,
      description,
      alternates: { canonical: `/token/${launch.token}` },
      openGraph: { type: "website", siteName: "Fortune", title, description, url: `/token/${launch.token}` },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return {};
  }
}

/** The creator's track record on Fortune, streamed in after the page shell. */
async function CreatorStrip({ creator }: { creator: Address }) {
  const record = await readCreatorRecord(creator, 0, 0).catch(() => null);
  if (!record?.configured || !record.launches) return null;
  return (
    <aside className="creatorStrip" aria-label="Creator record">
      <span><span>Creator</span> <strong translate="no">{shortAddress(creator)}</strong></span>
      <span><span>Launches</span> <strong translate="no">{record.launches}</strong></span>
      <span><span>Graduated</span> <strong translate="no">{record.phases.graduated}</strong></span>
      {record.launches === 1 ? <span className="creatorFirst">First Fortune launch</span> : null}
      <Link href={`/profile/${creator}`}>Creator history →</Link>
    </aside>
  );
}

export default async function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAddress(id)) notFound();
  let launch: Awaited<ReturnType<typeof readFortuneLaunchByToken>>["launch"] | undefined;
  let unavailable = false;
  try {
    const result = await readFortuneLaunchByToken(id);
    unavailable = !result.configured;
    launch = result.launch;
  } catch { unavailable = true; }

  return <main className="page tokenPage"><section className="pageHeading"><div><span className="eyebrow">ONCHAIN TOKEN · CHAIN {FORTUNE_NETWORK.chainId}</span><h1 translate={launch ? "no" : undefined}>{launch ? `${launch.name} (${launch.symbol})` : "Token lookup"}</h1><p>{launch ? `Fixed supply ${launch.totalSupply} · ${launch.status} · ${launch.mode === "tax" ? "Legacy testnet research" : "Standard"}. Values are direct contract reads.` : "Fortune checks the complete configured factory catalog before showing a token as an official market."}</p></div><div className="tokenHeadingActions">{launch ? <WatchButton token={launch.token} symbol={launch.symbol} /> : null}<a href={`${FORTUNE_NETWORK.explorerUrl}/token/${id}`} target="_blank" rel="noreferrer" className="secondaryCta">BscScan ↗</a></div></section>
  {launch ? <ShareBar path={`/token/${launch.token}`} text={`${launch.name} ($${launch.symbol}) on Fortune`} label="Share this launch" /> : null}
  {launch ? <Suspense fallback={<div className="creatorStrip creatorStripLoading" aria-hidden="true" />}><CreatorStrip creator={launch.creator} /></Suspense> : null}
  {unavailable ? <div className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>Could not verify this token against Fortune factories.</span></div> : null}
  {!unavailable && !launch ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout-400.webp" alt="Fortune lucky cat" /><strong>No matching Fortune launch.</strong><p>This address was not recorded by the configured Fortune factories at the queried block.</p></section> : null}
  {launch ? <><TokenMarketPanel token={launch.token} /><div className="metricsGrid four"><div className="metric"><span>Curve price</span><strong>${launch.currentPriceUsd}</strong></div><div className="metric"><span>Accounted reserve</span><strong>${launch.reserveUsd}</strong></div><div className="metric"><span>Graduation target</span><strong>${launch.graduationUsd}</strong></div><div className="metric"><span>Phase</span><strong>{launch.status}</strong></div></div><section className="panel"><span className="eyebrow">ONCHAIN IDENTIFIERS</span><div className="statRows"><div><span>Token</span><strong>{launch.token}</strong></div><div><span>Curve</span><strong>{launch.curve}</strong></div><div><span>Creator</span><strong><Link className="profileLink" href={`/profile/${launch.creator}`}>{launch.creator}</Link></strong></div></div><div className="heroActions"><Link className="primaryCta" href={`/market/${launch.curve}${launch.mode === "tax" ? "?mode=tax" : ""}`}>Trade on market →</Link></div></section></> : null}
  {launch?.mode === "standard" ? <TokenProjectProfile token={launch.token} /> : null}
  </main>;
}
