"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page narrowPage">
      <section className="panel">
        <span className="eyebrow">DEGRADED MODE</span>
        <h2>This part of Fortune hit an error.</h2>
        <p>
          The rest of the app can remain available. Retry this view without
          reconnecting your wallet or resubmitting a transaction.
        </p>
        <button className="primaryCta" onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
