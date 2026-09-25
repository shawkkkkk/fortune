import Link from "next/link";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

export default function StatsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE STATS</span>
          <h1>Protocol state, not vanity numbers.</h1>
          <p>
            Fortune separates measured release evidence from live market
            aggregates. Volume, revenue, burns and rewards stay blank until they
            can be rebuilt from public BNB Chain data.
          </p>
        </div>
        <Link href="/analytics" className="secondaryCta">Release evidence →</Link>
      </section>

      <div className="metricsGrid five">
        <div className="metric"><span>Network</span><strong>{FORTUNE_NETWORK.chainName}</strong><small>Chain {FORTUNE_NETWORK.chainId}</small></div>
        <div className="metric"><span>Standard stack</span><strong>{FORTUNE_NETWORK_CONFIGURED ? "Configured" : "Gated"}</strong><small>Factory + registry + graduation</small></div>
        <div className="metric"><span>Burn + Rewards</span><strong>{FORTUNE_TAX_NETWORK_CONFIGURED ? "Enabled" : "Gated"}</strong><small>Separate review boundary</small></div>
        <div className="metric"><span>Live aggregates</span><strong>Indexer pending</strong><small>No placeholder volume</small></div>
        <div className="metric"><span>Primary DEX</span><strong>PancakeSwap</strong><small>BNB-native graduation path</small></div>
      </div>

      <div className="twoColumn">
        <section className="panel">
          <span className="eyebrow">PUBLIC LEDGERS</span>
          <div className="statRows">
            <div><span>Burns</span><strong>Awaiting production indexer</strong></div>
            <div><span>Holder rewards</span><strong>Awaiting production indexer</strong></div>
            <div><span>Protocol revenue</span><strong>Awaiting production indexer</strong></div>
            <div><span>Launch volume</span><strong>Awaiting production indexer</strong></div>
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">BNB EXPANSION LANES</span>
          <div className="statRows">
            <div><span>BNB / majors</span><strong>Core</strong></div>
            <div><span>Stablecoins</span><strong>Registry review</strong></div>
            <div><span>Tokenized stocks / RWAs</span><strong>Eligibility + oracle review</strong></div>
            <div><span>Any BEP-20</span><strong>Compatibility-gated</strong></div>
          </div>
        </section>
      </div>
    </main>
  );
}
