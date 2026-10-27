import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillMarketHash, readVerifiedFill } from "../../lib/arbitrage-receipts.ts";
import { ArbitrageFillJournal } from "../../scripts/arbitrage-fill-journal.mjs";
import { market, vaultMarket, receiptClient, TX, a } from "../fixtures/arbitrage-receipts.mjs";
const clients = options => [receiptClient({ vault: true, ...options }), receiptClient({ vault: true, ...options })];

test("direct-router journal identity is unchanged; vault code/operator policy is separately bound", () => {
  assert.equal(fillMarketHash(market()), "0xedef2fc83192a707d98e78be98eb7185d999691f8b6de9a7345dc82fb9024a46");
  assert.notEqual(fillMarketHash(vaultMarket()), fillMarketHash(market()));
  assert.notEqual(fillMarketHash(vaultMarket()), fillMarketHash({ ...vaultMarket(), vault: { ...vaultMarket().vault, operator: a(8) } }));
  for (const vault of [null, {}, { ...vaultMarket().vault, operator: a(1) }]) assert.throws(() => fillMarketHash({ ...market(), vault }));
});
test("vault receipts reconcile submitted order, execution event, pool deltas and actual gas payer", async () => {
  for (const sell of [false, true]) {
    const r = await readVerifiedFill(clients({ sell }), vaultMarket(), TX);
    assert.equal(r.side, sell ? "sell" : "buy"); assert.equal(r.executionVault, a(1)); assert.equal(r.gasPayer, a(7));
    assert.equal(r.authorizationEpoch, "3"); assert.equal(r.executionNonce, "8"); assert.equal(r.nativeGasCost, "50000");
    assert.equal(r.executionAuthorized, false);
  }
});
test("missing or inconsistent execution evidence cannot be inferred from pool transfers", async () => {
  for (const option of [{ noVaultEvent: true }, { duplicateVaultEvent: true }, { badVaultNonce: true }, { badVaultAmount: true }, { badVaultMinimum: true }, { input: "0x01020304" }, { badVaultCode: true }, { wrongWallet: true }]) await assert.rejects(readVerifiedFill(clients(option), vaultMarket(), TX));
  await assert.rejects(readVerifiedFill(clients(), market(), TX), /provenance/);
  await assert.rejects(readVerifiedFill([receiptClient(), receiptClient()], vaultMarket(), TX), /provenance/);
});
test("verified vault fills use the durable journal without duplicate profit or lost execution provenance", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fortune-vault-receipt-"));
  try {
    const file = join(dir, "vault.sqlite");
    let db = new ArbitrageFillJournal(file, vaultMarket());
    assert.equal(db.record(await readVerifiedFill(clients(), vaultMarket(), TX)).inserted, true); db.close();
    db = new ArbitrageFillJournal(file, vaultMarket());
    assert.equal(db.record(await readVerifiedFill(clients(), vaultMarket(), TX)).inserted, false);
    assert.equal(db.list().length, 1); assert.equal(db.list()[0].fill.executionNonce, "8"); assert.equal(db.list()[0].fill.gasPayer, a(7));
    assert.equal(db.list()[0].fill.executionAuthorized, false); db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
