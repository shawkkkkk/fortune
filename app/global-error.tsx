"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, background: "#fffaf4", color: "#221515" }}>
        <main
          style={{
            maxWidth: 720,
            margin: "80px auto",
            padding: 32,
            fontFamily: "system-ui, sans-serif",
            background: "#ffffff",
            border: "1px solid #ecd3a1",
            borderTop: "4px solid #d8141d",
            borderRadius: 22,
          }}
        >
          <h1 style={{ marginTop: 0 }}>Fortune is temporarily degraded.</h1>
          <p style={{ color: "#4d3b3a", lineHeight: 1.6 }}>
            Your onchain assets are not held by this webpage. Retry the
            interface; do not blindly resubmit a transaction whose status is
            unknown.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "12px 22px",
              border: "1px solid #a50b12",
              borderRadius: 999,
              background: "#d8141d",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload Fortune
          </button>
        </main>
      </body>
    </html>
  );
}
