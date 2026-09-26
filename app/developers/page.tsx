import Link from "next/link";
import { FORTUNE_SITE_URL } from "@/lib/site";

const endpoints = [
  ["GET", "/api/ready", "Live BSC Testnet service readiness"],
  ["GET", "/api/public/v1/readiness", "Full protocol + Pancake infrastructure readiness"],
  ["GET", "/api/public/v1/protocol", "Published public-alpha protocol configuration"],
  ["GET", "/api/public/v1/stats", "Measured release-validation results"],
  ["GET", "/api/public/v1/launches", "Launches recorded by the Fortune factories, newest first"],
  ["GET", "/api/public/v1/markets", "Prices, market caps and trade activity; ?tokens= for a watchlist"],
  ["GET", "/api/public/v1/markets/{token}", "One market: chart, pair reserves, supply split and recent trades"],
  ["GET", "/api/public/v1/portfolio/{address}", "Every Fortune token a wallet holds, valued at live prices"],
  ["GET", "/api/public/v1/creators/{address}", "A creator's launches, graduation record and current holdings"],
  ["GET", "/api/public/v1/universe", "BNB Chain stocks, RWA, pre-IPO and crypto pair assets with eligibility"],
  ["POST", "/api/public/v1/launches/preview", "Validate a launch configuration"],
  ["GET", "/api/public/v1/transactions/{hash}", "Resolve transaction status before retrying"],
] as const;

const quickstart =
  "curl " + FORTUNE_SITE_URL + "/api/ready\n\n" +
  "curl " + FORTUNE_SITE_URL + "/api/public/v1/readiness\n\n" +
  "curl " + FORTUNE_SITE_URL + "/api/public/v1/protocol";

export default function DevelopersPage() {
  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE PUBLIC API · ALPHA</span>
          <h1>Real data or no data.</h1>
          <p>
            Readiness and protocol configuration come from the deployed BSC
            Testnet stack. Market endpoints read BNB Chain directly and state
            the block and log coverage behind every number.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">
          Open public testnet →
        </Link>
      </section>

      <section className="automationHero">
        <div>
          <span className="eyebrow">NON-CUSTODIAL</span>
          <h2>Wallets authorize writes.</h2>
          <p>
            The dedicated testnet UI signs transactions in the user&apos;s
            wallet. Private keys never touch Fortune servers.
          </p>
        </div>
        <div className="automationFlow">
          <span>Preview</span><b>→</b>
          <span>Wallet signs</span><b>→</b>
          <span>Chain confirms</span>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">HONEST ALPHA ENDPOINTS</span>
            <h2>Public API</h2>
          </div>
          <Link href="/api/public/v1/openapi" className="secondaryCta">
            OpenAPI JSON
          </Link>
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
          <h2>Check the live deployment.</h2>
          <pre className="apiCode">{quickstart}</pre>
        </div>

        <div className="panel">
          <span className="eyebrow">INDEXER BOUNDARY</span>
          <h2>No fake market feed.</h2>
          <p className="dataDisclaimer">
            Prices, charts, volume, supply and holdings are read from the
            factory, the curves, the official pools and a bounded event log,
            each at a stated block. When the log window cannot cover a range,
            the response says so instead of filling the gap. Revenue history
            and social activity wait for a durable indexer.
          </p>
        </div>
      </section>
    </main>
  );
}
