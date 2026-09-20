import Metric from "@/components/Metric";

export default function PortfolioPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div><span className="eyebrow">YOUR FORTUNE</span><h1>Portfolio</h1><p>Holdings, launches, rewards and creator revenue in one place.</p></div>
        <button className="walletButton">Connect wallet</button>
      </section>

      <div className="metricsGrid four">
        <Metric label="Portfolio value" value="$—" detail="Connect a wallet" />
        <Metric label="Claimable rewards" value="$—" detail="Across reward vaults" />
        <Metric label="Creator earnings" value="$—" detail="Curve + graduated markets" />
        <Metric label="Referral earnings" value="$—" detail="Fortune referrals" />
      </div>

      <div className="twoColumn">
        <section className="panel">
          <span className="eyebrow">HOLDINGS</span>
          <div className="emptyPanel">
            <strong>No wallet connected</strong>
            <span>Your Fortune tokens and reward balances will appear here.</span>
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">YOUR LAUNCHES</span>
          <div className="emptyPanel">
            <strong>Build your first market</strong>
            <span>Creator fees, graduation state and automations will appear here.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
