import Link from "next/link";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { readRecentFortuneLaunches } from "@/lib/onchain-launches";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export const dynamic = "force-dynamic";

export default async function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAddress(id)) notFound();
  let launch: Awaited<ReturnType<typeof readRecentFortuneLaunches>>["launches"][number] | undefined;
  let unavailable = false;
  try {
    const result = await readRecentFortuneLaunches(25);
    unavailable = !result.configured;
    launch = result.launches.find((item) => item.token.toLowerCase() === id.toLowerCase());
  } catch { unavailable = true; }

  return <main className="page narrowPage"><section className="pageHeading"><div><span className="eyebrow">ONCHAIN TOKEN · CHAIN {FORTUNE_NETWORK.chainId}</span><h1>{launch ? `${launch.name} (${launch.symbol})` : "Token lookup"}</h1><p>{launch ? `Fixed supply ${launch.totalSupply} · ${launch.status} · ${launch.mode === "tax" ? "Legacy testnet research" : "Standard"}. Values are direct contract reads.` : "Fortune checks recent factory launches before showing a token as an official market."}</p></div><a href={`${FORTUNE_NETWORK.explorerUrl}/token/${id}`} target="_blank" rel="noreferrer" className="secondaryCta">BscScan ↗</a></section>
  {unavailable ? <div className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>Could not verify this token against Fortune factories.</span></div> : null}
  {!unavailable && !launch ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" /><strong>No match in the latest 25 launches.</strong><p>Older factory entries may exist; this page does not label arbitrary ERC-20 contracts as Fortune tokens.</p></section> : null}
  {launch ? <><div className="metricsGrid four"><div className="metric"><span>Curve price</span><strong>${launch.currentPriceUsd}</strong></div><div className="metric"><span>Accounted reserve</span><strong>${launch.reserveUsd}</strong></div><div className="metric"><span>Graduation target</span><strong>${launch.graduationUsd}</strong></div><div className="metric"><span>Phase</span><strong>{launch.status}</strong></div></div><section className="panel"><span className="eyebrow">ONCHAIN IDENTIFIERS</span><div className="statRows"><div><span>Token</span><strong>{launch.token}</strong></div><div><span>Curve</span><strong>{launch.curve}</strong></div><div><span>Creator</span><strong><Link className="profileLink" href={`/profile/${launch.creator}`}>{launch.creator}</Link></strong></div></div><div className="heroActions"><Link className="primaryCta" href={`/market/${launch.curve}${launch.mode === "tax" ? "?mode=tax" : ""}`}>Trade on market →</Link></div></section></> : null}
  </main>;
}
