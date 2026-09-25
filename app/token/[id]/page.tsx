import Link from "next/link";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { readFortuneLaunchByToken } from "@/lib/onchain-launches";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import TokenMarketPanel from "@/components/TokenMarketPanel";

export const dynamic = "force-dynamic";

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

  return <main className="page tokenPage"><section className="pageHeading"><div><span className="eyebrow">ONCHAIN TOKEN · CHAIN {FORTUNE_NETWORK.chainId}</span><h1>{launch ? `${launch.name} (${launch.symbol})` : "Token lookup"}</h1><p>{launch ? `Fixed supply ${launch.totalSupply} · ${launch.status} · ${launch.mode === "tax" ? "Legacy testnet research" : "Standard"}. Values are direct contract reads.` : "Fortune checks the complete configured factory catalog before showing a token as an official market."}</p></div><a href={`${FORTUNE_NETWORK.explorerUrl}/token/${id}`} target="_blank" rel="noreferrer" className="secondaryCta">BscScan ↗</a></section>
  {unavailable ? <div className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>Could not verify this token against Fortune factories.</span></div> : null}
  {!unavailable && !launch ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" /><strong>No matching Fortune launch.</strong><p>This address was not recorded by the configured Fortune factories at the queried block.</p></section> : null}
  {launch ? <><TokenMarketPanel token={launch.token} /><div className="metricsGrid four"><div className="metric"><span>Curve price</span><strong>${launch.currentPriceUsd}</strong></div><div className="metric"><span>Accounted reserve</span><strong>${launch.reserveUsd}</strong></div><div className="metric"><span>Graduation target</span><strong>${launch.graduationUsd}</strong></div><div className="metric"><span>Phase</span><strong>{launch.status}</strong></div></div><section className="panel"><span className="eyebrow">ONCHAIN IDENTIFIERS</span><div className="statRows"><div><span>Token</span><strong>{launch.token}</strong></div><div><span>Curve</span><strong>{launch.curve}</strong></div><div><span>Creator</span><strong><Link className="profileLink" href={`/profile/${launch.creator}`}>{launch.creator}</Link></strong></div></div><div className="heroActions"><Link className="primaryCta" href={`/market/${launch.curve}${launch.mode === "tax" ? "?mode=tax" : ""}`}>Trade on market →</Link></div></section></> : null}
  </main>;
}
