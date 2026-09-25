import Link from "next/link";

export default function RewardsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">HOLDER REWARDS</span>
          <h1>Rewards should come from transparent routing, with a public ledger.</h1>
          <p>
            Burn + Rewards v2 targets direct, onchain claims in the pair asset.
            The current Standard mainnet candidate keeps holder reward routes
            disabled, and the older tax-token vault remains testnet research.
          </p>
        </div>
        <img className="mascotSectionArt" src="/fortune-cat-rewards.webp" width="215" height="215" alt="Fortune cat offering pair-asset coins" />
        <Link href="/docs#rewards" className="secondaryCta">Reward design →</Link>
      </section>

      <section className="registryNotice">
        <strong>BURN + REWARDS V2 · RESEARCH</strong>
        <span>
          Rewards are never displayed as live unless Fortune can tie them to
          chain-backed vault/epoch/distribution evidence.
        </span>
      </section>

      <div className="automationGrid" style={{ marginTop: 18 }}>
        <article className="automationCard">
          <h2>Pair-asset accounting</h2>
          <p>Fortune is designed around quote/pair assets, so future holder rewards can be denominated in assets users can independently verify on BNB Chain.</p>
        </article>
        <article className="automationCard">
          <h2>Epoch evidence</h2>
          <p>Reward epochs should publish the source pot, accounting window and resulting transactions instead of relying on a dashboard-only number.</p>
        </article>
        <article className="automationCard">
          <h2>BNB-native expansion</h2>
          <p>After review, reward assets can follow the same registry discipline as launch pairs: BNB, stables and other compatible BEP-20 assets.</p>
        </article>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <span className="eyebrow">DISTRIBUTION LEDGER</span>
        <div className="emptyPanel">
          <strong>No production holder-reward aggregate is published yet.</strong>
          <p>Fortune intentionally avoids placeholder APY, payout or rewards figures.</p>
        </div>
      </section>
    </main>
  );
}
