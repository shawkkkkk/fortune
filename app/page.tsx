import Link from "next/link";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";
import FortuneLogo from "@/components/FortuneLogo";

function short(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

export default function ExplorePage() {
  const explorer = PUBLIC_TESTNET.explorerUrl;

  return (
    <main className="page">
      <section className="heroSection">
        <div>
          <div className="heroBrandLockup">
            <FortuneLogo size="lg" />
          </div>
          <div className="eyebrow">FORTUNE PUBLIC BSC TESTNET BETA</div>
          <h1>Launch against anything. Test it for real.</h1>
          <p>
            Fortune is now running an onchain public beta on BNB Smart Chain
            Testnet. Create a real Fortune test token, trade its curve with
            valueless mock fUSD, and graduate it into a real Pancake V3
            testnet pool.
          </p>
          <div className="heroActions">
            <Link href="/testnet" className="primaryCta">
              Open public testnet →
            </Link>
            <Link href="/developers" className="secondaryCta">
              Developer API
            </Link>
          </div>
          <p className="dataDisclaimer">
            Public beta only. The contracts are pre-audit and mainnet remains
            disabled. Do not use real funds.
          </p>
        </div>

        <div className="heroManifest">
          <div className="manifestLabel">RELEASE GATE · PASSED</div>
          <div className="bigBasket">
            <span>39/39 tests</span>
            <span>1,000 fuzz runs</span>
            <span>7,500/7,500 requests</span>
            <span>3 real graduations</span>
          </div>
          <div className="manifestRule" />
          <div className="manifestRows">
            <div><span>Peak measured throughput</span><strong>840.9 req/s</strong></div>
            <div><span>500-concurrent p95</span><strong>935 ms</strong></div>
            <div><span>Release p95 limit</span><strong>2,500 ms</strong></div>
            <div><span>Post-storm invariants</span><strong>16/16 passed</strong></div>
          </div>
        </div>
      </section>

      <section className="contentSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">WHAT IS LIVE</span>
            <h2>One narrow, real beta path.</h2>
          </div>
        </div>

        <div className="automationGrid">
          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">01</span><span className="automationStatus statusHealthy">LIVE</span></div>
            <h2>Create</h2>
            <p>Create an actual Fortune token through the deployed BSC Testnet factory. Every Fortune token is CREATE2-deployed with the required 0xfe suffix.</p>
            <strong>Wallet-signed</strong>
          </article>

          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">02</span><span className="automationStatus statusHealthy">LIVE</span></div>
            <h2>Trade</h2>
            <p>Mint valueless mock fUSD, approve the new curve, and make an onchain test purchase against Fortune&apos;s canonical curve.</p>
            <strong>Real testnet txs</strong>
          </article>

          <article className="automationCard">
            <div className="automationTop"><span className="automationIcon">03</span><span className="automationStatus statusHealthy">LIVE</span></div>
            <h2>Graduate</h2>
            <p>Permissionlessly finalize the launch into Pancake V3 testnet and permanently custody the resulting LP-position NFT in the Fortune locker.</p>
            <strong>Pancake V3</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">PUBLIC BETA DEPLOYMENT</span>
            <h2>Verify the contracts yourself.</h2>
          </div>
          <a
            href={explorer + "/address/" + PUBLIC_TESTNET.contracts.factory}
            className="secondaryCta"
            target="_blank"
            rel="noreferrer"
          >
            Factory on BscScan ↗
          </a>
        </div>

        <div className="manifestTable">
          {[
            ["Fortune Factory", PUBLIC_TESTNET.contracts.factory],
            ["Asset Registry", PUBLIC_TESTNET.contracts.registry],
            ["Graduation adapter", PUBLIC_TESTNET.contracts.graduationAdapter],
            ["Permanent LP locker", PUBLIC_TESTNET.contracts.liquidityLocker],
            ["Mock fUSD", PUBLIC_TESTNET.contracts.mockQuote],
            ["Reference Pancake pool", PUBLIC_TESTNET.contracts.referencePool],
          ].map(([label, address]) => (
            <div key={label}>
              <span>{label}</span>
              <a href={explorer + "/address/" + address} target="_blank" rel="noreferrer">
                <strong>{short(address)} ↗</strong>
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="registryStrip">
        <div>
          <span className="eyebrow">BETA SCOPE</span>
          <h2>No fake markets or fake volume.</h2>
        </div>
        <div className="registryCategories">
          <span>Real testnet contracts</span>
          <span>Real wallet signatures</span>
          <span>Real Pancake V3 testnet</span>
          <span>Valueless test assets</span>
          <span>Indexer/social features coming later</span>
        </div>
      </section>
    </main>
  );
}
