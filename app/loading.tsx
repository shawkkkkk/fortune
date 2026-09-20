export default function Loading() {
  return (
    <main className="page">
      <section className="panel">
        <span className="eyebrow">FORTUNE</span>
        <h2>Loading market data…</h2>
        <p className="dataDisclaimer">
          Core pages render independently from optional market-data providers.
        </p>
      </section>
    </main>
  );
}
