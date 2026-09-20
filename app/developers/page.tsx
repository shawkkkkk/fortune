import Link from "next/link";

const endpoints = [
  ["GET", "/api/public/v1/meta", "Capabilities, guarantees and docs"],
  ["GET", "/api/public/v1/protocol", "Canonical chain + protocol configuration"],
  ["GET", "/api/public/v1/assets", "Registry catalog with capability state"],
  ["POST", "/api/public/v1/assets/check", "Inspect a custom BSC token before approval"],
  ["GET", "/api/public/v1/pairs?launchable=true", "Only statically launchable quote assets"],
  ["GET", "/api/public/v1/stocks", "BSC tokenized-stock provider universe"],
  ["POST", "/api/public/v1/launches/preview", "Validate a launch before any transaction is built"],
  ["GET", "/api/public/v1/tokens", "Token markets"],
  ["GET", "/api/public/v1/launches", "Launch ledger + health state"],
  ["GET", "/api/public/v1/transactions/{hash}", "Recover pending/confirmed/reverted state before retrying"],
  ["GET", "/api/public/v1/stats", "Protocol analytics"],
  ["GET", "/api/public/v1/automations", "Automation health"],
  ["GET", "/api/public/v1/revenue", "Revenue and fee-routing aggregates"],
] as const;

const quickstart =
  "curl http://localhost:3000/api/public/v1/pairs?launchable=true\n\n" +
  "curl http://localhost:3000/api/public/v1/tokens?sort=volume\n\n" +
  "curl http://localhost:3000/api/public/v1/protocol";

const previewExample =
  "POST /api/public/v1/launches/preview\n\n" +
  JSON.stringify(
    {
      name: "Banana",
      symbol: "BANANA",
      quoteAssets: [
        { id: "bnb", weightBps: 6000 },
        { id: "usdt", weightBps: 4000 },
      ],
      primaryQuote: "bnb",
      feeBps: {
        creator: 25,
        holders: 25,
        buyback: 25,
        liquidity: 15,
        protocol: 10,
      },
    },
    null,
    2
  );

export default function DevelopersPage() {
  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE PUBLIC API · V1</span>
          <h1>Build on Fortune.</h1>
          <p>
            Public reads need no API key. Launch configuration is validated
            before signing, and private keys never touch Fortune servers.
          </p>
        </div>
        <Link href="/api/public/v1/openapi" className="secondaryCta">
          OpenAPI JSON
        </Link>
      </section>

      <section className="automationHero">
        <div>
          <span className="eyebrow">NON-CUSTODIAL BY DEFAULT</span>
          <h2>Reads are open. Wallets authorize writes.</h2>
          <p>
            Fortune&apos;s API is designed so an outage in social or analytics
            infrastructure does not become custody risk. Chain state remains
            authoritative, and uncertain transactions must be checked before
            they are ever retried.
          </p>
        </div>
        <div className="automationFlow">
          <span>Preview</span><b>→</b>
          <span>Preflight</span><b>→</b>
          <span>Wallet signs</span><b>→</b>
          <span>Chain confirms</span>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">ENDPOINTS</span>
            <h2>/api/public/v1</h2>
          </div>
          <span>Cursor pagination · stable errors · CDN-friendly reads</span>
        </div>

        <div className="apiEndpointTable">
          {endpoints.map(([method, path, detail]) => (
            <div className="apiEndpointRow" key={path}>
              <strong className={"apiMethod api" + method}>{method}</strong>
              <code>{path}</code>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="twoColumn contentSection">
        <div className="panel">
          <span className="eyebrow">QUICKSTART</span>
          <h2>No key. No signup.</h2>
          <pre className="apiCode">{quickstart}</pre>
        </div>

        <div className="panel">
          <span className="eyebrow">LAUNCH SAFETY</span>
          <h2>Preview before prepare.</h2>
          <p className="dataDisclaimer">
            A pair appearing in discovery does not imply that its oracle,
            transfer behavior and graduation path are healthy at this exact
            block. Static capability state stays separate from runtime
            preflight.
          </p>
          <pre className="apiCode">{previewExample}</pre>
        </div>
      </section>

      <section className="panel">
        <span className="eyebrow">WHY FORTUNE&apos;S API IS STRICT</span>
        <h2>A pool existing is not enough.</h2>
        <div className="apiPrinciples">
          <div><strong>Exact capability state</strong><span>Quote, reward and graduation permissions are separate.</span></div>
          <div><strong>Runtime preflight</strong><span>Oracle freshness and destination-pool readiness are checked again before funds move.</span></div>
          <div><strong>Explicit health</strong><span>Curve active, graduation ready, preflight failed, indexing, and trading live are different states.</span></div>
          <div><strong>Chart continuity</strong><span>The graduation anchor joins the curve and AMM phases instead of hiding a bad transition.</span></div>
          <div><strong>Degraded mode</strong><span>Cached reads survive upstream API outages where possible.</span></div>
          <div><strong>No blind retries</strong><span>Unknown transaction status is resolved onchain before another transaction is sent.</span></div>
        </div>
      </section>
    </main>
  );
}
