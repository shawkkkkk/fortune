import Link from "next/link";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { readCreatorFortuneLaunches } from "@/lib/onchain-launches";
import { decodeCatalogCursor, encodeCatalogCursor } from "@/lib/catalog-cursor";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  let launches: Awaited<ReturnType<typeof readCreatorFortuneLaunches>>["launches"] = [];
  let unavailable = false;
  let position: ReturnType<typeof decodeCatalogCursor>;
  try { position = decodeCatalogCursor((await searchParams).cursor || null); } catch { notFound(); }
  const { offset, blockNumber } = position;
  let snapshotBlock: bigint | null = null;
  let creatorTotal = 0;
  let hasMore = false;
  try {
    const result = await readCreatorFortuneLaunches(address, offset, 25, blockNumber);
    unavailable = !result.configured;
    launches = result.launches;
    creatorTotal = result.creatorTotal;
    snapshotBlock = result.blockNumber;
    hasMore = result.hasMore;
  } catch { unavailable = true; }

  return <main className="page narrowPage"><section className="pageHeading"><div><span className="eyebrow">CREATOR PROFILE · CHAIN {FORTUNE_NETWORK.chainId}</span><h1>{address.slice(0,6)}…{address.slice(-4)}</h1><p>Launches recorded for this creator by the configured Fortune factories. This address is public onchain data, not a verified identity.</p></div><a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer">View on BscScan ↗</a></section>
  {unavailable ? <section className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>Profile data could not be verified at this time.</span></section> : null}
  {!unavailable && !launches.length ? <section className="panel emptyPanel"><img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" /><strong>No launches on this page.</strong><p>Browse the creator’s other pages or check the factory history on BscScan.</p></section> : null}
  <div className="launchGrid">{launches.map((launch) => <article className="launchCard" key={launch.token}><div className="tokenTitle"><strong>{launch.name}</strong><span>{launch.symbol}</span></div><p>{launch.status} · {launch.mode === "tax" ? "Legacy testnet" : "Standard"}</p><div className="heroActions"><Link className="primaryCta" href={`/market/${launch.curve}${launch.mode === "tax" ? "?mode=tax" : ""}`}>Open market →</Link><Link className="secondaryCta" href={`/token/${launch.token}`}>Token →</Link></div></article>)}</div>
  {!unavailable ? <div className="heroActions"><span>{creatorTotal} launches by this creator</span>{offset > 0 ? <Link className="secondaryCta" href={`/profile/${address}`}>First page</Link> : null}{hasMore ? <Link className="secondaryCta" href={`/profile/${address}?cursor=${encodeCatalogCursor(offset + launches.length, snapshotBlock!)}`}>Older launches →</Link> : null}</div> : null}
  </main>;
}
