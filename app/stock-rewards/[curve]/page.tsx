import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAddress } from "viem";
import StockRewardsMarket from "@/components/StockRewardsMarket";
import TokenLogo from "@/components/TokenLogo";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { STOCK_REWARDS } from "@/lib/stock-rewards";
import { readStockRewardsLaunch } from "@/lib/stock-rewards-read";

export const dynamic = "force-dynamic";

const readLaunch = cache(async (curve: string) => {
  try {
    return { launch: await readStockRewardsLaunch(curve), unavailable: false };
  } catch {
    return { launch: null, unavailable: true };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ curve: string }> }): Promise<Metadata> {
  const { curve } = await params;
  if (!STOCK_REWARDS.enabled || !isAddress(curve)) notFound();
  const { launch, unavailable } = await readLaunch(curve);
  if (!launch && !unavailable) notFound();
  if (!launch) return { title: "Stock Rewards" };
  const basket = launch.stocks.map((stock) => stock.symbol).join(", ");
  const title = `${launch.name} ($${launch.symbol}) pays holders ${basket}`;
  const description = `${launch.name} is a Fortune Stock Rewards launch on ${FORTUNE_NETWORK.chainName}: holders earn ${basket}, claimable onchain at any time. Unaudited beta.`;
  return {
    title,
    description,
    alternates: { canonical: `/stock-rewards/${launch.curve}` },
    robots: FORTUNE_NETWORK.isMainnet ? undefined : { index: false },
    openGraph: { type: "website", siteName: "Fortune", title, description, url: `/stock-rewards/${launch.curve}` },
  };
}

export default async function StockRewardsPage({ params }: { params: Promise<{ curve: string }> }) {
  const { curve } = await params;
  if (!STOCK_REWARDS.enabled || !isAddress(curve)) notFound();
  const { launch, unavailable } = await readLaunch(curve);
  if (!launch && !unavailable) notFound();

  if (!launch) {
    return (
      <main className="page">
        <section className="panel emptyPanel statePanel">
          <span className="eyebrow">STOCK REWARDS</span>
          <h1>This launch could not be read right now.</h1>
          <p className="dataDisclaimer">BNB Chain did not answer. Nothing is wrong with your funds; try again in a minute.</p>
          <div className="heroActions"><Link className="secondaryCta" href="/markets#stock-rewards">Back to Explore</Link></div>
        </section>
      </main>
    );
  }

  const status = launch.phase === "CurveActive" ? "Curve" : launch.phase === "GraduationReady" ? "Ready to graduate" : launch.phase === "Graduated" ? "PancakeSwap V3" : "Rescue";
  return (
    <main className="page customMarketPage stockRewardsMarketPage">
      <nav className="assetCrumbs" aria-label="Breadcrumb">
        <Link href="/markets#stock-rewards">Stock Rewards</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" translate="no">{launch.symbol}</span>
      </nav>

      <section className="pageHeading assetHeading">
        <div className="assetTitle">
          <TokenLogo src={launch.imageURI} symbol={launch.symbol} />
          <div>
            <span className="eyebrow">STOCK REWARDS · BETA</span>
            <h1 translate="no">{launch.name}</h1>
            <p>
              <span translate="no">${launch.symbol}</span> · Holders earn <span translate="no">{launch.stocks.map((stock) => stock.symbol).join(" · ")}</span>
              <span className={"statusPill customPhase-" + launch.phase}>{status}</span>
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

      <StockRewardsMarket initial={launch} />

      <p className="dataDisclaimer">
        <span>Stock Rewards pay holders in tokenized stocks. The launch token is not a stock, and no company has endorsed it.</span>{" "}
        <span>On BSC Testnet the stocks are faucet test shares with test prices and no value. These contracts have not been audited.</span>
      </p>
    </main>
  );
}
