import Link from "next/link";

export default function PortfolioPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">PORTFOLIO</span>
          <h1>Indexer pending.</h1>
          <p>
            Fortune does not yet have a public portfolio indexer, so the beta does
            not pretend to know your holdings, rewards, or creator earnings.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">Open public testnet →</Link>
      </section>

      <section className="panel">
        <div className="emptyPanel">
          <strong>Your wallet remains the source of truth.</strong>
          <span>
            For now, use the public testnet page and BscScan links to inspect the
            test tokens and transactions you create. Portfolio aggregation will
            return when it is backed by real indexed chain data.
          </span>
        </div>
      </section>
    </main>
  );
}
