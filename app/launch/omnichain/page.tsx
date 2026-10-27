"use client";

import Link from "next/link";
import "../catalog.css";
import { useState } from "react";
import { OMNI_TESTNETS, planOmnichain } from "@/lib/omnichain-plan";

export default function OmnichainPage() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [amounts, setAmounts] = useState<Record<number, string>>({ 97: "500000000", 84532: "500000000" });
  const [busy, setBusy] = useState(false);
  const [serverResult, setServerResult] = useState<{ key: string; message: string } | null>(null);
  const input = { name, symbol, globalSupply: supply, allocations: OMNI_TESTNETS.filter(c => amounts[c.id] !== undefined).map(c => ({ chainId: c.id, supply: amounts[c.id] })) };
  const inputKey = JSON.stringify(input);
  let preview: ReturnType<typeof planOmnichain> | null = null, error = "";
  try { preview = planOmnichain(input); } catch (e) { error = e instanceof Error ? e.message : "Invalid plan"; }
  async function validatePlan() {
    const key = inputKey;
    setBusy(true);
    try {
      const response = await fetch("/api/public/v1/omnichain/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
      const body = await response.json();
      if (!response.ok || body?.data?.transactionReady !== false || typeof body?.data?.planId !== "string") throw new Error("Plan validation unavailable. Try again.");
      setServerResult({ key, message: "Supply plan validated. Reference: " + body.data.planId + ". Deployment remains unavailable." });
    } catch { setServerResult({ key, message: "Plan validation unavailable. Try again." }); }
    finally { setBusy(false); }
  }
  return <main className="page launchPage">
    <section className="pageHeading"><span className="eyebrow">OMNICHAIN · SUPPLY PLANNER</span><h1>One token. A global supply.</h1><p>Plan testnet allocations before deployment. Adding a chain divides the supply; it does not multiply it.</p></section>
    <div className="registryNotice"><strong>PLANNING ONLY</strong><span>No wallet connection, payment, token deployment or bridge transaction is available. These test networks are planning targets, not verified Fortune messaging routes.</span></div>
    <section className="formCard"><h2>Token &amp; allocations</h2><div className="fieldGrid">
      <label>Token name<input maxLength={64} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Ticker<input maxLength={16} value={symbol} onChange={e => setSymbol(e.target.value)} /></label>
    </div><label>Global supply · whole tokens<input inputMode="numeric" maxLength={14} value={supply} onChange={e => setSupply(e.target.value)} /></label>
      {OMNI_TESTNETS.map(c => <div className="fieldGrid" key={c.id}>
        <label className="omniNetworkChoice"><span><input type="checkbox" checked={amounts[c.id] !== undefined} disabled={c.id === 97} onChange={e => { const checked = e.target.checked; setAmounts(previous => { const next = { ...previous }; if (checked) next[c.id] = ""; else delete next[c.id]; return next; }); }} /> {c.name}</span></label>
        {amounts[c.id] !== undefined ? <label>Tokens on {c.name}<input inputMode="numeric" maxLength={14} value={amounts[c.id]} onChange={e => setAmounts(previous => ({ ...previous, [c.id]: e.target.value }))} /></label> : null}
      </div>)}
      <p className="fieldHint">Whole-token allocations, 18 local decimals and 6 shared decimals for this planning model. Ethereum mainnet, Solana and other chain adapters are not implemented.</p>
    </section>
    <section className="formCard" aria-live="polite"><h2>Plan review</h2>{preview ? <><p>Allocations equal {preview.globalSupply} tokens globally.</p><details><summary>Inspect supply plan</summary><pre className="omniPlanOutput">{JSON.stringify(preview, null, 2)}</pre></details></> : <p>{error}</p>}<button className="secondaryCta" type="button" disabled={!preview || busy} onClick={() => void validatePlan()}>{busy ? "Validating…" : "Validate supply plan"}</button>{serverResult?.key === inputKey ? <p role="status" className="fieldHint">{serverResult.message}</p> : null}<p className="fieldHint">Prices and liquidity remain separate on each chain. A single checkout cannot guarantee atomic opening or equal live prices.</p></section>
    <Link className="secondaryCta" href="/launch/types">← All launch types</Link>
  </main>;
}
