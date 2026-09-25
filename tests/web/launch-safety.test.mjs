import test from "node:test";
import assert from "node:assert/strict";
import { parseLaunchAmount, assertWalletIdentity, restorePendingLaunch } from "../../lib/launch-safety.ts";

const account = "0x" + "11".repeat(20);
const factory = "0x" + "22".repeat(20);
const hash = "0x" + "33".repeat(32);

test("amounts preserve exact units and reject rounding, signs, exponents and overflow", () => {
  assert.equal(parseLaunchAmount("Buy", "0.000001", 6), 1n);
  assert.equal(parseLaunchAmount("Buy", " 1.25 ", 18), 1250000000000000000n);
  for (const value of ["-1", "1e3", "NaN", "Infinity", "+1", "1.0000001", (2n ** 256n).toString()]) {
    assert.throws(() => parseLaunchAmount("Buy", value, 6));
  }
});

test("wallet network and account must still match immediately before signing", async () => {
  let chain = "0x38";
  let accounts = [account];
  const provider = { request: async ({ method }) => method === "eth_chainId" ? chain : accounts };
  await assertWalletIdentity(provider, account, 56);
  chain = "0x61";
  await assert.rejects(assertWalletIdentity(provider, account, 56), /network changed/);
  chain = "0x38";
  accounts = [factory];
  await assert.rejects(assertWalletIdentity(provider, account, 56), /account changed/);
  accounts = [];
  await assert.rejects(assertWalletIdentity(provider, account, 56), /account changed/);
});

test("saved transactions are scoped to chain and factory and malformed storage is ignored", () => {
  const value = { hash, account, chainId: 56, factory };
  assert.deepEqual(restorePendingLaunch(JSON.stringify(value), 56, factory), value);
  assert.equal(restorePendingLaunch(JSON.stringify(value), 97, factory), null);
  assert.equal(restorePendingLaunch(JSON.stringify(value), 56, account), null);
  assert.equal(restorePendingLaunch("{broken", 56, factory), null);
  assert.equal(restorePendingLaunch(JSON.stringify({ ...value, hash: "javascript:bad" }), 56, factory), null);
});
