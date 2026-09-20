import Link from "next/link";

const endpoints = [
  ["GET", "/api/ready", "Live BSC Testnet service readiness"],
  ["GET", "/api/public/v1/readiness", "Full protocol + Pancake infrastructure readiness"],
  ["GET", "/api/public/v1/protocol", "Published public-alpha protocol configuration"],
  ["GET", "/api/public/v1/stats", "Measured release-validation results"],
  ["POST", "/api/public/v1/launches/preview", "Validate a launch configuration"],
  ["GET", "/api/public/v1/transactions/{hash}", "Resolve transaction status before retrying"],
  ["GET", "/api/public/v1/tokens", "Empty until the public onchain indexer is enabled"],
  ["GET", "/api/public/v1/launches", "Empty until the public onchain indexer is enabled"],
] as const;

const quickstart =
  "curl https://fortune-rho-snowy.vercel.app/api/ready\n\n" +
  "curl https://fortune-rho-snowy.vercel.app/api/public/v1/readiness\n\n" +
  "curl https://fortune-rho-snowy.vercel.app/api/public/v1/protocol";

export default function DevelopersPage() {
  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE PUBLIC API · ALPHA</span>
          <h1>Real data or no data.</h1>
          <p>
            Readiness and protocol configuration come from the deployed BSC
            Testnet stack. Indexed market endpoints deliberately return no
            synthetic activity until the event indexer is live.
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
            Token discovery, charts, volume, revenue, portfolio aggregation and
            social activity remain unavailable until they are reproducible from
            public onchain events. This is intentional.
          </p>
        </div>
      </section>
    </main>
  );
}
