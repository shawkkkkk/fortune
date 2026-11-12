import { createHash } from "node:crypto";
import {
  BASE_USDC_ADDRESS,
  MIN_CASHOUT_AMOUNT,
  RECOMMENDED_MIN_CASHOUT_AMOUNT,
  normalizeCashPayee,
  type CashOrder,
} from "@zkp2p/cash";

export const XMONEY_PAYOUT_RULES = {
  baseChainId: 8453,
  baseUsdc: BASE_USDC_ADDRESS.toLowerCase(),
  decimals: 6,
  hardMinimumUnits: MIN_CASHOUT_AMOUNT.toString(),
  recommendedMinimumUnits: RECOMMENDED_MIN_CASHOUT_AMOUNT.toString(),
  platform: "xmoney",
  currency: "USD",
} as const;

const HASH = /^0x[0-9a-fA-F]{64}$/;
const REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{7,127}$/;
const PLAN_KEYS = ["xHandle", "baseUsdcUnits", "baseSettlementTxHash", "sourceReference", "requestedChecks"] as const;
const CHECK_KEYS = [
  "xIdentityVerified",
  "xMoneyEnabledConfirmed",
  "receiptConnectionVerified",
  "liveScreeningPassed",
  "baseUsdcSettled",
  "custodyPolicyApproved",
  "ownerAuthorizationPresent",
] as const;

export type XMoneyRequestedChecks = Record<(typeof CHECK_KEYS)[number], boolean>;

export type XMoneyPayoutPlan = {
  planId: string;
  xHandle: string;
  baseUsdcUnits: string;
  baseSettlementTxHash: `0x${string}`;
  sourceReference: string;
  source: { chainId: 8453; token: string; symbol: "USDC"; decimals: 6 };
  receive: { platform: "xmoney"; currency: "USD"; payee: string };
  requestedChecks: XMoneyRequestedChecks;
  blockers: string[];
  status: "blocked" | "operator-review-required";
  transactionReady: false;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function normalizeXHandle(value: unknown) {
  if (typeof value !== "string") throw new Error("xHandle must be a string");
  const normalized = normalizeCashPayee("xmoney", value);
  if (!("offchainId" in normalized) || typeof normalized.offchainId !== "string") throw new Error("Invalid X handle");
  if (!/^[a-z0-9_]{1,15}$/.test(normalized.offchainId)) throw new Error("Invalid X handle");
  return normalized.offchainId;
}

function parseUnits(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)) throw new Error("baseUsdcUnits must be a positive base-unit string");
  const amount = BigInt(value);
  if (amount > 10_000_000_000_000n) throw new Error("baseUsdcUnits exceeds the preview bound");
  return amount;
}

/**
 * Deterministic public preview. Every check is merely asserted by the caller;
 * the result can enter operator review but can never authorize a transaction.
 */
export function planXMoneyPayout(input: unknown): XMoneyPayoutPlan {
  if (!isRecord(input) || !hasExactKeys(input, PLAN_KEYS)) throw new Error("Invalid X Money payout plan");
  const checks = input.requestedChecks;
  if (!isRecord(checks) || !hasExactKeys(checks, CHECK_KEYS)) throw new Error("Invalid requestedChecks");

  const xHandle = normalizeXHandle(input.xHandle);
  const amount = parseUnits(input.baseUsdcUnits);
  if (typeof input.baseSettlementTxHash !== "string" || !HASH.test(input.baseSettlementTxHash)) throw new Error("Invalid Base settlement transaction hash");
  if (typeof input.sourceReference !== "string" || !REFERENCE.test(input.sourceReference)) throw new Error("Invalid sourceReference");

  const requestedChecks = Object.fromEntries(
    CHECK_KEYS.map((key) => {
      if (typeof checks[key] !== "boolean") throw new Error(`requestedChecks.${key} must be boolean`);
      return [key, checks[key]];
    })
  ) as XMoneyRequestedChecks;

  const blockers: string[] = [];
  if (amount < MIN_CASHOUT_AMOUNT) blockers.push("amount_below_provider_minimum");
  if (amount < RECOMMENDED_MIN_CASHOUT_AMOUNT) blockers.push("amount_below_recommended_minimum");
  for (const key of CHECK_KEYS) if (!requestedChecks[key]) blockers.push(`missing_${key}`);

  const normalized = {
    xHandle,
    baseUsdcUnits: amount.toString(),
    baseSettlementTxHash: input.baseSettlementTxHash.toLowerCase(),
    sourceReference: input.sourceReference,
    requestedChecks,
  };
  const planId = "xmoney_plan_" + createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

  return {
    planId,
    ...normalized,
    baseSettlementTxHash: normalized.baseSettlementTxHash as `0x${string}`,
    source: { chainId: 8453, token: XMONEY_PAYOUT_RULES.baseUsdc, symbol: "USDC", decimals: 6 },
    receive: { platform: "xmoney", currency: "USD", payee: xHandle },
    blockers,
    status: blockers.length ? "blocked" : "operator-review-required",
    transactionReady: false,
  };
}

export type XMoneyReceipt = {
  depositId: string;
  state: CashOrder["state"];
  verified: boolean;
  paidUsd: number;
  releasedUsdcUnits: string;
  paymentIds: string[];
  reasons: string[];
};

/**
 * Converts provider order evidence into Fortune's receipt view. A terminal UI
 * state alone is insufficient: every released fill needs its verified USD
 * amount, external payment id and fulfilment time.
 */
export function reconcileXMoneyReceipt(order: CashOrder): XMoneyReceipt {
  const reasons: string[] = [];
  const payout = order.payouts?.find((candidate) => candidate.platform === "xmoney" && candidate.currency === "USD");
  if (!payout) reasons.push("xmoney_usd_payout_not_proven");
  if (order.state !== "delivered") reasons.push("order_not_delivered");
  if (order.filledAmount !== order.totalAmount || order.returnedAmount !== 0n) reasons.push("amounts_not_fully_delivered");

  let paidUsd = 0;
  let released = 0n;
  const paymentIds: string[] = [];
  for (const fill of order.fills) {
    const complete =
      typeof fill.fiatPaid === "number" && Number.isFinite(fill.fiatPaid) && fill.fiatPaid > 0 &&
      fill.paidCurrency === "USD" && typeof fill.paymentId === "string" && fill.paymentId.length > 0 &&
      typeof fill.fulfilledAt === "number" && fill.fulfilledAt > 0 && typeof fill.releasedAmount === "bigint" && fill.releasedAmount > 0n;
    if (!complete) {
      reasons.push(`fill_${fill.intentHash}_missing_verified_receipt`);
      continue;
    }
    paidUsd += fill.fiatPaid!;
    released += fill.releasedAmount!;
    paymentIds.push(fill.paymentId!);
  }
  if (released !== order.filledAmount) reasons.push("released_amount_mismatch");
  if (!order.fills.length) reasons.push("no_fills");

  return {
    depositId: order.depositId,
    state: order.state,
    verified: reasons.length === 0,
    paidUsd: Math.round(paidUsd * 100) / 100,
    releasedUsdcUnits: released.toString(),
    paymentIds,
    reasons,
  };
}
