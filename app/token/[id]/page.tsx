import Link from "next/link";
import { launches } from "@/data/mock";

export default async function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const launch = launches.find((item) => item.id === id) || launches[0];

  return (
    <main className="page">
      <section className="tokenHero">
        <div className="tokenIdentity">
          <div className="tokenAvatar tokenAvatarLarge">{launch.symbol.slice(0,2)}</div>
          <div><span className="eyebrow">{launch.status.toUpperCase()}</span><h1>{launch.name}</h1><p>{"$" + launch.symbol} · by {launch.creator}</p></div>
        </div>
        <div className="tokenHeroActions"><button className="secondaryCta">Watch</button><button className="primaryCta">Buy {"$" + launch.symbol}</button></div>
      </section>

      <div className="tokenGrid">
        <section className="panel chartPanel">
          <div className="panelTitle"><div><span className="eyebrow">CANONICAL FORTUNE PRICE</span><h2>$0.004281</h2></div><strong>+18.4%</strong></div>
          <div className="fakeChart"><svg viewBox="0 0 800 260" preserveAspectRatio="none"><path d="M0 230 C70 210,110 230,165 190 S250 160,300 175 S370 205,430 140 S520 120,570 98 S650 135,800 34" fill="none" stroke="currentColor" strokeWidth="4" /></svg></div>
          <div className="chartTabs"><button className="tabActive">Price</button><button>Volume</button><button>Market cap</button><button>Basket reserves</button></div>
        </section>

        <aside className="panel tradePanel">
          <span className="eyebrow">TRADE ON CURVE</span><h2>Buy {"$" + launch.symbol}</h2>
          <div className="shieldTradeNotice">
            <strong>🛡 Fortune Launch Shield</strong>
            <span>New launches begin with a 99% buy tax that rapidly decays to 0 after 5 seconds. The live transaction quote must display the current shield tax before signing.</span>
          </div>
          <label>Pay with<select>{launch.quoteAssets.map((a)=><option key={a}>{a}</option>)}</select></label>
          <label>Amount<input placeholder="0.00" /></label>
          <div className="quoteBox"><span>Estimated tokens</span><strong>—</strong></div>
          <button className="launchButton">Connect wallet</button>
          <small>All accepted quote assets move the same canonical Fortune curve.</small>
        </aside>
      </div>

      <div className="tokenInfoGrid">
        <section className="panel">
          <span className="eyebrow">FORTUNE BASKET</span>
          <h2>{launch.quoteAssets.length} quote markets</h2>
          <div className="poolRows">{launch.quoteAssets.map((asset,i)=><div key={asset}><strong>{asset}</strong><span>{i===0?"Primary market":"Basket market"}</span><b>{Math.floor(100/launch.quoteAssets.length)}%</b></div>)}</div>
        </section>
        <section className="panel">
          <div className="panelTitle">
            <div><span className="eyebrow">LAUNCH MANIFEST</span><h2>Token controls</h2></div>
            <Link href="/metadata" className="secondaryCta">Manage metadata</Link>
          </div>
          <div className="statRows">
            <div><span>Creator fee</span><strong>{(launch.creatorFeeBps/100).toFixed(2)}%</strong></div>
            <div><span>Holder reward</span><strong>{launch.rewardAsset || "None"}</strong></div>
            <div><span>Post-launch mint</span><strong>Disabled</strong></div>
            <div><span>Economic manifest</span><strong>Immutable</strong></div>
            <div><span>Display metadata</span><strong>Editable · rev. 1</strong></div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panelTitle"><div><span className="eyebrow">COMMUNITY</span><h2>Token forum</h2></div><Link href="/forum" className="secondaryCta">Open Fortune Forum</Link></div>
        <div className="emptyPanel"><strong>Discussion belongs next to the market.</strong><span>Posts, creator updates and attached trades will render here from the Fortune Forum service.</span></div>
      </section>
    </main>
  );
}
