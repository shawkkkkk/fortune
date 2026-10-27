import test from "node:test";
import assert from "node:assert/strict";
import { planOmnichain, reconcileOmnichainSupply, quoteOmnichainUnits } from "../../lib/omnichain-plan.ts";
import { registerHooks } from "node:module";
// Native Node ESM needs the extension; Next's bundler resolves this itself.
registerHooks({ resolve(s, context, next) { return next(s === "next/server" ? "next/server.js" : s, context); } });
const { POST } = await import("../../app/api/public/v1/omnichain/preview/route.ts");

const input = () => ({ name: "Lucky", symbol: "LUCK", globalSupply: "1000000000", allocations: [{ chainId: 97, supply: "600000000" }, { chainId: 84532, supply: "400000000" }] });
test("one global supply, canonical order and unconditional non-executable plan", () => {
  const first = planOmnichain(input());
  assert.deepEqual(first, planOmnichain({ ...input(), allocations: input().allocations.reverse() }));
  assert.equal(first.transactionReady, false);
  assert.equal(first.allocations.reduce((sum, a) => sum + BigInt(a.supplyUnits), 0n), 1000000000n * 10n ** 18n);
  assert.equal(first.blockers.length, 4);
});
test("unsafe chain, supply, input and pretend approval combinations fail closed", () => {
  for (const bad of [null, [], {}, { ...input(), transactionReady: true }, { ...input(), name: "猫".repeat(22) }, { ...input(), symbol: "a\n" }, { ...input(), globalSupply: "1e9" }, { ...input(), globalSupply: 1000000000 }, { ...input(), globalSupply: "18446744073710" }, { ...input(), allocations: [{ chainId: 56, supply: "600000000" }, input().allocations[1]] }, { ...input(), allocations: [input().allocations[0], input().allocations[0]] }, { ...input(), allocations: input().allocations.map(a => ({ ...a, supply: "1000000000" })) }]) assert.throws(() => planOmnichain(bad));
});
test("in-flight transport and permanent burns reconcile without double counting", () => {
  assert.equal(reconcileOmnichainSupply(1000n, [400n, 500n], 80n, 20n).balanced, true);
  assert.equal(reconcileOmnichainSupply(1000n, [400n, 580n], 0n, 20n).balanced, true);
  assert.equal(reconcileOmnichainSupply(1000n, [400n, 580n], 80n, 20n).balanced, false);
  assert.throws(() => reconcileOmnichainSupply(1000n, [1000n], -1n, 0n));
  for (const n of [0n, 1n, 999999999999n, 1000000000000n, 1234567890123456789n]) {
    const q = quoteOmnichainUnits(n);
    assert.equal(q.transferable + q.dust, n);
    assert.equal(q.transferable % 1000000000000n, 0n);
  }
});
test("public preview returns stable IDs but no transaction authority", async () => {
  const request = value => new Request("https://fortune.test/api/public/v1/omnichain/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  const a = await POST(request(input())), b = await POST(request({ ...input(), allocations: input().allocations.reverse() }));
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("cache-control"), "no-store");
  const x = (await a.json()).data, y = (await b.json()).data;
  assert.equal(x.planId, y.planId);
  assert.equal(x.transactionReady, false);
  assert.equal((await POST(request({ ...input(), approved: true }))).status, 400);
  assert.equal((await POST(request({ ...input(), name: "a".repeat(9000) }))).status, 413);
  assert.equal((await POST(new Request("https://fortune.test", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await POST(new Request("https://fortune.test", { method: "POST", headers: { "content-type": "application/json" }, body: "null" }))).status, 400);
});
