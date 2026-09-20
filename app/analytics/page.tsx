import Link from "next/link";
import Metric from "@/components/Metric";

export default function AnalyticsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">VERIFIED RELEASE EVIDENCE</span>
          <h1>Testnet performance</h1>
          <p>
            These are release-test results, not invented live market metrics.
            A public onchain indexer is not enabled yet.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">Open public testnet →</Link>
      </section>

      <div className="metricsGrid five">
        <Metric label="HTTP requests" value="7,500" detail="7,500 successful" />
        <Metric label="Peak concurrency" value="500" detail="5,000-request stage" />
        <Metric label="Peak throughput" value="840.9/s" detail="Measured in release storm" />
        <Metric label="500-concurrent p95" value="935 ms" detail="Gate: 2,500 ms" />
        <Metric label="Real graduations" value="3/3" detail="While web load was active" />
      </div>

      <div className="twoColumn">
        <section className="panel">
          <span className="eyebrow">CONTRACT VERIFICATION</span>
          <div className="statRows">
            <div><span>Foundry suite</span><strong>39 / 39 passed</strong></div>
            <div><span>Fuzz runs</span><strong>1,000</strong></div>
            <div><span>Pre-storm graduation checks</span><strong>16 / 16 passed</strong></div>
            <div><span>Post-storm graduation checks</span><strong>16 / 16 passed</strong></div>
          </div>
        </section>

        <section className="panel">
          <span className="eyebrow">LOAD STAGES</span>
          <div className="statRows">
            <div><span>50 concurrent / 500 requests</span><strong>196 ms p95</strong></div>
            <div><span>200 concurrent / 2,000 requests</span><strong>391 ms p95</strong></div>
            <div><span>500 concurrent / 5,000 requests</span><strong>935 ms p95</strong></div>
            <div><span>Success floor</span><strong>100% observed</strong></div>
          </div>
        </section>
      </div>

      <p className="dataDisclaimer">
        Live volume, market cap, creator counts, rewards and revenue are intentionally
        not displayed until Fortune has an onchain indexer that can reproduce them
        from public events.
      </p>
    </main>
  );
}
