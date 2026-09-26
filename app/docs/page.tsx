import Link from "next/link";
import {
  FORTUNE_NETWORK,
} from "@/lib/fortune-network";
import {
  ELIGIBILITY_NOTE,
  RISK_POINTS,
  TESTNET_POINT,
} from "@/lib/disclaimer";

const sections = [
  ["disclaimer", "Risk disclaimer"],
  ["how", "How a Fortune launch works"],
  ["burns", "Burn + Rewards"],
  ["graduation", "Locked Pancake liquidity"],
  ["rewards", "Holder rewards"],
  ["pairs", "Pair assets on BNB"],
  ["any-bep20", "Any reviewed BEP-20"],
  ["custom-pairs", "Custom pairs (beta)"],
  ["launch", "Launching a token"],
  ["trust", "What you have to trust"],
  ["api", "API and addresses"],
] as const;

export default function DocsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">DOCS · BNB SMART CHAIN</span>
          <h1>Meme coins, paired with the BNB economy.</h1>
          <p>
            Fortune is built around three rules: no reward-funded token dumping,
            holders get paid in the pair asset, and creators can pair launches
            with an expanding universe of reviewed BNB assets. The interface stays
            simple while the registry, oracle and graduation checks stay explicit
            underneath.
          </p>
        </div>
        <Link href="/launch" className="primaryCta">Launch →</Link>
      </section>

      <div className="docsLayout">
        <nav className="docsToc" aria-label="Contents">
          <span className="eyebrow">CONTENTS</span>
          <ol>
            {sections.map(([id, label]) => <li key={id}><a href={"#" + id}>{label}</a></li>)}
          </ol>
        </nav>

        <div className="docsBody">
          <section className="panel docsDisclaimer" id="disclaimer">
            <span className="eyebrow">RISK DISCLAIMER</span>
            <h2>Read this before you trade</h2>
            <dl className="docsRiskList">
              {[...RISK_POINTS, ...(FORTUNE_NETWORK.isMainnet ? [] : [TESTNET_POINT])].map((point) => (
                <div key={point.title}>
                  <dt>{point.title}</dt>
                  <dd>{point.body}</dd>
                </div>
              ))}
              <div>
                <dt>Eligibility</dt>
                <dd>{ELIGIBILITY_NOTE}</dd>
              </div>
              <div>
                <dt>Data can lag</dt>
                <dd>
                  Prices, charts, volume and rankings come from public BNB Chain RPC endpoints and
                  can be delayed, incomplete or briefly unavailable. Confirm amounts and addresses in
                  your wallet before you sign.
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel" id="how">
            <span className="eyebrow">HOW</span>
            <h2>How a Fortune launch works</h2>
            <p>
              A creator chooses a token identity, launch type and pair asset. Fortune
              validates that configuration against the live registry and oracle policy,
              deploys a fixed-supply token and opens its curve. When the launch reaches
              its graduation condition, the standard stack can migrate into Pancake V3
              and permanently custody the LP-position NFT in Fortune&apos;s locker.
            </p>
          </section>

          <section className="panel" id="burns">
            <span className="eyebrow">BURN + REWARDS</span>
            <h2>A separate, stricter launch architecture</h2>
            <p>
              Fortune&apos;s production target is Burn + Rewards v2: token-side
              market fees can only enter an irreversible burn path, while pair-asset
              fees fund rewards and platform routing directly. Fortune should never
              need to sell the launch token to pay holders. The older fee-on-transfer
              stack remains research/testnet evidence and is not being silently shipped
              as v2.
            </p>
            <p>
              Burn + Rewards v2 status: <strong>research only, disabled for real funds</strong>.
            </p>
          </section>

          <section className="panel" id="graduation">
            <span className="eyebrow">GRADUATION</span>
            <h2>Locked liquidity is a code path, not a creator promise.</h2>
            <p>
              Standard graduation uses Fortune&apos;s Pancake V3 adapter. The curve
              preflights the market, transfers the graduation inventory atomically,
              mints the LP position and deposits the NFT into the permanent Fortune
              liquidity locker. Failed graduation remains retryable rather than
              partially completing.
            </p>
          </section>

          <section className="panel" id="rewards">
            <span className="eyebrow">REWARDS</span>
            <h2>Public accounting before flashy APY.</h2>
            <p>
              Fortune will expose reward pots, epochs and distribution transactions
              only when they can be reproduced from chain data. The extended stack
              already separates holder-dividend accounting from the normal Standard
              token path; production automation remains a separate review boundary.
            </p>
          </section>

          <section className="panel" id="pairs">
            <span className="eyebrow">THE BNB ADVANTAGE</span>
            <h2>Pair assets go far beyond one native coin.</h2>
            <p>
              Fortune&apos;s registry model can represent BNB/majors, stablecoins,
              BNB-native DeFi assets and compatible tokenized stocks/RWAs. A discovered
              BSC token is not automatically launchable: an exact contract, compatible
              transfer behavior, oracle policy and graduation path must all pass.
            </p>
            <div className="registryCategories">
              <span>WBNB</span><span>USDT / USDC</span><span>BTCB / ETH</span>
              <span>CAKE / DeFi</span><span>xStocks / bStocks</span><span>RWAs</span>
            </div>
          </section>

          <section className="panel" id="any-bep20">
            <span className="eyebrow">ANY REVIEWED BEP-20</span>
            <h2>“Paste a contract” is the destination, not an excuse to skip checks.</h2>
            <p>
              Fortune can expand toward arbitrary BEP-20 pairs, but BNB tokens can have
              fees, rebases, blacklists, unusual decimals or thin liquidity. Fortune
              therefore treats custom pairing as a compatibility pipeline: token
              behavior, pricing source, liquidity/graduation venue and policy checks
              must pass before the asset becomes launchable. The permissionless
              alternative is the <a href="#custom-pairs">custom-pairs beta</a>.
            </p>
          </section>

          <section className="panel" id="custom-pairs">
            <span className="eyebrow">CUSTOM PAIRS · BETA</span>
            <h2>Pair with any token, including ones that tax transfers.</h2>
            <p>
              Custom pairs are the permissionless path: paste any BEP-20, such as a
              tokenized stock that is not in the registry or a token with a transfer
              tax, and launch against it. There is no registry and no oracle. Each
              launch gets its own curve priced in the pair token, so a badly behaved
              pair can only affect launches that chose it.
            </p>
            <ul className="docsPoints">
              <li><strong>Transfer taxes are measured, not trusted.</strong> The curve counts only what actually arrives, checks sell slippage against what reaches the seller, and seeds the pool from what the pool received.</li>
              <li><strong>Check a token before you launch.</strong> Fortune simulates a buy, a sell and a graduation transfer and reports the tax on each, plus pause, blacklist, fee-change, limit and rebasing functions found in the bytecode.</li>
              <li><strong>Same Launch Shield.</strong> 99% decaying to zero within five seconds and a 2% wallet cap for fifteen seconds. Shield tax becomes pool liquidity and is never paid to the creator.</li>
              <li><strong>Graduation to PancakeSwap V2.</strong> The pool is created in the launch transaction and locked until graduation, then opened at the final curve price with the LP tokens burned.</li>
              <li><strong>If the pair token breaks.</strong> Losses hit Launch Shield reserve and unclaimed fees first. If the reserve itself falls short, or graduation stays impossible for seven days, holders redeem a pro-rata share of everything the curve holds.</li>
            </ul>
            <p className="reviewWarning">
              Unaudited beta, separate from the audited Standard launch. The site never
              enables it on BNB Smart Chain mainnet until it passes its own audit.
            </p>
            <div className="heroActions">
              <Link href="/launch/custom" className="secondaryCta">Check a token or launch →</Link>
            </div>
          </section>

          <section className="panel" id="launch">
            <span className="eyebrow">LAUNCH</span>
            <h2>Simple by default, advanced when needed.</h2>
            <p>
              The product direction is a short default flow: identity, image, launch
              type, pair asset and optional creator purchase. Fortune&apos;s deeper curve,
              fee and routing controls remain available for reviewed advanced launch
              templates rather than overwhelming every creator.
            </p>
          </section>

          <section className="panel" id="trust">
            <span className="eyebrow">TRUST MODEL</span>
            <h2>Less trust, stated plainly.</h2>
            <p>
              You still trust BNB Smart Chain consensus and the external protocols a
              launch uses, including WBNB, approved oracle feeds and PancakeSwap.
              Fortune&apos;s own production release additionally depends on independent
              contract review, contract-based governance, monitored RPC infrastructure
              and a paused-then-activated deployment ceremony.
            </p>
          </section>

          <section className="panel" id="api">
            <span className="eyebrow">API + ADDRESSES</span>
            <h2>Use the same data Fortune uses.</h2>
            <p>
              Public endpoints cover protocol metadata, assets, pairs, tokenized-stock
              discovery, launches, readiness, transactions, stats and revenue state.
              Production contract addresses remain visible through Fortune status pages
              and BscScan.
            </p>
            <div className="heroActions">
              <Link href="/developers" className="secondaryCta">Developer API</Link>
              <Link href="/status" className="secondaryCta">System status</Link>
              <a href={FORTUNE_NETWORK.explorerUrl} className="secondaryCta" target="_blank" rel="noreferrer">BscScan ↗</a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
