"use client";
import { useRef, useState } from "react";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

type Check = { address: string; chainId: number; metadata: { name: string | null; symbol: string | null }; launchability: { launchableNow: boolean; reasonCodes: string[] } };
export default function PairAddressCheck({ onSelect }: { onSelect: (address: string) => boolean }) {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Check | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function check() {
    const sequence = ++generation.current;
    setBusy(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/public/v1/assets/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: address.trim() }), signal: AbortSignal.timeout(25_000) });
      const body = await response.json();
      if (!response.ok || body?.data?.chainId !== FORTUNE_NETWORK.chainId) throw new Error(body?.error?.message || "Token check unavailable.");
      if (sequence === generation.current) setResult(body.data);
    } catch (e) { if (sequence === generation.current) setError(e instanceof Error ? e.message : "Token check unavailable."); }
    finally { if (sequence === generation.current) setBusy(false); }
  }
  return <div className="customPairCheck">
    <p>Paste an address to check the active network. Readable BEP-20 metadata alone does not make a token safe or approved.</p>
    <div className="creatorToolbar"><label>Token contract address<input value={address} maxLength={42} placeholder="0x…" onChange={(e) => { generation.current++; setBusy(false); setAddress(e.target.value); setResult(null); setError(""); }} /></label><button type="button" className="secondaryCta" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())} onClick={() => void check()}>{busy ? "Checking…" : "Check token"}</button></div>
    <p className="fieldHint">Network: {FORTUNE_NETWORK.chainName} · {FORTUNE_NETWORK.chainId}</p>
    {error ? <p role="status">{error}</p> : null}
    {result ? <div role="status"><strong translate="no">{result.metadata.symbol || "Unknown token"} · {result.metadata.name || result.address}</strong><p>{result.launchability.launchableNow ? "Registry checks passed. Release readiness and transaction preflight still apply." : "Not available for this launch."}</p>
      {result.launchability.reasonCodes.length ? <p className="fieldHint" translate="no">{result.launchability.reasonCodes.join(" · ")}</p> : null}
      {result.launchability.launchableNow ? <button type="button" className="secondaryCta" onClick={() => { if (!onSelect(result.address)) setError("This asset is not in the current form's approved snapshot. Reload the page and check again."); }}>Use checked pair</button> : null}
    </div> : null}
  </div>;
}
