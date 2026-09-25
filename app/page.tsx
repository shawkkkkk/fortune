import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import { AuspiciousCloud, FortuneCoin } from "@/components/Ornaments";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

const pairLanes = [
  ["BNB + majors", "WBNB first · BTCB / ETH expansion"],
  ["Stablecoins", "USDT · USDC · FDUSD candidates"],
  ["BNB DeFi", "CAKE and reviewed BEP-20 assets"],
  ["Tokenized stocks", "xStocks · bStocks · eligibility-gated"],
  ["Any BEP-20", "Compatibility + oracle + liquidity review"],
] as const;

const launchSteps = [
  ["Name it", "Name, ticker and a square image. These details are visible to everyone."],
  ["Pick Standard", "Fixed supply with Pancake V3 graduation. Burn + Rewards stays in research."],
  ["Choose a pair", "Only live registry-approved assets are selectable."],
  ["Optional first buy", "Simulated with a minimum token output before it is submitted."],
  ["Review + launch", "Fortune repeats the onchain preflight before your wallet signs."],
] as const;

const shieldStats = [
  ["Opening buy tax", "99% → 0%", "Decays over the first five seconds"],
  ["Per-wallet cap", "2%", "Cumulative buys in the first 15 seconds"],
  ["Exemptions", "None", "Creator wallets pay the shield too"],
  ["Stuck launch rescue", "7 days", "Then holders can trigger a pro-rata reserve rescue"],
] as const;

// Chinese numerals 一 二 三 drawn as bars so they never depend on a CJK font.
const numeralBars = [
  [[12, 44, 76]],
  [[24, 24, 52], [10, 64, 80]],
  [[20, 14, 60], [26, 44, 48], [10, 74, 80]],
] as const;

function RuleNumeral({ index }: { index: number }) {
  return (
    <span className="ruleIndex" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        {numeralBars[index].map(([x, y, width]) => (
          <rect key={y} x={x} y={y} width={width} height="12" rx="6" fill="currentColor" />
        ))}
      </svg>
    </span>
  );
}

export default function HomePage() {
  const launchHref = "/launch";

  return (
    <main className="page homePage">
      <section className="homeHero">
        <div className="homeHeroCopy">
          <p className="heroStatus">
            <span
              className={
                "heroStatusDot" +
                (FORTUNE_NETWORK_CONFIGURED ? "" : " heroStatusDotPaused")
              }
            />
            <span>
              {FORTUNE_NETWORK.isMainnet
                ? "BNB Smart Chain"
                : "Public BSC Testnet alpha"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {FORTUNE_NETWORK_CONFIGURED ? "Launches open" : "Launches paused"}
            </span>
          </p>
          <span className="eyebrow">LET&apos;S MAKE SOMETHING FUN.</span>
          <h1>
            <span>Meme coins,</span>{" "}
            <span className="heroTitleAccent">paired with the BNB economy.</span>
          </h1>
          <p className="heroLead">
            Launch against BNB, stablecoins, BNB-native assets, tokenized stocks,
            or eventually any compatible BEP-20 that passes Fortune&apos;s checks.
          </p>
          <div className="heroActions">
            <Link href={launchHref} className="primaryCta">Launch a token</Link>
            <Link href="/explore" className="secondaryCta">Explore tokens</Link>
          </div>
          <ul className="heroFacts" aria-label="Every Standard launch">
            <li><strong>Fixed supply</strong><span>No mint or blacklist</span></li>
            <li><strong>0x…fe address</strong><span>CREATE2 vanity suffix</span></li>
            <li><strong>Locked liquidity</strong><span>Pancake V3 LP, forever</span></li>
          </ul>
          <p className="dataDisclaimer">
            {FORTUNE_NETWORK.isMainnet
              ? "Real-value BNB Chain deployment. Availability is constrained by the reviewed onchain registry and release gates."
              : "Public BSC Testnet alpha. Mainnet remains fail-closed until the production release gates are complete."}
          </p>
        </div>

        <div className="homeHeroArt">
          <AuspiciousCloud className="heroCloud heroCloudLeft" />
          <AuspiciousCloud className="heroCloud heroCloudRight" />
          <div className="moonGate">
            <img src="/fortune-cat-scene.jpg" alt="Fortune's white lucky cat in a red and gold outfit holding a fortune cookie" width="1254" height="1254" fetchPriority="high" />
          </div>
          <div className="fortuneSlip">
            <FortuneCoin />
            <span>FORTUNE ON BNB</span>
            <strong>Make your own luck.</strong>
          </div>
        </div>
      </section>

      <section className="homeSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">THREE RULES</span>
            <h2>The whole product should fit in your head.</h2>
          </div>
        </div>
        <div className="ruleGrid">
          <article className="ruleCard">
            <div className="ruleTop">
              <RuleNumeral index={0} />
              <span className="automationStatus statusHealthy">
                V2 IN REVIEW
              </span>
            </div>
            <h3>No dumping</h3>
            <p>
              Burn + Rewards v2 is being built so Fortune never sells the
              launch-token fee stream to fund rewards. Token-side fees burn.
              Pair-asset fees stay pair assets.
            </p>
            <strong>No reward-funded sell pressure.</strong>
          </article>
          <article className="ruleCard">
            <div className="ruleTop">
              <RuleNumeral index={1} />
              <span className="automationStatus statusHealthy">
                V2 IN REVIEW
              </span>
            </div>
            <h3>Holders get paid</h3>
            <p>
              The target Burn + Rewards market pays holder rewards in the pair
              asset itself — BNB, a stablecoin, a stock representation, or
              another reviewed BNB asset — without selling the meme coin first.
            </p>
            <strong>Rewards in what the token trades against.</strong>
          </article>
          <article className="ruleCard">
            <div className="ruleTop">
              <RuleNumeral index={2} />
              <span className="automationStatus statusHealthy">BNB NATIVE</span>
            </div>
            <h3>Pair with anything</h3>
            <p>
              Start with BNB. Expand into USDT/USDC, BTCB, ETH, CAKE,
              tokenized stocks/RWAs and eventually compatibility-checked BEP-20s.
            </p>
            <strong>The BNB economy becomes the pair menu.</strong>
          </article>
        </div>
      </section>

      <section className="homeSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">HOW A LAUNCH WORKS</span>
            <h2>Five short steps, checked onchain before you sign.</h2>
          </div>
          <Link href={launchHref} className="primaryCta">Start a launch →</Link>
        </div>
        <ol className="launchSteps">
          {launchSteps.map(([title, detail], index) => (
            <li key={title}>
              <span className="stepSeal">{index + 1}</span>
              <strong>{title}</strong>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shieldSection">
        <AuspiciousCloud />
        <div className="shieldCopy">
          <span className="eyebrow">FORTUNE LAUNCH SHIELD</span>
          <h2>Snipers meet a shield in the first seconds.</h2>
          <p>
            Every Fortune curve opens with protocol-level anti-sniper protection.
            Shield proceeds reinforce liquidity instead of paying the creator.
          </p>
          <div className="heroActions">
            <Link href="/docs#how" className="secondaryCta">How launches work →</Link>
          </div>
        </div>
        <dl className="shieldStats">
          {shieldStats.map(([label, value, detail]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
              <span>{detail}</span>
            </div>
          ))}
        </dl>
      </section>

      <section className="homeSection pairSection">
        <div>
          <span className="eyebrow">WHY BNB IS DIFFERENT</span>
          <h2>A much larger pair universe than a meme-only launchpad.</h2>
          <p className="dataDisclaimer">
            Listing a category is not approval to launch against every asset in it.
            Fortune requires an exact BSC contract, compatible token behavior,
            oracle policy and graduation readiness before a pair becomes launchable.
          </p>
          <Link href="/assets" className="secondaryCta">Pair registry →</Link>
        </div>
        <ul className="pairLanes">
          {pairLanes.map(([label, detail]) => (
            <li key={label}>
              <FortuneCoin />
              <span>{label}</span>
              <strong>{detail}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="homeSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">PUBLIC PROOF</span>
            <h2>Burns, rewards and protocol stats belong in public ledgers.</h2>
          </div>
        </div>
        <div className="proofGrid">
          <Link href="/burns" className="proofCard proofCardArt">
            <img src="/fortune-cat-burns.webp" alt="" width="1254" height="1254" loading="lazy" />
            <strong>Burns</strong>
            <span>Burn routes backed by public transaction evidence.</span>
          </Link>
          <Link href="/rewards" className="proofCard proofCardArt">
            <img src="/fortune-cat-rewards.webp" alt="" width="1254" height="1254" loading="lazy" />
            <strong>Rewards</strong>
            <span>Pair-asset holder claims with a public ledger.</span>
          </Link>
          <Link href="/stats" className="proofCard">
            <strong>Stats</strong>
            <span>Exact launch counts read from the factories.</span>
          </Link>
          <Link href="/status" className="proofCard">
            <strong>System status</strong>
            <span>Live RPC, contract and release-gate checks.</span>
          </Link>
          <Link href="/developers" className="proofCard">
            <strong>API</strong>
            <span>The same public data Fortune uses.</span>
          </Link>
        </div>
      </section>

      <section className="ctaBand">
        <img src="/fortune-cat-cutout.webp" alt="" width="1254" height="1254" loading="lazy" />
        <div>
          <div className="heroBrandLockup"><FortuneLogo size="sm" href="" /></div>
          <h2>Make your own luck.</h2>
          <p>
            {FORTUNE_NETWORK.isTestnet
              ? "Try the full launch flow with valueless test assets first."
              : "Every launch is checked onchain before your wallet signs."}
          </p>
        </div>
        <div className="heroActions">
          <Link href={launchHref} className="primaryCta">Launch a token</Link>
          {FORTUNE_NETWORK.isTestnet ? <Link href="/testnet" className="secondaryCta">Testnet lab</Link> : null}
        </div>
      </section>
    </main>
  );
}
