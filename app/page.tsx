import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

function short(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

export default function ExplorePage() {
  const explorer = FORTUNE_NETWORK.explorerUrl;
  const mainnet = FORTUNE_NETWORK.isMainnet;

  const contracts = mainnet
    ? [
        ["Standard FortuneFactory", FORTUNE_NETWORK.contracts.factory],
        ["Tax FortuneFactory", FORTUNE_NETWORK.contracts.taxFactory],
        ["Asset Registry", FORTUNE_NETWORK.contracts.registry],
        ["Pool Registry", FORTUNE_NETWORK.contracts.poolRegistry],
        [
          "V3 graduation adapter",
          FORTUNE_NETWORK.contracts.graduationAdapter,
        ],
        [
          "V3 permanent LP locker",
          FORTUNE_NETWORK.contracts.liquidityLocker,
        ],
        [
          "Tax V2 graduation adapter",
          FORTUNE_NETWORK.contracts.taxGraduationAdapter,
        ],
        [
          "Tax V2 permanent LP locker",
          FORTUNE_NETWORK.contracts.taxLiquidityLocker,
        ],
        [
          "Primary quote",
          FORTUNE_NETWORK.primaryQuote.address,
        ],
      ].filter((row) => Boolean(row[1]))
    : [
        ["Fortune Factory", PUBLIC_TESTNET.contracts.factory],
        ["Asset Registry", PUBLIC_TESTNET.contracts.registry],
        [
          "Graduation adapter",
          PUBLIC_TESTNET.contracts.graduationAdapter,
        ],
        [
          "Permanent LP locker",
          PUBLIC_TESTNET.contracts.liquidityLocker,
        ],
        ["Tax FortuneFactory", PUBLIC_TESTNET.contracts.taxFactory],
        ["Pool Registry", PUBLIC_TESTNET.contracts.poolRegistry],
        ["Tax V2 adapter", PUBLIC_TESTNET.contracts.taxGraduationAdapter],
        ["Tax V2 LP locker", PUBLIC_TESTNET.contracts.taxLiquidityLocker],
        ["Mock fUSD", PUBLIC_TESTNET.contracts.mockQuote],
        ["Reference V3 pool", PUBLIC_TESTNET.contracts.referencePool],
        ["Reference tax V2 pair", PUBLIC_TESTNET.contracts.referenceTaxPool],
      ];

  return (
    <main className="page">
      <section className="heroSection">
        <div>
          <div className="heroBrandLockup">
            <FortuneLogo size="lg" />
          </div>

          <div className="eyebrow">
            {mainnet
              ? "FORTUNE · BNB SMART CHAIN"
              : "FORTUNE PUBLIC BSC TESTNET ALPHA"}
          </div>

          <h1>
            {mainnet
              ? "Launch tokens with transparent onchain mechanics."
              : "Launch against anything. Test it for real."}
          </h1>

          <p>
            {mainnet
              ? "Fortune is a non-custodial BNB Chain launch framework with deterministic fixed-supply tokens, onchain curve trading, transparent fee routing, Launch Shield protection, and atomic Pancake V3 graduation."
              : "Fortune is running an onchain public alpha on BNB Smart Chain Testnet. Launch a standard or tax-token test market, trade its curve with valueless mock fUSD, then graduate standard launches into Pancake V3 or tax launches into Pancake V2 with permanently locked liquidity."}
          </p>

          <div className="heroActions">
            <Link
              href={mainnet ? "/launch" : "/testnet"}
              className="primaryCta"
            >
              {mainnet
                ? "Launch on BNB Chain →"
                : "Open public testnet →"}
            </Link>
            <Link href="/markets" className="secondaryCta">
              Live markets
            </Link>
            <Link href="/developers" className="secondaryCta">
              Developer API
            </Link>
          </div>

          <p className="dataDisclaimer">
            {mainnet
              ? "Real-value network. Fortune is non-custodial; always review token economics, contract addresses, and wallet prompts before signing."
              : "Public alpha only. Test assets have no intended financial value. Mainnet remains separately gated by security and production-release checks."}
          </p>
        </div>

        <div className="heroManifest">
          <div className="manifestLabel">
            {mainnet ? "PROTOCOL GUARANTEES" : "ALPHA RELEASE GATE · PASSED"}
          </div>

          <div className="bigBasket">
            {mainnet ? (
              <>
                <span>Fixed supply</span>
                <span>Wallet-signed</span>
                <span>Atomic graduation</span>
                <span>Permanent LP lock</span>
              </>
            ) : (
              <>
                <span>39/39 tests</span>
                <span>1,000 fuzz runs</span>
                <span>7,500/7,500 requests</span>
                <span>Standard + tax verified</span>
              </>
            )}
          </div>

          <div className="manifestRule" />

          <div className="manifestRows">
            {mainnet ? (
              <>
                <div>
                  <span>Network</span>
                  <strong>BNB Smart Chain</strong>
                </div>
                <div>
                  <span>Custody</span>
                  <strong>Non-custodial</strong>
                </div>
                <div>
                  <span>Token supply</span>
                  <strong>Immutable</strong>
                </div>
                <div>
                  <span>Deployment</span>
                  <strong>
                    {FORTUNE_NETWORK_CONFIGURED
                      ? "Configured"
                      : "Incomplete"}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>Peak measured throughput</span>
                  <strong>840.9 req/s</strong>
                </div>
                <div>
                  <span>500-concurrent p95</span>
                  <strong>935 ms</strong>
                </div>
                <div>
                  <span>Release p95 limit</span>
                  <strong>2,500 ms</strong>
                </div>
                <div>
                  <span>Post-storm invariants</span>
                  <strong>16/16 passed</strong>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="contentSection">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow">WHAT IS LIVE</span>
            <h2>
              {mainnet
                ? "The full launch lifecycle is onchain."
                : "A narrow, real alpha path."}
            </h2>
          </div>
        </div>

        <div className="automationGrid">
          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">01</span>
              <span className="automationStatus statusHealthy">LIVE</span>
            </div>
            <h2>Create</h2>
            <p>
              {mainnet
                ? "Create a fixed-supply Fortune token through the production factory after an onchain launch preflight."
                : "Create an actual standard or tax-token Fortune launch through the deployed BSC Testnet factories. Every Fortune token is CREATE2-deployed with the required 0xfe suffix."}
            </p>
            <strong>Wallet-signed</strong>
          </article>

          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">02</span>
              <span className="automationStatus statusHealthy">LIVE</span>
            </div>
            <h2>Trade</h2>
            <p>
              {mainnet
                ? "Buy and sell through the canonical Fortune curve using registry-approved quote assets and live oracle checks."
                : "Mint valueless mock fUSD and trade the canonical curve. Tax-token launches also exercise configured curve tax accounting before their post-graduation DEX tax path."}
            </p>
            <strong>{mainnet ? "Real BNB Chain txs" : "Real testnet txs"}</strong>
          </article>

          <article className="automationCard">
            <div className="automationTop">
              <span className="automationIcon">03</span>
              <span className="automationStatus statusHealthy">LIVE</span>
            </div>
            <h2>Graduate</h2>
            <p>
              {mainnet
                ? "Permissionlessly finalize eligible launches into Pancake V3 and permanently lock the resulting LP-position NFT."
                : "Permissionlessly finalize standard launches into Pancake V3 or tax-token launches into Pancake V2. Fortune permanently locks the resulting V3 position NFT or V2 LP tokens."}
            </p>
            <strong>{mainnet ? "Pancake V3" : "Pancake V3 + V2"}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">
              {mainnet ? "PRODUCTION DEPLOYMENT" : "PUBLIC ALPHA DEPLOYMENT"}
            </span>
            <h2>Verify the contracts yourself.</h2>
          </div>

          {FORTUNE_NETWORK.contracts.factory ? (
            <a
              href={
                explorer +
                "/address/" +
                FORTUNE_NETWORK.contracts.factory
              }
              className="secondaryCta"
              target="_blank"
              rel="noreferrer"
            >
              Factory on BscScan ↗
            </a>
          ) : null}
        </div>

        <div className="manifestTable">
          {contracts.map(([label, address]) => (
            <div key={label}>
              <span>{label}</span>
              <a
                href={explorer + "/address/" + address}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{short(address)} ↗</strong>
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="registryStrip">
        <div>
          <span className="eyebrow">
            {mainnet ? "FORTUNE PRINCIPLES" : "ALPHA SCOPE"}
          </span>
          <h2>No fake markets or fake volume.</h2>
        </div>

        <div className="registryCategories">
          <span>Real onchain contracts</span>
          <span>Real wallet signatures</span>
          <span>Live market reads</span>
          <span>Pancake V3 graduation</span>
          <span>Transparent readiness</span>
        </div>
      </section>
    </main>
  );
}
