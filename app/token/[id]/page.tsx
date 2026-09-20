import Link from "next/link";

export default async function TokenPage() {
  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">TOKEN MARKET PAGE</span>
          <h1>Onchain indexer pending.</h1>
          <p>
            The old token page used demo market data and has been removed from the
            public alpha. Tokens created through the alpha are real BSC Testnet
            contracts and are linked directly to BscScan from the testnet flow.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">Create a real test launch →</Link>
      </section>

      <section className="panel">
        <div className="emptyPanel">
          <strong>No synthetic chart or market-cap data.</strong>
          <span>
            Token pages will return once curve events, graduation events and
            Pancake V3 swaps are indexed into a reproducible canonical chart.
          </span>
        </div>
      </section>
    </main>
  );
}
