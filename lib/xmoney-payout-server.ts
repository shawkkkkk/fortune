import {
  createCashClient,
  orderToJson,
  prepareResultToJson,
  preparedXMoneyConnectToJson,
  type CashClient,
  type PreparedCashoutReceipt,
} from "@zkp2p/cash";
import { XMONEY_PAYOUT_RULES, type XMoneyPayoutPlan } from "@/lib/xmoney-payout";

type XMoneyEnvironment = "staging" | "preproduction" | "production";

export type XMoneyOperatorAuthorization = {
  approved: true;
  approvalRef: string;
  custodyPolicyRef: string;
  recipientScreeningRef: string;
  baseSettlementTxHash: `0x${string}`;
  maxBaseUsdcUnits: string;
};

type XMoneyClientPort = Pick<
  CashClient,
  "capabilities" | "prepare" | "prepareXMoneyConnect" | "isXMoneyConnected" | "finalizePreparedCashout" | "order"
>;

function environment(): XMoneyEnvironment {
  const value = process.env.FORTUNE_XMONEY_ENVIRONMENT?.trim();
  return value === "staging" || value === "production" ? value : "preproduction";
}

function client(): CashClient {
  return createCashClient({ environment: environment(), referrer: "fortune" });
}

function executionEnabled() {
  return process.env.FORTUNE_XMONEY_PREPARE_ENABLED === "true";
}

function requireReference(value: string, label: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{7,127}$/.test(value)) throw new Error(`${label} is missing or malformed`);
}

export function readXMoneyPayoutStatus(cash: XMoneyClientPort = client()) {
  const capabilities = cash.capabilities();
  if (capabilities instanceof Promise) throw new Error("Unexpected asynchronous default capabilities");
  const corridor = capabilities.platforms.find((entry) => entry.platform === "xmoney");
  const env = environment();
  const prepareEnabled = executionEnabled();
  return {
    provider: "Peer Cash",
    sdk: "@zkp2p/cash@0.8.0",
    environment: env,
    prepareEnabled,
    productionCanaryEnabled: env === "production" && process.env.FORTUNE_XMONEY_PRODUCTION_CANARY_ENABLED === "true",
    execution: "server-only unsigned prepare",
    destination: capabilities.destination,
    corridor: corridor ?? null,
    rules: XMONEY_PAYOUT_RULES,
    senderDisclosure: "The creator sees the matched buyer as sender; Fortune can be included in the payment note.",
  };
}

function requireAuthorizedPlan(plan: XMoneyPayoutPlan, authorization: XMoneyOperatorAuthorization) {
  if (plan.status !== "operator-review-required" || plan.blockers.length || plan.transactionReady) throw new Error("Payout plan is not eligible for operator review");
  if (!executionEnabled()) throw new Error("X Money unsigned preparation is disabled");
  if (environment() === "production" && process.env.FORTUNE_XMONEY_PRODUCTION_CANARY_ENABLED !== "true") throw new Error("Production X Money canary is disabled");
  if (!authorization.approved) throw new Error("Explicit operator approval is required");
  requireReference(authorization.approvalRef, "approvalRef");
  requireReference(authorization.custodyPolicyRef, "custodyPolicyRef");
  requireReference(authorization.recipientScreeningRef, "recipientScreeningRef");
  if (authorization.baseSettlementTxHash.toLowerCase() !== plan.baseSettlementTxHash.toLowerCase()) throw new Error("Base settlement evidence does not match the plan");
  if (!/^[1-9][0-9]{0,19}$/.test(authorization.maxBaseUsdcUnits) || BigInt(plan.baseUsdcUnits) > BigInt(authorization.maxBaseUsdcUnits)) throw new Error("Payout exceeds the approved cap");
}

/**
 * Server-only handoff. It registers the payee and returns unsigned Base
 * transactions; it never signs, broadcasts or retries them.
 */
export async function prepareAuthorizedXMoneyPayout(
  plan: XMoneyPayoutPlan,
  authorization: XMoneyOperatorAuthorization,
  cash: XMoneyClientPort = client()
) {
  requireAuthorizedPlan(plan, authorization);
  const prepared = await cash.prepare({
    amount: BigInt(plan.baseUsdcUnits),
    receive: { platform: "xmoney", currency: "USD", payee: plan.xHandle },
  });
  return prepareResultToJson(prepared);
}

export async function prepareXMoneyReceiptConnection(xHandle: string, returnUrl: string, cash: XMoneyClientPort = client()) {
  const prepared = await cash.prepareXMoneyConnect(xHandle, { returnUrl });
  return preparedXMoneyConnectToJson(prepared);
}

export async function isXMoneyReceiptConnectionActive(payeeDetails: `0x${string}`, cash: XMoneyClientPort = client()) {
  return cash.isXMoneyConnected(payeeDetails);
}

export function finalizePreparedXMoneyPayout(receipt: PreparedCashoutReceipt, cash: XMoneyClientPort = client()) {
  return cash.finalizePreparedCashout(receipt);
}

export async function readXMoneyOrder(depositId: string, cash: XMoneyClientPort = client()) {
  return orderToJson(await cash.order(depositId));
}
