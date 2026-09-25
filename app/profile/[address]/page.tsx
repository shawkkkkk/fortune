import Link from "next/link";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { readRecentFortuneLaunches } from "@/lib/onchain-launches";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  let launches: Awaited<ReturnType<typeof readRecentFortuneLaunches>>["launches"] = [];
  let unavailable = false;
  try {
    const result = await readRecentFortuneLaunches(25);
    unavailable = !result.configured;
    launches = result.launches.filter((launch) => launch.creator.toLowerCase() === address.toLowerCase());
  } catch { unavailable = true; }

  return <main className="page narrowPage"><section className="pageHeading"><div><span className="eyebrow">CREATOR PROFILE · CHAIN {FORTUNE_NETWORK.chainId}</span><h1>{address.slice(0,6)}…{address.slice(-4)}</h1><p>Launches associated with this address among the most recent 25 Fortune markets. This address is public onchain data, not a verified identity.</p></div><a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer">View on BscScan ↗</a></section>
  {unavailable ? <section className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>Profile data could not be verified at this time.</span></section> : null}
  {!unavailable && !launches.length ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" /><strong>No matching launch in the recent window.</strong><p>Older launches may exist. Check the factory history on BscScan.</p></section> : null}
  <div className="launchGrid">{launches.map((launch) => <article className="launchCard" key={launch.token}><div className="tokenTitle"><strong>{launch.name}</strong><span>{launch.symbol}</span></div><p>{launch.status} · {launch.mode === "tax" ? "Legacy testnet" : "Standard"}</p><div className="heroActions"><Link className="primaryCta" href={`/market/${launch.curve}${launch.mode === "tax" ? "?mode=tax" : ""}`}>Open market →</Link><Link className="secondaryCta" href={`/token/${launch.token}`}>Token →</Link></div></article>)}</div>
  </main>;
}
