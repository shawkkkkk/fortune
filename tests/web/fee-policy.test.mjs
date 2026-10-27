import test from "node:test";
import assert from "node:assert/strict";
import { allocateReceivedFees, protocolRecirculation } from "../../lib/fee-policy.ts";

test("received fees reconcile exactly without reassigning rounding dust", () => {
  for (let n = 0n; n < 200n; n++) {
    const result = allocateReceivedFees(n, "pair", [{ bucket: "holders", bps: 8000 }, { bucket: "creator", bps: 500 }, { bucket: "operations", bps: 500 }, { bucket: "protocol", bps: 1000 }]);
    assert.equal(result.amounts.reduce((sum, a) => sum + a.amount, result.roundingRemainder), n);
    assert.ok(result.roundingRemainder >= 0n && result.roundingRemainder < 4n);
    const protocol = result.amounts.find(a => a.bucket === "protocol").amount;
    const sub = protocolRecirculation(protocol, 1000);
    assert.equal(sub.recirculate + sub.retainedProtocol, protocol);
  }
});
test("token-side fees cannot be sold or allocated to rewards or revenue", () => {
  for (const bucket of ["holders", "creator", "operations", "protocol"]) assert.throws(() => allocateReceivedFees(100n, "launch-token", [{ bucket, bps: 10000 }]));
  assert.equal(allocateReceivedFees(123n, "launch-token", [{ bucket: "burn", bps: 10000 }]).amounts[0].amount, 123n);
});
test("malformed economics are rejected rather than coerced", () => {
  for (const bps of [-1, 0, 1.5, NaN, Infinity, "10000", 10001]) assert.throws(() => allocateReceivedFees(1n, "pair", [{ bucket: "protocol", bps }]));
  assert.throws(() => allocateReceivedFees(-1n, "pair", [{ bucket: "protocol", bps: 10000 }]));
  assert.throws(() => allocateReceivedFees(1n, "pair", [{ bucket: "holders", bps: 5000 }, { bucket: "holders", bps: 5000 }]));
  assert.throws(() => allocateReceivedFees(1n, "pair", [{ bucket: "fake", bps: 10000 }]));
  assert.throws(() => protocolRecirculation(1n, 10001));
  assert.throws(() => protocolRecirculation(-1n, 500));
});
