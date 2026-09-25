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
          <div className="eyebrow">LET&apos;S MAKE SOMETHING FUN.</div>
          <h1>Meme coins, paired with the BNB economy.</h1>
          <p>
            Launch against BNB, stablecoins, BNB-native assets, tokenized stocks,
            or eventually any compatible BEP-20 that passes Fortune&apos;s checks.
          </p>
          <div className="heroActions">
            <Link href={launchHref} className="primaryCta">Launch a token</Link>
            <Link href="/explore" className="secondaryCta">Explore tokens</Link>
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
            <span className="eyebrow">THREE RULES</span>
            <h2>The whole product should fit in your head.</h2>
          </div>
        </div>
        <div className="automationGrid">
          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">01</span>
              <span className="automationStatus statusHealthy">
                {FORTUNE_TAX_NETWORK_CONFIGURED ? "ENABLED" : "V2 IN REVIEW"}
              </span>
            </div>
            <h2>No dumping</h2>
            <p>
              Burn + Rewards v2 is being built so Fortune never sells the
              launch-token fee stream to fund rewards. Token-side fees burn.
              Pair-asset fees stay pair assets.
            </p>
            <strong>No reward-funded sell pressure.</strong>
          </article>
          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">02</span>
              <span className="automationStatus statusHealthy">
                {FORTUNE_TAX_NETWORK_CONFIGURED ? "ENABLED" : "V2 IN REVIEW"}
              </span>
            </div>
            <h2>Holders get paid</h2>
            <p>
              The target Burn + Rewards market pays holder rewards in the pair
              asset itself — BNB, a stablecoin, a stock representation, or
              another reviewed BNB asset — without selling the meme coin first.
            </p>
            <strong>Rewards in what the token trades against.</strong>
          </article>
          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">03</span>
              <span className="automationStatus statusHealthy">BNB NATIVE</span>
            </div>
            <h2>Pair with anything</h2>
            <p>
              Start with BNB. Expand into USDT/USDC, BTCB, ETH, CAKE,
              tokenized stocks/RWAs and eventually compatibility-checked BEP-20s.
            </p>
            <strong>The BNB economy becomes the pair menu.</strong>
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
