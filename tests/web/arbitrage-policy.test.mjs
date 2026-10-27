import test from "node:test";
import assert from "node:assert/strict";
import { evaluateArbitrage, allocateRealizedProfit, emptyProfitLedger } from "../../lib/arbitrage-policy.ts";
const identity = "0x" + "12".repeat(32);
const zeroCosts = () => ({ gas: 0n, bridge: 0n, rebalance: 0n, other: 0n });
const opportunity = () => ({ buy: { chainId: 97, tokenIdentity: identity, tokenUnits: 1000n, accountingAsset: "USD:6", quoteAmount: 100_000_000n, quotedAtMs: 1000 }, sell: { chainId: 84532, tokenIdentity: identity, tokenUnits: 1000n, accountingAsset: "USD:6", quoteAmount: 110_000_000n, quotedAtMs: 1000 }, costs: { gas: 1_000_000n, bridge: 1_000_000n, rebalance: 1_000_000n, other: 0n }, nowMs: 2000, maxQuoteAgeMs: 2000, slippageBps: 100, minProfit: 1_000_000n, mode: "prefunded", sourceCash: 200_000_000n, destinationInventory: 1000n });

test("spread modeling subtracts all costs and adverse fills, never grants authority", () => {
  const r = evaluateArbitrage(opportunity());
  assert.equal(r.buyCeiling, 101_000_000n);
  assert.equal(r.sellFloor, 108_900_000n);
  assert.equal(r.modeledNet, 4_900_000n);
  assert.equal(r.candidate, true);
  assert.equal(r.executionAuthorized, false);
  const smaller = opportunity(); smaller.sell.quoteAmount = 104_000_000n;
  assert.equal(evaluateArbitrage(smaller).candidate, false);
});
test("future/stale quotes, insufficient inventory and sequential bridging remain blocked", () => {
  for (const change of [{ nowMs: 4001 }, { nowMs: 999 }, { sourceCash: 1n }, { destinationInventory: 999n }, { mode: "bridge-first" }]) assert.equal(evaluateArbitrage({ ...opportunity(), ...change }).candidate, false);
});
test("different tokens, denominations, quantities and mainnets cannot be silently compared", () => {
  for (const change of [{ accountingAsset: "BNB:18" }, { tokenIdentity: "0x" + "34".repeat(32) }, { tokenUnits: 1n }, { chainId: 56 }]) { const x = opportunity(); x.sell = { ...x.sell, ...change }; assert.throws(() => evaluateArbitrage(x)); }
  for (const slippageBps of [NaN, -1, 0.5, 10001]) assert.throws(() => evaluateArbitrage({ ...opportunity(), slippageBps }));
});

const cycle = (id, net) => ({ id, accountingAsset: "USD:6", receiptIds: ["97:0x" + id.padStart(64, "0") + ":0"], reconciled: true, inventoryDelta: 0n, proceeds: net >= 0n ? 100n + net : 100n, purchaseCost: net < 0n ? 100n - net : 100n, costs: zeroCosts() });
test("losses recover before a profit-funded buyback budget; capital is not revenue", () => {
  const loss = allocateRealizedProfit(emptyProfitLedger("USD:6", 3000), cycle("1", -30n));
  assert.equal(loss.lossCarry, 30n); assert.equal(loss.buybackBudget, 0n);
  const partial = allocateRealizedProfit(loss, cycle("2", 10n));
  assert.equal(partial.lossCarry, 20n); assert.equal(partial.buybackBudget, 0n);
  const win = allocateRealizedProfit(partial, cycle("3", 100n));
  assert.equal(win.lossCarry, 0n); assert.equal(win.buybackBudget, 24n); assert.equal(win.retainedProfit, 56n);
  assert.equal(partial.processedCycles.length, 2, "pure ledger leaves its input unchanged");
});
test("retries and reused receipts cannot allocate profit twice", () => {
  const c = cycle("1", 100n), ledger = allocateRealizedProfit(emptyProfitLedger("USD:6", 3000), c);
  assert.throws(() => allocateRealizedProfit(ledger, c));
  assert.throws(() => allocateRealizedProfit(ledger, { ...c, id: "other" }));
  for (const change of [{ reconciled: false }, { reconciled: "true" }, { inventoryDelta: 1n }, { receiptIds: [] }, { proceeds: -1n }, { receiptIds: [c.receiptIds[0], c.receiptIds[0]] }]) assert.throws(() => allocateRealizedProfit(emptyProfitLedger("USD:6", 3000), { ...c, ...change }));
});
test("integer allocation never spends more than distributable profit, including rounding", () => {
  for (let n = 0n; n <= 200n; n++) for (const share of [0, 1, 3000, 9999, 10000]) {
    const result = allocateRealizedProfit(emptyProfitLedger("USD:6", share), cycle("1", n));
    assert.equal(result.buybackBudget + result.retainedProfit, n);
    assert.ok(result.buybackBudget >= 0n && result.retainedProfit >= 0n);
  }
});

test("settlements retain the launch policy and cannot mix accounting denominations", () => {
  assert.throws(() => emptyProfitLedger(undefined, 3000));
  assert.throws(() => emptyProfitLedger("USD:6", 10001));
  const first = allocateRealizedProfit(emptyProfitLedger("USD:6", 3000), cycle("1", 100n));
  const second = allocateRealizedProfit(first, cycle("2", 100n));
  assert.deepEqual(second.policy, { accountingAsset: "USD:6", buybackBps: 3000 });
  assert.equal(second.buybackBudget, 60n);
  assert.throws(() => allocateRealizedProfit(first, { ...cycle("3", 100n), accountingAsset: "BNB:18" }));
});
