import type { Metadata } from "next";
import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import { AuspiciousCloud, CloudBand, FortuneCoin } from "@/components/Ornaments";
import ParallaxLayer from "@/components/Parallax";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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

const questions = [
  [
    "What is Fortune?",
    "A BNB Smart Chain launchpad for meme coins. Name a token, choose a reviewed pair asset, optionally make the first buy, and launch a fixed-supply token on Fortune's curve.",
  ],
  [
    "Can I use real money yet?",
    "No. Fortune is a public alpha on BSC Testnet with valueless test assets. The contracts are pre-audit, and mainnet stays disabled until independent review and every release gate pass.",
  ],
  [
    "What does the Launch Shield do?",
    "Every curve opens with a 99% buy tax that decays to zero within five seconds, plus a 2% per-wallet cap for the first 15 seconds. Creators are not exempt, and shield proceeds reinforce liquidity.",
  ],
  [
    "What happens at graduation?",
    "Anyone can finalize graduation once a curve reaches its target. Standard launches move into Pancake V3 and the LP position is locked in Fortune's locker for good. Failed graduations stay retryable, and after seven days holders can trigger a pro-rata reserve rescue.",
  ],
  [
    "Which assets can I pair with?",
    "Only assets approved in the onchain registry. The Standard mainnet candidate is pinned to WBNB; stablecoins, BNB majors, DeFi tokens and tokenized stocks arrive in separate, reviewed releases.",
  ],
  [
    "Is Burn + Rewards live?",
    "Not yet. Burn + Rewards v2 is research: token-side fees would burn and holders would be paid in the pair asset without selling the meme coin. It has its own audit boundary and no real-value deployment.",
  ],
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

// Staggered reveal delays, as inline styles like the rest of the motion system.
const stagger = (index: number, step = 0.12, start = 0) => ({
  animationDelay: (start + index * step).toFixed(2) + "s",
});

export default function HomePage() {
  const launchHref = "/launch";

  return (
    <main className="homePage">
      <section className="cinemaHero" id="fortune-hero">
        <div className="cinemaBackdrop" aria-hidden="true">
          <span className="cinemaMoon" />
          <span className="cinemaRing" />
          <span className="cinemaRing cinemaRingOuter" />
          <AuspiciousCloud className="cinemaSwirl cinemaSwirlLeft" />
          <AuspiciousCloud className="cinemaSwirl cinemaSwirlRight" />
        </div>

        <div className="cinemaContent">
          <p className="cinemaStatus liquid-glass hero-fade-up">
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
          <p className="cinemaKicker hero-fade-up" style={{ animationDelay: "0.1s" }}>
            Fortune
          </p>
          <p className="cinemaKickerSub hero-fade-up" style={{ animationDelay: "0.1s" }}>
            BNB Smart Chain launchpad
          </p>
          <h1 className="cinemaTitle hero-fade-up" style={{ animationDelay: "0.25s" }}>
            <span className="cinemaTitleSerif">Meme coins,</span>{" "}
            <span className="cinemaTitleSans">paired with the BNB economy.</span>
          </h1>
          <p className="cinemaLead hero-fade-up" style={{ animationDelay: "0.4s" }}>
            Launch against BNB, stablecoins, BNB-native assets, tokenized stocks,
            or eventually any compatible BEP-20 that passes Fortune&apos;s checks.
          </p>
          <div className="cinemaActions hero-fade-up" style={{ animationDelay: "0.55s" }}>
            <Link href={launchHref} className="glassPill liquid-glass">Launch a token</Link>
            <Link href="/explore" className="outlinePill">Explore tokens</Link>
          </div>
        </div>

        <div className="cinemaStage">
          <span className="cinemaPodium" aria-hidden="true" />
          <img
            className="cinemaCat hero-fade-up"
            style={{ animationDelay: "0.3s" }}
            src="/fortune-cat-cutout-800.webp"
            srcSet="/fortune-cat-cutout-400.webp 400w, /fortune-cat-cutout-800.webp 800w"
            sizes="(max-width: 760px) 300px, 400px"
            alt="Fortune's white lucky cat in a red and gold outfit holding a fortune cookie"
            width="800"
            height="800"
            fetchPriority="high"
          />
        </div>

        <CloudBand className="cinemaClouds" />
      </section>

      <div className="page homeBody">
        <section className="introStrip">
          <ul className="heroFacts" aria-label="Every Standard launch">
            <li className="reveal" style={stagger(0)}><strong>Fixed supply</strong><span>No mint or blacklist</span></li>
            <li className="reveal" style={stagger(1)}><strong>0x…fe address</strong><span>CREATE2 vanity suffix</span></li>
            <li className="reveal" style={stagger(2)}><strong>Locked liquidity</strong><span>Pancake V3 LP, forever</span></li>
          </ul>
          <p className="dataDisclaimer reveal" style={stagger(3)}>
            {FORTUNE_NETWORK.isMainnet
              ? "Real-value BNB Chain deployment. Availability is constrained by the reviewed onchain registry and release gates."
              : "Public BSC Testnet alpha. Mainnet remains fail-closed until the production release gates are complete."}
          </p>
        </section>

        <section className="homeSection">
          <div className="sectionHeader reveal">
            <div>
              <span className="eyebrow">THREE RULES</span>
              <h2>The whole product should fit in your head.</h2>
            </div>
          </div>
          <div className="ruleGrid">
            <article className="ruleCard reveal" style={stagger(0, 0.12, 0.1)}>
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
            <article className="ruleCard reveal" style={stagger(1, 0.12, 0.1)}>
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
            <article className="ruleCard reveal" style={stagger(2, 0.12, 0.1)}>
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
          <div className="sectionHeader reveal">
            <div>
              <span className="eyebrow">HOW A LAUNCH WORKS</span>
              <h2>Five short steps, checked onchain before you sign.</h2>
            </div>
            <Link href={launchHref} className="primaryCta">Start a launch →</Link>
          </div>
          <ol className="launchSteps">
            {launchSteps.map(([title, detail], index) => (
              <li key={title} className="reveal" style={stagger(index, 0.1, 0.05)}>
                <span className="stepSeal">{index + 1}</span>
                <strong>{title}</strong>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="shieldSection reveal-scale">
          <AuspiciousCloud />
          <div className="shieldCopy">
            <span className="eyebrow">FORTUNE LAUNCH SHIELD</span>
            <h2>Snipers meet a shield in the first seconds.</h2>
            <p>
              Every Fortune curve opens with protocol-level anti-sniper protection.
              Shield proceeds reinforce liquidity instead of paying the creator.
            </p>
            <div className="heroActions">
              <Link href="/docs#how" className="outlinePill">How launches work →</Link>
            </div>
          </div>
          <dl className="shieldStats">
            {shieldStats.map(([label, value, detail], index) => (
              <div key={label} className="liquid-glass reveal" style={stagger(index, 0.12, 0.25)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
                <dd className="shieldDetail">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="homeSection pairSection">
          <div className="reveal">
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
            {pairLanes.map(([label, detail], index) => (
              <li key={label} className="reveal" style={stagger(index, 0.08, 0.1)}>
                <FortuneCoin />
                <span>{label}</span>
                <strong>{detail}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="homeSection">
          <div className="sectionHeader reveal">
            <div>
              <span className="eyebrow">PUBLIC PROOF</span>
              <h2>Burns, rewards and protocol stats belong in public ledgers.</h2>
            </div>
          </div>
          <div className="proofGrid">
            <Link href="/burns" className="proofCard proofCardArt reveal" style={stagger(0, 0.1)}>
              <img src="/fortune-cat-burns-400.webp" srcSet="/fortune-cat-burns-400.webp 400w, /fortune-cat-burns-800.webp 800w" sizes="(max-width: 760px) 180px, 250px" alt="" width="400" height="400" loading="lazy" />
              <strong>Burns</strong>
              <span>Burn routes backed by public transaction evidence.</span>
            </Link>
            <Link href="/rewards" className="proofCard proofCardArt reveal" style={stagger(1, 0.1)}>
              <img src="/fortune-cat-rewards-400.webp" srcSet="/fortune-cat-rewards-400.webp 400w, /fortune-cat-rewards-800.webp 800w" sizes="(max-width: 760px) 180px, 250px" alt="" width="400" height="400" loading="lazy" />
              <strong>Rewards</strong>
              <span>Pair-asset holder claims with a public ledger.</span>
            </Link>
            <Link href="/stats" className="proofCard reveal" style={stagger(2, 0.1)}>
              <strong>Stats</strong>
              <span>Exact launch counts read from the factories.</span>
            </Link>
            <Link href="/status" className="proofCard reveal" style={stagger(3, 0.1)}>
              <strong>System status</strong>
              <span>Live RPC, contract and release-gate checks.</span>
            </Link>
            <Link href="/developers" className="proofCard reveal" style={stagger(4, 0.1)}>
              <strong>API</strong>
              <span>The same public data Fortune uses.</span>
            </Link>
          </div>
        </section>
      </div>

      <section className="qaSection" aria-labelledby="fortune-qa-title">
        <div className="qaInner">
          <p className="qaKicker reveal">BEFORE YOU LAUNCH</p>
          <h2 className="qaTitle reveal" id="fortune-qa-title">
            <span>Q</span>
            <span className="qaAmp">&amp;</span>
            <span>A</span>
          </h2>
          <div className="qaGrid">
            {[questions.slice(0, 3), questions.slice(3)].map((column, columnIndex) => (
              <div key={columnIndex} className={columnIndex ? "qaColumn qaColumnOffset" : "qaColumn"}>
                {column.map(([question, answer], index) => (
                  <article
                    key={question}
                    className="qaItem reveal"
                    style={stagger(columnIndex * 3 + index, 0.12, 0.12)}
                  >
                    <h3>{question}</h3>
                    <p>{answer}</p>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
        <ParallaxLayer className="qaClouds" mode="rise" strength={30} start={60}>
          <CloudBand />
        </ParallaxLayer>
      </section>

      <section className="quoteBanner">
        <div className="quoteBackdrop" aria-hidden="true">
          <span className="cinemaRing" />
          <span className="cinemaRing cinemaRingOuter" />
        </div>
        <div className="quoteContent">
          <div className="quoteLogo reveal"><FortuneLogo size="sm" href="" /></div>
          <blockquote className="quoteText reveal-scale">
            Make your own luck, <em>then let the chain prove it.</em>
          </blockquote>
          <div className="cinemaActions reveal" style={{ animationDelay: "0.25s" }}>
            <Link href={launchHref} className="glassPill liquid-glass">Launch a token</Link>
            {FORTUNE_NETWORK.isTestnet ? (
              <Link href="/testnet" className="outlinePill">Testnet lab</Link>
            ) : (
              <Link href="/explore" className="outlinePill">Explore tokens</Link>
            )}
          </div>
        </div>
        <img
          className="quoteCat reveal"
          style={{ animationDelay: "0.35s" }}
          src="/fortune-cat-rewards-800.webp"
          srcSet="/fortune-cat-rewards-400.webp 400w, /fortune-cat-rewards-800.webp 800w"
          sizes="(max-width: 760px) 190px, 330px"
          alt=""
          width="800"
          height="800"
          loading="lazy"
        />
        <ParallaxLayer className="quoteClouds" mode="lift" strength={80}>
          <CloudBand />
        </ParallaxLayer>
      </section>
    </main>
  );
}
