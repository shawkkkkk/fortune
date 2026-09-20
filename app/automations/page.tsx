import { automations } from "@/data/mock";

export default function AutomationsPage() {
  return (
    <main className="page">
      <section className="pageHeading">
        <div><span className="eyebrow">PROTOCOL OPERATIONS</span><h1>Automations</h1><p>See what Fortune contracts and keepers are doing automatically—and what still needs attention.</p></div>
        <span className="healthBadge">● All systems nominal</span>
      </section>

      <section className="automationHero">
        <div><span className="eyebrow">AUTOMATION PRINCIPLE</span><h2>Nothing important should happen invisibly.</h2><p>Every automated route gets a public state, destination, execution policy and failure queue.</p></div>
        <div className="automationFlow">
          <span>TRADE</span><b>→</b><span>FEE MATRIX</span><b>→</b><span>VAULT</span><b>→</b><span>ACTION</span>
        </div>
      </section>

      <div className="automationGrid">
        {automations.map((item) => (
          <article className="automationCard" key={item.name}>
            <div className="automationTop"><span className="automationIcon">↻</span><span className={"automationStatus status"+item.status.replace(" ","")}>{item.status}</span></div>
            <h2>{item.name}</h2>
            <p>{item.detail}</p>
            <strong>{item.amount}</strong>
            <div className="automationMeta"><span>Executor</span><b>Fortune keeper / contract</b></div>
            <div className="automationMeta"><span>Failure policy</span><b>Queue + retry + visible alert</b></div>
          </article>
        ))}
      </div>

      <section className="panel automationLedger">
        <div className="panelTitle"><div><span className="eyebrow">EXECUTION LEDGER</span><h2>Recent automated actions</h2></div><span>Demo until testnet contracts deploy</span></div>
        {[
          ["Holder distribution","CHIP","CAKE","$4,218","Completed","2m"],
          ["LP reinforcement","RUSH","BNB + USDT","$9,804","Completed","8m"],
          ["Buyback & burn","BANANA","BNB","$2,112","Completed","12m"],
          ["Graduation finalization","CHIP","4 pools","Pending","Awaiting threshold","now"],
        ].map((row)=><div className="ledgerRow" key={row[0]+row[1]}>{row.map((cell,i)=><span key={i}>{cell}</span>)}</div>)}
      </section>
    </main>
  );
}
