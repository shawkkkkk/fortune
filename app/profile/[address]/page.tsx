import type { Metadata } from "next";
import Link from "next/link";
import { getAddress, isAddress } from "viem";
import { notFound } from "next/navigation";
import HoldingsPanel from "@/components/HoldingsPanel";
import { PairChips } from "@/components/PairAssets";
import WatchButton from "@/components/WatchButton";
import { decodeCatalogCursor, encodeCatalogCursor } from "@/lib/catalog-cursor";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { formatPrice, formatShare, formatUsd, shortAddress } from "@/lib/market-format";
import { readCreatorRecord, readPortfolio, type CreatorLaunch, type CreatorRecord, type Portfolio } from "@/lib/market-insights";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return {};
  return {
    title: `Wallet ${shortAddress(address)}`,
    description: `Fortune tokens held and launched by ${address} on ${FORTUNE_NETWORK.chainName}, read onchain.`,
    alternates: { canonical: `/profile/${getAddress(address)}` },
  };
}

function statusLabel(item: CreatorLaunch) {
  if (item.status === "GraduationReady") return "Ready to graduate";
  if (item.status === "Pancake") return item.mode === "tax" ? "Pancake V2" : "Pancake V3";
  return item.status;
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  let position: ReturnType<typeof decodeCatalogCursor>;
  try { position = decodeCatalogCursor((await searchParams).cursor || null); } catch { notFound(); }
  const { offset, blockNumber } = position;

  // Both reads run together; holdings render on the server so the launches below never move.
  const [recordResult, portfolioResult] = await Promise.allSettled([
    readCreatorRecord(address, offset, PAGE_SIZE, blockNumber),
    readPortfolio(address),
  ]);
  const record: CreatorRecord | null = recordResult.status === "fulfilled" ? recordResult.value : null;
  const unavailable = !record?.configured;
  const portfolio: Portfolio | null = portfolioResult.status === "fulfilled" && portfolioResult.value.configured ? portfolioResult.value : null;

  const launched = record?.launches ?? 0;
  const graduated = record?.phases.graduated ?? 0;
  const nextCursor = record?.hasMore && record.blockNumber ? encodeCatalogCursor(offset + record.items.length, BigInt(record.blockNumber)) : null;

  return (
    <main className="page profilePage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">WALLET · CHAIN {FORTUNE_NETWORK.chainId}</span>
          <h1 translate="no">{shortAddress(address)}</h1>
          <p>Fortune tokens this address holds and the launches it created, read from BNB Chain. An address is public onchain data, not a verified identity.</p>
        </div>
        <div className="tokenHeadingActions">
          <a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer">BscScan ↗</a>
        </div>
      </section>

      <HoldingsPanel key={address} address={address} initial={portfolio} />

      <section className="panel profileLaunches">
        <span className="eyebrow">LAUNCHES</span>
        <h2>{launched ? "Launched by this address" : "No launches from this address"}</h2>
        {unavailable ? (
          <div className="registryNotice statusError"><strong>ONCHAIN READ UNAVAILABLE</strong><span>This creator&apos;s launches could not be verified right now.</span></div>
        ) : null}

        {record && launched ? (
          <div className="metricsGrid four">
            <div className="metric"><span>Launches</span><strong>{launched}</strong></div>
            <div className="metric"><span>Graduated</span><strong>{graduated}</strong></div>
            <div className="metric"><span>On the curve</span><strong>{record.phases.curve + record.phases.ready}</strong></div>
            <div className="metric"><span>Graduation rate</span><strong>{Math.round((graduated / launched) * 100)}%</strong></div>
          </div>
        ) : null}

        {record && !unavailable && !launched ? (
          <p className="fieldHint">The Fortune factory has no launches recorded for this address.</p>
        ) : null}

        {record?.items.length ? (
          <div className="launchGrid">
            {record.items.map((item) => (
              <div className="launchCardWrap" key={item.token}>
                <WatchButton token={item.token} symbol={item.symbol} className="cardWatch" />
                <Link href={`/market/${item.curve}${item.mode === "tax" ? "?mode=tax" : ""}`} className="launchCard">
                  <div className="launchCardTop">
                    <div className="tokenAvatar">{item.symbol.slice(0, 2)}</div>
                    <div>
                      <div className="tokenTitle">
                        <strong translate="no">{item.name}</strong>
                        <span translate="no">{item.symbol}</span>
                      </div>
                      <div className="mutedSmall" translate="no">{new Date(item.createdAt * 1000).toISOString().slice(0, 10)}</div>
                    </div>
                    <span className={"statusPill " + (item.status === "Pancake" ? "statusGraduated" : item.status === "GraduationReady" ? "statusGraduating" : "")}>{statusLabel(item)}</span>
                  </div>

                  <PairChips pairs={item.pairs} />

                  <div className="marketStats">
                    <div><span>Price</span><strong translate="no">{formatPrice(item.priceUsd)}</strong></div>
                    <div><span>Market cap</span><strong translate="no">{formatUsd(item.marketCapUsd)}</strong></div>
                    <div><span>Creator holds</span><strong translate="no">{item.creatorShare === null ? "—" : formatShare(item.creatorShare)}</strong></div>
                  </div>

                  {item.status === "Pancake" ? (
                    <div className="progressHeader"><span>Pool liquidity</span><strong translate="no">{formatUsd(item.liquidityUsd)}</strong></div>
                  ) : (
                    <>
                      <div className="progressHeader"><span>Graduation</span><strong translate="no">{item.graduationProgress.toFixed(2)}%</strong></div>
                      <div className="progressTrack"><span style={{ width: Math.min(100, item.graduationProgress) + "%" }} /></div>
                    </>
                  )}
                </Link>
              </div>
            ))}
          </div>
        ) : null}

        {record && (offset > 0 || nextCursor) ? (
          <div className="heroActions loadMore">
            {offset > 0 ? <Link className="secondaryCta" href={`/profile/${address}`}>Newest launches</Link> : null}
            {nextCursor ? <Link className="secondaryCta" href={`/profile/${address}?cursor=${nextCursor}`}>Older launches →</Link> : null}
          </div>
        ) : null}

        {record && launched ? (
          <p className="fieldHint">Counts cover every launch this address created. &ldquo;Creator holds&rdquo; is the creator wallet&apos;s balance now; tokens moved to other wallets are not attributed to the creator.</p>
        ) : null}
      </section>
    </main>
  );
}
