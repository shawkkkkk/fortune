import Link from "next/link";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

function short(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

export default function RegistryPage() {
  const explorer = PUBLIC_TESTNET.explorerUrl;

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">FORTUNE PUBLIC TESTNET REGISTRY</span>
          <h1>One approved beta quote asset.</h1>
          <p>
            The public beta does not expose the old mainnet asset catalog as if it
            were launchable on testnet. Only Fortune&apos;s valueless mock fUSD is
            enabled in the current beta path.
          </p>
        </div>
        <Link href="/testnet" className="primaryCta">Use fUSD on testnet →</Link>
      </section>

      <section className="registryPanel">
        <div className="registryNotice">
          <strong>TESTNET REGISTRY</strong>
          <span>Real-value BSC assets are not enabled for this public beta.</span>
        </div>

        <div className="registryTable">
          <div className="registryTableHead">
            <span>Asset</span><span>Network</span><span>Capabilities</span><span>Status</span>
          </div>
          <div className="registryRow">
            <div className="registryAsset">
              <span className="assetIconLarge">$</span>
              <span>
                <strong>fUSD</strong>
                <small>{short(PUBLIC_TESTNET.contracts.mockQuote)}</small>
              </span>
            </div>
            <span>BSC Testnet · chain 97</span>
            <div className="capabilityList">
              <em>quote</em><em>reward</em><em>graduation</em>
            </div>
            <a
              className="verificationBadge verificationVerified"
              href={explorer + "/address/" + PUBLIC_TESTNET.contracts.mockQuote}
              target="_blank"
              rel="noreferrer"
            >
              Live test contract ↗
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
