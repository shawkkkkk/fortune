"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page narrowPage">
      <section className="panel emptyPanel statePanel">
        <img className="mascotEmpty" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat" width="124" height="124" loading="lazy" />
        <span className="eyebrow">DEGRADED MODE</span>
        <h2>This part of Fortune hit an error.</h2>
        <p>
          The rest of the app can remain available. Retry this view without
          reconnecting your wallet or resubmitting a transaction.
        </p>
        <div className="heroActions">
          <button className="primaryCta" onClick={reset}>
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
