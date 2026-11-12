import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { planXMoneyPayout, reconcileXMoneyReceipt, XMONEY_PAYOUT_RULES } from "../../lib/xmoney-payout.ts";
import { prepareAuthorizedXMoneyPayout, readXMoneyPayoutStatus } from "../../lib/xmoney-payout-server.ts";

registerHooks({ resolve(specifier, context, next) { return next(specifier === "next/server" ? "next/server.js" : specifier, context); } });
const { POST } = await import("../../app/api/public/v1/xmoney/preview/route.ts");
const { GET } = await import("../../app/api/public/v1/xmoney/status/route.ts");

const hash = (digit = "1") => `0x${digit.repeat(64)}`;
const checks = (value = true) => ({
  xIdentityVerified: value,
  xMoneyEnabledConfirmed: value,
  receiptConnectionVerified: value,
  liveScreeningPassed: value,
  baseUsdcSettled: value,
  custodyPolicyApproved: value,
  ownerAuthorizationPresent: value,
});
const input = () => ({
  xHandle: "@FortunePad",
  baseUsdcUnits: "2500000",
  baseSettlementTxHash: hash("1"),
  sourceReference: "social-fee:identity-42",
  requestedChecks: checks(),
});

test("payout preview uses the pinned SDK rules and remains non-executable", () => {
  const plan = planXMoneyPayout(input());
  assert.equal(plan.xHandle, "fortunepad");
  assert.equal(plan.status, "operator-review-required");
  assert.equal(plan.transactionReady, false);
  assert.equal(plan.source.chainId, 8453);
  assert.equal(plan.source.token, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(XMONEY_PAYOUT_RULES.hardMinimumUnits, "10000");
  assert.equal(XMONEY_PAYOUT_RULES.recommendedMinimumUnits, "1000000");
  assert.equal(plan.planId, planXMoneyPayout({ ...input(), xHandle: "fortunepad" }).planId);
});

test("missing evidence, dust and invented fields fail closed", () => {
  const requestedChecks = checks();
  requestedChecks.receiptConnectionVerified = false;
  const blocked = planXMoneyPayout({ ...input(), baseUsdcUnits: "999999", requestedChecks });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, ["amount_below_recommended_minimum", "missing_receiptConnectionVerified"]);
  for (const bad of [
    null,
    {},
    { ...input(), transactionReady: true },
    { ...input(), xHandle: "not an x handle" },
    { ...input(), baseUsdcUnits: 2500000 },
    { ...input(), baseUsdcUnits: "0" },
    { ...input(), baseSettlementTxHash: "confirmed" },
    { ...input(), requestedChecks: { ...checks(), signerApproved: true } },
  ]) assert.throws(() => planXMoneyPayout(bad));
});

test("unsigned preparation needs runtime enablement and separate capped operator evidence", async () => {
  const plan = planXMoneyPayout(input());
  let calls = 0;
  const mock = {
    prepare: async () => {
      calls += 1;
      return { txs: [], steps: [], register: { hashedOnchainIds: [] } };
    },
  };
  const authorization = {
    approved: true,
    approvalRef: "approval:owner-1",
    custodyPolicyRef: "custody:policy-1",
    recipientScreeningRef: "screening:recipient-1",
    baseSettlementTxHash: hash("1"),
    maxBaseUsdcUnits: "2500000",
  };
  const previous = process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  delete process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  await assert.rejects(prepareAuthorizedXMoneyPayout(plan, authorization, mock), /disabled/);
  process.env.FORTUNE_XMONEY_PREPARE_ENABLED = "true";
  await assert.rejects(prepareAuthorizedXMoneyPayout(plan, { ...authorization, maxBaseUsdcUnits: "2499999" }, mock), /approved cap/);
  assert.equal(calls, 0);
  assert.deepEqual(await prepareAuthorizedXMoneyPayout(plan, authorization, mock), { txs: [], steps: [], register: { hashedOnchainIds: [] } });
  assert.equal(calls, 1);
  if (previous === undefined) delete process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  else process.env.FORTUNE_XMONEY_PREPARE_ENABLED = previous;
});

test("receipt reconciliation requires delivered provider evidence for every fill", () => {
  const order = {
    depositId: `${"0x" + "2".repeat(40)}_7`, state: "delivered", totalAmount: 2500000n, filledAmount: 2500000n,
    pendingAmount: 0n, returnedAmount: 0n, nextActions: [], isInFlight: false,
    payouts: [{ platform: "xmoney", platformHash: hash("3"), currency: "USD", currencyHash: hash("4"), payeeHash: hash("5"), active: true, pricing: { marketRate: true } }],
    fills: [{ intentHash: hash("6"), status: "FULFILLED", amount: 2500000n, buyer: `0x${"7".repeat(40)}`, fiatPaid: 2.5, paidCurrency: "USD", paymentId: "xmoney-payment-7", paidAt: 1_800_000_000, releasedAmount: 2500000n, fulfilledAt: 1_800_000_001 }],
    explain() { return "delivered"; },
  };
  const receipt = reconcileXMoneyReceipt(order);
  assert.equal(receipt.verified, true);
  assert.equal(receipt.paidUsd, 2.5);
  assert.deepEqual(receipt.paymentIds, ["xmoney-payment-7"]);
  assert.equal(reconcileXMoneyReceipt({ ...order, fills: [{ ...order.fills[0], paymentId: undefined }] }).verified, false);
  assert.equal(reconcileXMoneyReceipt({ ...order, state: "matched" }).verified, false);
});

test("public endpoints expose capability and preview, never the prepare call", async () => {
  const previous = process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  delete process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  const status = await GET();
  assert.equal(status.status, 200);
  const statusBody = (await status.json()).data;
  assert.equal(statusBody.corridor.platform, "xmoney");
  assert.deepEqual(statusBody.corridor.currencies, ["USD"]);
  assert.equal(statusBody.prepareEnabled, false);

  const request = (value) => new Request("https://fortune.test/api/public/v1/xmoney/preview", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
  });
  const response = await POST(request(input()));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.transactionReady, false);
  assert.equal((await POST(request({ ...input(), approved: true }))).status, 400);
  assert.equal((await POST(new Request("https://fortune.test", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await POST(new Request("https://fortune.test", { method: "POST", headers: { "content-type": "application/json" }, body: "null" }))).status, 400);
  assert.equal((await POST(request({ ...input(), sourceReference: "a".repeat(9000) }))).status, 413);
  if (previous === undefined) delete process.env.FORTUNE_XMONEY_PREPARE_ENABLED;
  else process.env.FORTUNE_XMONEY_PREPARE_ENABLED = previous;
});

test("the exact reviewed SDK release is pinned in both manifests", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@zkp2p/cash"], "0.8.0");
  assert.equal(lock.packages[""].dependencies["@zkp2p/cash"], "0.8.0");
  assert.equal(lock.packages["node_modules/@zkp2p/cash"].version, "0.8.0");
});

test("status discovery is synchronous and carries no signing authority", () => {
  const status = readXMoneyPayoutStatus({ capabilities() { return {
    chainId: 8453, token: { address: XMONEY_PAYOUT_RULES.baseUsdc, symbol: "USDC", decimals: 6 },
    destination: { chainId: 8453, token: { address: XMONEY_PAYOUT_RULES.baseUsdc, symbol: "USDC", decimals: 6 } },
    source: { default: { chainId: 8453, token: { address: XMONEY_PAYOUT_RULES.baseUsdc, symbol: "USDC", decimals: 6 } } },
    environment: "preproduction", platforms: [{ platform: "xmoney", currencies: ["USD"], pricing: { USD: { kind: "oracle-at-intent-signal", spreadBps: 0 } }, payeeHint: "X handle", requiresIdentityAttestation: false }],
  }; } });
  assert.equal(status.execution, "server-only unsigned prepare");
  assert.equal(status.corridor.requiresIdentityAttestation, false);
});
