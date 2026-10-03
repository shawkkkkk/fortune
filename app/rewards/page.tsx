import Link from "next/link";
import StockRewardsWallet from "@/components/StockRewardsWallet";

export default function RewardsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">HOLDER REWARDS</span>
          <h1>Holder rewards, paid in stocks.</h1>
          <p>
            Stock Rewards launches pay their holders in up to five tokenized
            stocks: the holder share of every trade, then the stock side of every
            PancakeSwap fee after graduation. Every number here is read from the
            token contracts, and holders claim onchain whenever they like.
          </p>
        </div>
        <img className="mascotSectionArt" src="/fortune-cat-rewards-400.webp" width="215" height="215" alt="Fortune cat offering pair-asset coins" />
        <Link href="/docs#stock-rewards" className="secondaryCta">How Stock Rewards work →</Link>
      </section>

      <StockRewardsWallet />

      <section className="registryNotice" style={{ marginTop: 18 }}>
        <strong>STANDARD · BURN + REWARDS V2 · RESEARCH</strong>
        <span>
          The Standard mainnet candidate keeps holder reward routes disabled, and
          Burn + Rewards v2 for single-pair launches is still research. Rewards are
          never displayed as live unless Fortune can tie them to chain-backed
          evidence.
        </span>
      </section>

      <div className="automationGrid" style={{ marginTop: 18 }}>
        <article className="automationCard">
          <h2>Pair-asset accounting</h2>
          <p>Fortune is designed around quote/pair assets, so holder rewards are denominated in assets users can independently verify on BNB Chain.</p>
        </article>
        <article className="automationCard">
          <h2>Streamed, not snapshotted</h2>
          <p>Stock Rewards stream new payments over six hours, pro rata to balance at every moment, so a wallet that buys just before a payment and sells right after earns almost nothing.</p>
        </article>
        <article className="automationCard">
          <h2>BNB-native expansion</h2>
          <p>Reward assets follow the same registry discipline as launch pairs: each stock is listed with a price source before a launch can pay in it.</p>
        </article>
      </div>
    </main>
  );
}
