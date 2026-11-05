"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { reviewCanonSigningRequest, signReviewedCanon } from "@/lib/creator-canon-signing";
import { ZERO_CANON_DIGEST, type CanonPolicy } from "@/lib/creator-canon-authorization";
import type { CharacterFields } from "@/lib/creator-character";

type Provider = { request(args: { method: string; params?: unknown }): Promise<unknown> };
type Reviewed = { request: ReturnType<typeof reviewCanonSigningRequest>; account: Address; predecessorChecked: boolean };
type Envelope = Awaited<ReturnType<typeof signReviewedCanon>>;
let walletBusy = false;

export function isLocalCanonHandoff() {
  return typeof window !== "undefined" && window.top === window &&
    window.location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export default function CanonHandoff({ token, fields }: { token: string; fields: CharacterFields }) {
  const [pins, setPins] = useState("");
  const [prepared, setPrepared] = useState("");
  const [review, setReview] = useState<Reviewed | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [status, setStatus] = useState("");
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function invalidate() {
    setReview(null); setConsent(false); setEnvelope(null); setStatus("");
  }
  function reviewRequest() {
    invalidate();
    try {
      if (!isLocalCanonHandoff() || new TextEncoder().encode(pins).length > 4096) throw Error();
      const p = JSON.parse(pins) as { policy: CanonPolicy; registryId: Hex; account: Address; head?: { revision: number; digest: Hex } };
      const keys = Object.keys(p).sort().join();
      const predecessorChecked = keys === "account,head,policy,registryId";
      if ((!predecessorChecked && keys !== "account,policy,registryId") ||
          Object.keys(p.policy).sort().join() !== "chainId,factory,factoryCodeHash,launchIndex,token" ||
          typeof p.account !== "string" || !/^0x[0-9a-f]{40}$/i.test(p.account) || /^0x0{40}$/i.test(p.account) ||
          p.policy.token !== token.toLowerCase()) throw Error();
      const request = reviewCanonSigningRequest(prepared, p.policy, p.registryId, fields);
      if (predecessorChecked) {
        const head = p.head;
        if (!head || Object.keys(head).sort().join() !== "digest,revision" ||
            !Number.isSafeInteger(head.revision) || head.revision < 0 || head.revision >= 1000 ||
            typeof head.digest !== "string" || !/^0x[0-9a-f]{64}$/.test(head.digest) ||
            (head.revision === 0) !== (head.digest === ZERO_CANON_DIGEST) ||
            request.update.revision !== head.revision + 1 ||
            request.update.previousDigest !== head.digest) throw Error();
      }
      const now = Date.now();
      if (now < request.update.issuedAtMs || now >= request.update.expiresAtMs) throw Error();
      setReview({ request, account: p.account, predecessorChecked });
    } catch {
      setStatus("Request rejected. Check the separate operator pins, project, registry revision, exact draft fields and original expiry.");
    }
  }
  async function requestWallet() {
    if (!review || !consent || walletBusy || !active.current || !isLocalCanonHandoff()) return;
    const { request, account } = review;
    invalidate();
    // Lock across draft edits/unmounts, even while a wallet request is pending.
    walletBusy = true;
    setBusy(true);
    const selected = () => (window as Window & { ethereum?: Provider }).ethereum;
    try {
      const provider = selected();
      const invoke = provider?.request;
      if (!provider || typeof invoke !== "function") throw Error();
      const current = () => {
        if (!active.current || !isLocalCanonHandoff() || selected() !== provider || provider.request !== invoke) throw Error();
      };
      const wallet = createWalletClient({ transport: custom({
        async request(args) {
          current();
          if (!["eth_accounts", "eth_chainId", "eth_signTypedData_v4"].includes(args.method)) throw Error();
          const result = await invoke.call(provider, args);
          current();
          return result;
        },
      }, { retryCount: 0 }) });
      const signed = await signReviewedCanon(wallet, request, { enabled: true, reviewedDigest: request.digest, expectedAccount: account });
      current();
      setEnvelope(signed);
      setStatus("Wallet response checked. Download the envelope for separate operator verification.");
    } catch {
      if (active.current) setStatus("No envelope produced. Check the connected wallet, request expiry and review before trying again.");
    } finally {
      walletBusy = false;
      if (active.current) setBusy(false);
    }
  }
  function downloadEnvelope() {
    if (!envelope || !active.current || !isLocalCanonHandoff()) return;
    const now = Date.now();
    if (now < envelope.update.issuedAtMs || now >= envelope.update.expiresAtMs) {
      invalidate(); setStatus("The original request expired. Prepare a new request with the operator."); return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fortune-character-signed-envelope.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    invalidate();
    setStatus("Downloaded locally. Keep this file private and give it only to the registry operator.");
  }

  return <section className="formCard">
    <h2>Local creator wallet handoff</h2>
    <p>Use only with an operator you trust. Obtain the policy, registry ID and expected wallet address separately from the prepared request. Connect the expected account to this local site in your wallet first.</p>
    <label>Operator pins JSON<textarea disabled={busy} rows={4} maxLength={4096} value={pins} onChange={e => { invalidate(); setPins(e.target.value); }} /></label>
    <p className="fieldHint">Use the operator pin export. Prefer the export that includes the registry head. Never enter a key or recovery phrase.</p>
    <label>Prepared character request JSON<textarea disabled={busy} rows={5} maxLength={40960} value={prepared} onChange={e => { invalidate(); setPrepared(e.target.value); }} /></label>
    <button className="secondaryCta" disabled={busy || !pins || !prepared} onClick={reviewRequest}>Review prepared request</button>
    {review && <>
      <p>Review the character fields above. This request is for revision {review.request.update.revision}, expiring {new Date(review.request.update.expiresAtMs).toISOString()}.</p>
      <p>{review.predecessorChecked ? "Predecessor matches the operator’s registry snapshot. The registry may advance before acceptance." : "These pins do not include a registry head. The operator will check the revision on acceptance."}</p>
      <pre className="apiCode">{`Wallet: ${review.account}\nProject: ${review.request.update.token}\nRegistry: ${review.request.registryId}\nDigest: ${review.request.digest}`}</pre>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><input style={{ width: 18, height: 18, minHeight: 18, flex: "none" }} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I reviewed the request and allow my browser wallet and its provider to receive all ten character fields.</label>
      <button className="secondaryCta" disabled={!consent} onClick={requestWallet}>Request character signature</button>
    </>}
    {envelope && <button className="secondaryCta" onClick={downloadEnvelope}>Download signed envelope</button>}
    <p role="status">{busy ? "Waiting for the wallet. No transaction is requested." : status}</p>
  </section>;
}
