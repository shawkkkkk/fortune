"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main
          style={{
            maxWidth: 720,
            margin: "80px auto",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1>Fortune is temporarily degraded.</h1>
          <p>
            Your onchain assets are not held by this webpage. Retry the
            interface; do not blindly resubmit a transaction whose status is
            unknown.
          </p>
          <button onClick={reset}>Reload Fortune</button>
        </main>
      </body>
    </html>
  );
}
