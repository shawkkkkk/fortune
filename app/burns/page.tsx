import Link from "next/link";
import {
  FORTUNE_NETWORK,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

export default function BurnsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">BURNS · ONCHAIN PROOF</span>
          <h1>Burns should be verifiable, not a marketing promise.</h1>
          <p>
            Fortune&apos;s Burn + Rewards architecture is designed around explicit
            burn routes and public transaction evidence. Mainnet exposure stays
            disabled until that separate stack passes its own review gates.
          </p>
        </div>
        <Link href="/docs#burns" className="secondaryCta">How burns work →</Link>
      </section>

      <section className="registryNotice">
        <strong>{FORTUNE_TAX_NETWORK_CONFIGURED ? "BURN STACK ENABLED" : "BURN STACK GATED"}</strong>
        <span>
          {FORTUNE_TAX_NETWORK_CONFIGURED
            ? "This network has the Fortune tax-token contracts configured."
            : "The current reviewed BNB mainnet candidate does not enable Burn + Rewards. Testnet evidence remains separate from real funds."}
        </span>
      </section>

      <div className="automationGrid" style={{ marginTop: 18 }}>
        <article className="automationCard">
          <h2>Direct burn</h2>
          <p>An immutable launch allocation can route a defined share of tax-token mechanics into token destruction rather than an operator sell wallet.</p>
        </article>
        <article className="automationCard">
          <h2>Buyback + burn</h2>
          <p>Fortune&apos;s extended tax stack supports a separate buyback-and-burn allocation. Production activation requires independent review of that path.</p>
        </article>
        <article className="automationCard">
          <h2>Public ledger</h2>
          <p>Fortune will not invent burn totals. This page becomes an indexed BscScan-verifiable ledger once the reviewed production burn stack is active.</p>
        </article>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <span className="eyebrow">CURRENT LEDGER</span>
        <div className="emptyPanel">
          <strong>No production burn aggregate is published yet.</strong>
          <p>That stays blank until Fortune can reproduce the total from public BNB Chain events.</p>
        </div>
        <div className="heroActions">
          <Link href="/stats" className="secondaryCta">Protocol stats</Link>
          <a className="secondaryCta" href={FORTUNE_NETWORK.explorerUrl} target="_blank" rel="noreferrer">BscScan ↗</a>
        </div>
      </section>
    </main>
  );
}
