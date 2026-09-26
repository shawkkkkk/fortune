import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAddress } from "viem";
import CustomPairMarket from "@/components/CustomPairMarket";
import TokenLogo from "@/components/TokenLogo";
import { CUSTOM_PAIRS } from "@/lib/custom-pairs";
import { readCustomPairLaunch } from "@/lib/custom-pairs-read";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export const dynamic = "force-dynamic";

const readLaunch = cache(async (curve: string) => {
  try {
    return { launch: await readCustomPairLaunch(curve), unavailable: false };
  } catch {
    return { launch: null, unavailable: true };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ curve: string }> }): Promise<Metadata> {
  const { curve } = await params;
  if (!CUSTOM_PAIRS.enabled || !isAddress(curve)) notFound();
  const { launch, unavailable } = await readLaunch(curve);
  // Throwing here as well gives crawlers a real 404 status.
  if (!launch && !unavailable) notFound();
  if (!launch) return { title: "Custom pair" };
  const title = `${launch.name} ($${launch.symbol}) paired with ${launch.pair.symbol}`;
  const description = `${launch.name} is a Fortune custom-pair launch trading against ${launch.pair.symbol} on ${FORTUNE_NETWORK.chainName}. Unaudited beta.`;
  return {
    title,
    description,
    alternates: { canonical: `/custom/${launch.curve}` },
    robots: FORTUNE_NETWORK.isMainnet ? undefined : { index: false },
    openGraph: { type: "website", siteName: "Fortune", title, description, url: `/custom/${launch.curve}` },
  };
}

export default async function CustomPairPage({ params }: { params: Promise<{ curve: string }> }) {
  const { curve } = await params;
  if (!CUSTOM_PAIRS.enabled || !isAddress(curve)) notFound();
  const { launch, unavailable } = await readLaunch(curve);
  if (!launch && !unavailable) notFound();

  if (!launch) {
    return (
      <main className="page">
        <section className="panel emptyPanel statePanel">
          <span className="eyebrow">CUSTOM PAIR</span>
          <h1>This launch could not be read right now.</h1>
          <p className="dataDisclaimer">BNB Chain did not answer. Nothing is wrong with your funds; try again in a minute.</p>
          <div className="heroActions"><Link className="secondaryCta" href="/explore">Back to Explore</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="page customMarketPage">
      <nav className="assetCrumbs" aria-label="Breadcrumb">
        <Link href="/explore#custom-pairs">Custom pairs</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" translate="no">{launch.symbol}</span>
      </nav>

      <section className="pageHeading assetHeading">
        <div className="assetTitle">
          <TokenLogo src={launch.imageURI} symbol={launch.symbol} />
          <div>
            <span className="eyebrow">CUSTOM PAIR · BETA</span>
            <h1 translate="no">{launch.name}</h1>
            <p>
              <span translate="no">${launch.symbol}</span> · Paired with <span translate="no">{launch.pair.symbol}</span>
              <span className={"statusPill customPhase-" + launch.phase}>{launch.phase === "CurveActive" ? "Curve" : launch.phase === "GraduationReady" ? "Ready to graduate" : launch.phase === "Graduated" ? "Pancake V2" : "Rescue"}</span>
            </p>
          </div>
        </div>
        <div className="tokenHeadingActions">
          <a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/token/${launch.token}`} target="_blank" rel="noreferrer">BscScan ↗</a>
        </div>
      </section>

      {launch.description ? <p className="customDescription" translate="no">{launch.description}</p> : null}
      {[launch.website, launch.xProfile, launch.telegram].some(Boolean) ? (
        <div className="heroActions customLinks">
          {launch.website ? <a className="secondaryCta" href={launch.website} target="_blank" rel="noreferrer nofollow">Website ↗</a> : null}
          {launch.xProfile ? <a className="secondaryCta" href={launch.xProfile} target="_blank" rel="noreferrer nofollow">X ↗</a> : null}
          {launch.telegram ? <a className="secondaryCta" href={launch.telegram} target="_blank" rel="noreferrer nofollow">Telegram ↗</a> : null}
        </div>
      ) : null}

      <CustomPairMarket initial={launch} />

      <p className="dataDisclaimer">
        <span>Custom pairs let anyone launch against any BEP-20. Fortune does not review or endorse pair tokens, and these contracts have not been audited.</span>{" "}
        <span>Prices are shown in the pair token. Its issuer can change its taxes, pause it or blacklist addresses.</span>
      </p>
    </main>
  );
}
