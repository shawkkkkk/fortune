import Link from "next/link";
import {
  FORTUNE_NETWORK,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

const sections = [
  ["how", "How a Fortune launch works"],
  ["burns", "Burn + Rewards"],
  ["graduation", "Locked Pancake liquidity"],
  ["rewards", "Holder rewards"],
  ["pairs", "Pair assets on BNB"],
  ["any-bep20", "Any reviewed BEP-20"],
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
        <Link href={FORTUNE_NETWORK.isMainnet ? "/launch" : "/testnet"} className="primaryCta">Launch →</Link>
      </section>

      <section className="panel">
        <span className="eyebrow">CONTENTS</span>
        <div className="registryCategories">
          {sections.map(([id, label]) => <a key={id} href={"#" + id}>{label}</a>)}
        </div>
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
          Current BNB mainnet v1 status: <strong>{FORTUNE_TAX_NETWORK_CONFIGURED ? "enabled" : "not enabled"}</strong>.
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
          must pass before the asset becomes launchable.
        </p>
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
    </main>
  );
}
