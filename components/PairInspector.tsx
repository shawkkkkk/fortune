"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import type { PairInspection, TransferLeg } from "@/lib/pair-inspector";
import { FINDING_TEXT, VERDICT_TEXT, formatTaxBps } from "@/lib/pair-inspector-text";
import { shortAddress } from "@/lib/market-format";

const HOLDER_TEXT: Record<string, string> = {
  fresh: "a fresh wallet",
  wallet: "your wallet",
  burn: "the burn address",
  owner: "the owner address",
  exchange: "an exchange wallet",
  pool: "a DEX pool",
};

function legValue(leg: TransferLeg | null) {
  if (!leg) return { text: "—", tone: "muted" };
  if (leg.reverted) return { text: "Fails", tone: "bad" };
  if (leg.taxBps === 10_000) return { text: "100%", tone: "bad" };
  return { text: formatTaxBps(leg.taxBps), tone: leg.taxBps ? "warn" : "good" };
}

/**
 * Measures any BEP-20 as a custom pair through the public inspection API:
 * bytecode controls plus simulated transfers on each leg a curve uses.
 */
export default function PairInspector({
  address,
  chainId,
  holder = null,
  onResult,
}: {
  address: string;
  chainId?: number;
  holder?: string | null;
  onResult?: (result: PairInspection | null) => void;
}) {
  const [result, setResult] = useState<PairInspection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const valid = isAddress(address.trim());

  useEffect(() => {
    setResult(null);
    setError("");
    onResult?.(null);
    if (!valid) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ address: address.trim() });
    if (chainId) query.set("chain", String(chainId));
    if (holder && isAddress(holder)) query.set("holder", holder);
    setLoading(true);
    fetch(`/api/public/v1/pairs/inspect?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.data) throw new Error(body?.error?.message || "The token could not be checked right now.");
        setResult(body.data);
        onResult?.(body.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The token could not be checked right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // onResult is a callback prop; re-running on its identity would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, holder, valid]);

  if (!valid) return null;
  if (loading && !result) return <div className="pairInspector pairInspectorLoading" aria-busy="true"><p className="chartCoverage">Simulating transfers of this token…</p></div>;
  if (error) return <div className="pairInspector"><p className="fieldError" role="alert">{error}</p></div>;
  if (!result) return null;

  const verdict = VERDICT_TEXT[result.verdict];
  const buy = legValue(result.simulation.buy);
  const sell = legValue(result.simulation.sell);
  const pool = legValue(result.simulation.pool);

  return (
    <section className={"pairInspector pairInspector-" + result.verdict} aria-live="polite">
      <div className="inspectorHead">
        <div>
          <span className="eyebrow">PAIR TOKEN CHECK</span>
          <h3 translate="no">{result.token.symbol || "Unknown"}{result.token.name ? ` · ${result.token.name}` : ""}</h3>
          <p className="mutedSmall"><span translate="no">{shortAddress(result.address)}</span> · {result.token.decimals ?? "?"} decimals</p>
        </div>
        <span className={"inspectorVerdict inspectorVerdict-" + result.verdict}>{verdict.label}</span>
      </div>
      <p className="fieldHint">{verdict.detail}</p>

      <dl className="inspectorTaxes">
        <div><dt>Buying</dt><dd><b className={"tax-" + buy.tone} translate="no">{buy.text}</b><small>wallet → curve</small></dd></div>
        <div><dt>Selling</dt><dd><b className={"tax-" + sell.tone} translate="no">{sell.text}</b><small>curve → wallet</small></dd></div>
        <div><dt>Graduation</dt><dd><b className={"tax-" + pool.tone} translate="no">{pool.text}</b><small>curve → pool</small></dd></div>
      </dl>

      {result.findings.length ? (
        <ul className="inspectorFindings">
          {result.findings.map((finding) => {
            const text = FINDING_TEXT[finding.code] ?? { title: finding.code, detail: "" };
            return (
              <li key={finding.code} className={"inspectorFinding-" + finding.level}>
                <b>{text.title}{finding.value !== undefined ? <span translate="no"> · {formatTaxBps(finding.value)}</span> : null}</b>
                {text.detail ? <span>{text.detail}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="fieldHint">
        <span>{result.simulation.holderKind ? `Transfers simulated from ${HOLDER_TEXT[result.simulation.holderKind] ?? "a holder"}` : "Checked"}</span>{" "}
        <span>at block</span> <span translate="no">{Number(result.blockNumber).toLocaleString("en-US")}</span>.{" "}
        <span>A simulation, not an audit: issuers can change taxes, pause or blacklist later.</span>
      </p>
    </section>
  );
}
