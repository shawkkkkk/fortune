import Link from "next/link";

const rows = [
  ["Permanent LP custody", "Live", "Graduation LP-position NFTs are transferred to the deployed Fortune permanent locker."],
  ["Permissionless graduation", "Live", "Any keeper may call the factory finalizer; adapter selection remains protocol-governed."],
  ["Retryable failure path", "Live", "Failed graduation attempts preserve funds and may be retried after preflight issues are corrected."],
  ["Seven-day reserve rescue", "Live", "Curves have a delayed holder recovery path if graduation remains impossible."],
  ["Public automation activity index", "Pending", "No public indexer is live yet, so Fortune does not publish invented automation totals."],
];

export default function AutomationsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">PROTOCOL OPERATIONS</span>
          <h1>Automation state</h1>
          <p>Only behavior that exists in deployed contracts is shown here.</p>
        </div>
        <Link href="/testnet" className="primaryCta">Open public testnet →</Link>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div><span className="eyebrow">PUBLIC ALPHA</span><h2>What actually runs today</h2></div>
          <span>No fake dollar totals</span>
        </div>
        <div className="manifestTable">
          {rows.map(([name, status, detail]) => (
            <div key={name}>
              <span>{name}<br /><small>{detail}</small></span>
              <strong>{status}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
