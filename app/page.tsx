import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

const pairLanes = [
  ["BNB + majors", "WBNB first · BTCB / ETH expansion"],
  ["Stablecoins", "USDT · USDC · FDUSD candidates"],
  ["BNB DeFi", "CAKE and reviewed BEP-20 assets"],
  ["Tokenized stocks", "xStocks · bStocks · eligibility-gated"],
  ["Any BEP-20", "Compatibility + oracle + liquidity review"],
] as const;

export default function HomePage() {
  const launchHref = FORTUNE_NETWORK.isMainnet ? "/launch" : "/testnet";

  return (
    <main className="page">
      <section className="heroSection">
        <div>
          <div className="heroBrandLockup"><FortuneLogo size="lg" /></div>
          <div className="eyebrow">THE BNB-NATIVE LAUNCHPAD</div>
          <h1>Launch a token. Pick what it trades against. Graduate to locked liquidity.</h1>
          <p>
            Fortune combines bonding-curve discovery with BNB Chain&apos;s asset
            universe. Start simple with BNB, then expand into stables, DeFi,
            tokenized stocks and reviewed BEP-20 pairs without turning the launch
            flow into a control panel.
          </p>
          <div className="heroActions">
            <Link href={launchHref} className="primaryCta">Launch →</Link>
            <Link href="/explore" className="secondaryCta">Explore</Link>
            <Link href="/docs" className="secondaryCta">How it works</Link>
          </div>
          <p className="dataDisclaimer">
            {FORTUNE_NETWORK.isMainnet
              ? "Real-value BNB Chain deployment. Availability is constrained by the reviewed onchain registry and release gates."
              : "Public BSC Testnet alpha. Mainnet remains fail-closed until the production release gates are complete."}
          </p>
        </div>

        <div className="heroManifest">
          <div className="manifestLabel">TWO LAUNCH TYPES</div>
          <div className="bigBasket">
            <span>Standard</span>
            <span>Burn + Rewards</span>
            <span>Locked liquidity</span>
            <span>Pair-asset markets</span>
          </div>
          <div className="manifestRule" />
          <div className="manifestRows">
            <div><span>Network</span><strong>BNB Smart Chain</strong></div>
            <div><span>Primary DEX path</span><strong>PancakeSwap</strong></div>
            <div><span>Standard stack</span><strong>{FORTUNE_NETWORK_CONFIGURED ? "Configured" : "Gated"}</strong></div>
            <div><span>Burn + Rewards</span><strong>{FORTUNE_TAX_NETWORK_CONFIGURED ? "Enabled" : "In review"}</strong></div>
          </div>
        </div>
      </section>

      <section className="contentSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">THE SIMPLE FLOW</span>
            <h2>One launch flow. BNB-sized expansion underneath.</h2>
          </div>
        </div>
        <div className="automationGrid">
          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">01</span><span className="automationStatus statusHealthy">CREATE</span></div>
            <h2>Pick a launch type</h2>
            <p>Standard keeps the token simple. Burn + Rewards adds immutable burn/reward mechanics only when the separate reviewed stack is available.</p>
          </article>
          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">02</span><span className="automationStatus statusHealthy">PAIR</span></div>
            <h2>Choose the pair</h2>
            <p>The pair asset is what traders contribute on the curve, what graduates into the pool, and what future reward designs can account in.</p>
          </article>
          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">03</span><span className="automationStatus statusHealthy">GRADUATE</span></div>
            <h2>Lock the market</h2>
            <p>Eligible standard launches graduate atomically into Pancake V3 and the resulting LP-position NFT is permanently locked by Fortune.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">WHY BNB IS DIFFERENT</span>
            <h2>A much larger pair universe than a meme-only launchpad.</h2>
          </div>
          <Link href="/assets" className="secondaryCta">Pair registry →</Link>
        </div>
        <div className="manifestTable">
          {pairLanes.map(([label, detail]) => (
            <div key={label}><span>{label}</span><strong>{detail}</strong></div>
          ))}
        </div>
        <p className="dataDisclaimer">
          Listing a category is not approval to launch against every asset in it.
          Fortune requires an exact BSC contract, compatible token behavior,
          oracle policy and graduation readiness before a pair becomes launchable.
        </p>
      </section>

      <section className="registryStrip">
        <div>
          <span className="eyebrow">PUBLIC PROOF</span>
          <h2>Burns, rewards and protocol stats belong in public ledgers.</h2>
        </div>
        <div className="registryCategories">
          <Link href="/burns">Burns</Link>
          <Link href="/rewards">Rewards</Link>
          <Link href="/stats">Stats</Link>
          <Link href="/status">System status</Link>
          <Link href="/developers">API</Link>
        </div>
      </section>
    </main>
  );
}
