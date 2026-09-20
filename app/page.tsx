import Link from "next/link";
import LaunchCard from "@/components/LaunchCard";
import { launches } from "@/data/mock";

export default function ExplorePage() {
  return (
    <main className="page">
      <section className="heroSection">
        <div>
          <div className="eyebrow">BNB CHAIN LAUNCH PROTOCOL</div>
          <h1>Launch against anything.</h1>
          <p>
            One token. One canonical price. Up to five quote markets.
            Pair with BNB, stablecoins, crypto, approved tokenized equities,
            RWAs, or Fortune Registry assets.
          </p>
          <div className="heroActions">
            <Link href="/launch" className="primaryCta">Launch a token →</Link>
            <Link href="/analytics" className="secondaryCta">Protocol analytics</Link>
          </div>
        </div>
        <div className="heroManifest">
          <div className="manifestLabel">FORTUNE BASKET CURVE</div>
          <div className="bigBasket">
            <span>BNB</span><span>USDT</span><span>BTCB</span><span>NVDAx</span><span>CAKE</span>
          </div>
          <div className="manifestRule" />
          <div className="manifestRows">
            <div><span>Price</span><strong>One shared curve</strong></div>
            <div><span>Markets</span><strong>1–5</strong></div>
            <div><span>Rewards</span><strong>Any approved asset</strong></div>
            <div><span>Graduation</span><strong>PancakeSwap adapter</strong></div>
          </div>
        </div>
      </section>

      <section className="contentSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">LIVE MARKETS</span>
            <h2>Discover Fortune launches</h2>
          </div>
          <div className="filterTabs">
            <button className="tabActive">Hot</button>
            <button>New</button>
            <button>Graduating</button>
            <button>Graduated</button>
            <button>Multi-pool</button>
            <button>Rewards</button>
          </div>
        </div>

        <div className="launchGrid">
          {launches.map((launch) => <LaunchCard key={launch.id} launch={launch} />)}
        </div>
      </section>

      <section className="registryStrip">
        <div>
          <span className="eyebrow">FORTUNE ASSET REGISTRY</span>
          <h2>Hundreds of BSC assets. One launch interface.</h2>
        </div>
        <div className="registryCategories">
          {["Majors", "BNB Chain", "Stablecoins", "xStocks", "RWAs", "DeFi", "Memes", "BSC 400", "Custom"].map(x => <span key={x}>{x}</span>)}
        </div>
      </section>
    </main>
  );
}
