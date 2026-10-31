import { readProjectSnapshot } from "@/lib/project-snapshot";
import { CREATOR_HELP_CARDS } from "@/lib/creator-copilot";

/** Deterministic operator briefing from public API attestations; no model or creator prose. */
export async function readCreatorProjectBrief(token: string, options: Parameters<typeof readProjectSnapshot>[1] = {}) {
  const now = options.now ?? Date.now, started = now();
  if (!Number.isSafeInteger(started) || started < 0) throw Error("Invalid briefing clock");
  const snapshot = await readProjectSnapshot(token, options);
  const observedAtMs = now();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < started) throw Error("Briefing clock moved backwards");
  const m = snapshot.market, p = m.provenance;
  const review = m.phase === 0 ? "Review the current curve and Launch Shield terms before any separate wallet action."
    : m.phase === 1 ? "GraduationReady is an observed phase, not proof of completed migration; inspect current lifecycle evidence."
    : m.phase === 2 ? "The retired curve price is unavailable; a separate current pool quote is required for any trade review."
    : "Rescued is an observed phase; inspect exact rescue/redemption evidence rather than assuming a wallet payout.";
  return {
    schemaVersion: 1, kind: "operator-project-brief", generatedBy: "deterministic-fortune-code", observedAtMs,
    project: { chainId: 97, token: p.token, factory: p.factory, creator: p.creator, curve: m.curve,
      blockNumber: p.blockNumber, blockHash: p.blockHash, phase: m.phase, status: m.status,
      totalSupply: m.totalSupply, tokenDecimals: m.tokenDecimals, curveAccounting: m.curveAccounting },
    unavailable: { marketCapUsd: null, volume24hUsd: null, holderCount: null, treasuryBalance: null, tradeQuote: null, creatorAuthorization: null },
    reviewNotes: [review, "Review exact asset, fee, custody, lifecycle and release evidence separately. This brief approves no action."],
    policyCards: CREATOR_HELP_CARDS.filter(c => ["standard", "fees", "release"].includes(c.id)),
    sources: [{ kind: "public-api-attestation", url: `https://fortunepad.fun/api/public/v1/tokens/${p.token}/project`, blockNumber: p.blockNumber, blockHash: p.blockHash }],
    limitations: [...snapshot.limitations, "Policy cards are pinned historical summaries, not live release verification. No creator text, private character record or model output is included."],
    independentRpcVerified: false, creatorAuthenticated: false, modelInvoked: false, publicationAuthorized: false,
    executionAuthorized: false, readinessAttested: false, fullCopilotReadiness: false,
  };
}
