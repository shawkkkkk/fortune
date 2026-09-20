import Metric from "@/components/Metric";
import { analytics } from "@/data/mock";

const money = (n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(n);

export default function AnalyticsPage() {
  const quoteMix = [["BNB",37],["USDT",25],["BTCB",12],["CAKE",9],["xStocks",7],["USDC",6],["Other",4]];
  const daily = [41,66,52,78,62,91,84,103,72,119,126,114];

  return (
    <main className="page">
      <section className="pageHeading">
        <div><span className="eyebrow">ONCHAIN REPORTING</span><h1>Protocol analytics</h1><p>Transparent reporting for Fortune markets on BNB Smart Chain.</p></div>
        <div className="filterTabs"><button className="tabActive">24h</button><button>7d</button><button>All time</button></div>
      </section>

      <div className="metricsGrid five">
        <Metric label="24h volume" value={money(analytics.volume24h)} detail="+12.4% from prior day" />
        <Metric label="24h launches" value={analytics.launches24h.toString()} detail="All Fortune curves" />
        <Metric label="Graduations" value={analytics.graduations24h.toString()} detail="To destination adapters" />
        <Metric label="Unique creators" value={analytics.uniqueCreators.toLocaleString()} detail="Lifetime" />
        <Metric label="Fortune liquidity" value={money(analytics.totalLiquidity)} detail="Graduated markets" />
      </div>

      <div className="analyticsGrid">
        <section className="panel">
          <div className="panelTitle"><div><span className="eyebrow">TRADING VOLUME</span><h2>{money(analytics.volume24h)}</h2></div><span>Latest 12 periods</span></div>
          <div className="barChart">{daily.map((v,i)=><span key={i} style={{height:(Math.round(v/1.3))+"%"}} />)}</div>
        </section>

        <section className="panel">
          <div className="panelTitle"><div><span className="eyebrow">QUOTE-ASSET MIX</span><h2>{money(analytics.basketReserves)} reserves</h2></div><span>Fortune baskets</span></div>
          <div className="mixList">{quoteMix.map(([name,value])=><div key={name}><span>{name}</span><div><i style={{width:value+"%"}} /></div><strong>{value}%</strong></div>)}</div>
        </section>

        <section className="panel fullSpan">
          <div className="panelTitle"><div><span className="eyebrow">FEE ROUTING</span><h2>Where protocol activity goes</h2></div><span>Onchain / indexer-backed in production</span></div>
          <div className="routeMetrics">
            <Metric label="Holder rewards" value={money(analytics.rewardsDistributed)} />
            <Metric label="Buybacks" value={money(analytics.buybacks)} />
            <Metric label="Protocol revenue" value={money(analytics.protocolRevenue)} />
            <Metric label="LP reinforcement" value="$2.04M" />
          </div>
        </section>

        <section className="panel">
          <span className="eyebrow">GRADUATION HEALTH</span>
          <div className="statRows">
            <div><span>Average time to graduation</span><strong>6h 42m</strong></div>
            <div><span>Multi-pool graduations</span><strong>61%</strong></div>
            <div><span>Average destination markets</span><strong>3.2</strong></div>
            <div><span>Graduation execution success</span><strong>99.7%</strong></div>
          </div>
        </section>

        <section className="panel">
          <span className="eyebrow">BASKET INTELLIGENCE</span>
          <div className="statRows">
            <div><span>Most paired asset</span><strong>BNB</strong></div>
            <div><span>Fastest-growing quote</span><strong>NVDAx</strong></div>
            <div><span>Most-used reward</span><strong>CAKE</strong></div>
            <div><span>Most common configuration</span><strong>BNB · USDT · CAKE</strong></div>
          </div>
        </section>
      </div>
      <p className="dataDisclaimer">Demo metrics are placeholders until Fortune indexers and deployed contracts exist. Production analytics must be derived from onchain events and independently reproducible queries.</p>
    </main>
  );
}
