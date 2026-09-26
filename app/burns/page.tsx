import Link from "next/link";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

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
        <img className="mascotSectionArt" src="/fortune-cat-burns-400.webp" width="215" height="215" alt="Fortune cat showing a token burn" />
        <Link href="/docs#burns" className="secondaryCta">How burns work →</Link>
      </section>

      <section className="registryNotice">
        <strong>BURN + REWARDS V2 · RESEARCH</strong>
        <span>
          The legacy tax-token stack is available only as testnet research. Burn + Rewards v2 has no audited deployment or live burn ledger.
        </span>
      </section>

      <div className="automationGrid" style={{ marginTop: 18 }}>
        <article className="automationCard">
          <h2>Token-side burn</h2>
          <p>The v2 design sends launch-token fees only to an irreversible burn path. This is a target invariant, not a live mainnet feature.</p>
        </article>
        <article className="automationCard">
          <h2>No forced token sale</h2>
          <p>Holder payouts must come from the pair asset, without selling the launch token to obtain rewards.</p>
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
