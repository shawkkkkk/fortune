import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fillMarketHash, readVerifiedFill, isVerifiedFill } from "../../lib/arbitrage-receipts.ts";
import { ArbitrageFillJournal } from "../../scripts/arbitrage-fill-journal.mjs";
import { market, receiptClient, TX, h } from "../fixtures/arbitrage-receipts.mjs";
const clients = (options = {}) => [receiptClient(options), receiptClient(options)];
const fill = options => readVerifiedFill(clients(options), market(), TX);

test("both venue event formats reconcile actual wallet deltas and native gas in fixture receipts", async () => {
  for (const sell of [false, true]) for (const uniswap of [false, true]) {
    const m = { ...market(), eventKind: uniswap ? "uniswap-v3" : "pancake-v3" };
    const r = await readVerifiedFill(clients({ sell, uniswap }), m, TX);
    assert.equal(r.side, sell ? "sell" : "buy"); assert.equal(r.tokenUnits, "1000");
    assert.equal(r.settlementUnits, sell ? "120" : "100"); assert.equal(r.nativeGasCost, "50000");
    assert.equal(r.receiptId, `97:${TX}:2`); assert.equal(r.executionAuthorized, false);
    assert.ok(Object.isFrozen(r)); assert.ok(isVerifiedFill(r)); assert.equal(isVerifiedFill({ ...r }), false);
  }
});

test("receipt verifier rejects chain, depth, custody, pool, code, ambiguous transfers and reorg failures", async () => {
  for (const options of [{ chainId: 56 }, { shallow: true }, { reverted: true }, { wrongWallet: true }, { nativeValue: true }, { txType: "eip4844" }, { txType: "eip7702" }, { wrongCode: true }, { wrongPool: true }, { wrongDecimals: true }, { badTransfer: true }, { badRecipient: true }, { extraTransfer: true }, { duplicateSwap: true }, { duplicateIndex: true }, { removed: true }, { reorg: true }, { unavailable: true }]) await assert.rejects(fill(options));
  await assert.rejects(readVerifiedFill([receiptClient(), receiptClient({ gasPrice: 2n })], market(), TX), /disagree/);
  await assert.rejects(readVerifiedFill([receiptClient(), receiptClient({ input: "0x05060708" })], market(), TX), /disagree/);
  const one = receiptClient(); await assert.rejects(readVerifiedFill([one, one], market(), TX), /distinct/);
  assert.throws(() => fillMarketHash({ ...market(), chainId: 56 }));
  assert.throws(() => fillMarketHash({ ...market(), chainId: 84532 }), /L1\/data-fee/);
});

test("disk journal survives restart, deduplicates retries and rejects forged fills or policy changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fortune-fill-")), path = join(dir, "fills.sqlite");
  try {
    const r = await fill();
    let db = new ArbitrageFillJournal(path, market());
    assert.throws(() => db.record({ ...r }), /verified/);
    assert.equal(db.record(r).inserted, true); db.close();
    db = new ArbitrageFillJournal(path, market());
    assert.equal(db.record(await fill()).inserted, false);
    assert.equal(db.list().length, 1); assert.equal(db.list()[0].state, "observed");
    assert.equal(db.list()[0].fill.nativeGasCost, "50000");
    assert.ok(Number.isSafeInteger(db.list()[0].observedAtMs));
    assert.throws(() => db.list(1001)); db.close();
    assert.throws(() => new ArbitrageFillJournal(path, { ...market(), confirmations: 21 }), /policy differs/);
    assert.throws(() => new ArbitrageFillJournal(":memory:", market()), /Durable/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("changed receipt evidence and failed rechecks persist quarantine without silently restoring trust", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fortune-quarantine-")), path = join(dir, "fills.sqlite");
  try {
    let db = new ArbitrageFillJournal(path, market());
    db.record(await fill());
    assert.throws(() => db.record({}), /verified/);
    const moved = await fill({ blockHash: h(101) });
    assert.throws(() => db.record(moved), /quarantined/); db.close();
    db = new ArbitrageFillJournal(path, market());
    assert.equal(db.list()[0].state, "quarantined");
    assert.equal(db.conflicts().length, 1);
    assert.equal(db.conflicts()[0].blockHash, h(101));
    const retry = await fill();
    assert.throws(() => db.record(retry), /quarantined/);
    db.close();
    db = new ArbitrageFillJournal(join(dir, "unavailable.sqlite"), market());
    db.record(retry);
    await assert.rejects(db.refresh(clients({ unavailable: true }), TX));
    assert.equal(db.list()[0].state, "quarantined");
    await assert.rejects(db.refresh(clients(), TX), /quarantined/);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("read-only worker CLI fails closed without leaking provider credentials or filesystem details", () => {
  const r = spawnSync(process.execPath, ["--import", "./scripts/register-ts.mjs", "scripts/journal-arbitrage-fill.mjs", "missing-private-manifest.json", "private-database.sqlite", TX], {
    encoding: "utf8", env: { ...process.env, FORTUNE_ARBITRAGE_READ_RPC_URL: "https://secret-provider.invalid/private-key" },
  });
  assert.equal(r.status, 1); assert.equal(r.stdout, "");
  assert.match(r.stderr, /no trade or profit allocation was submitted/);
  assert.doesNotMatch(r.stderr, /secret-provider|private-key|missing-private-manifest|private-database/);
});

test("two worker processes racing the same receipt commit exactly one journal row", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "fortune-race-")), path = join(dir, "fills.sqlite");
  const worker = `
    import { ArbitrageFillJournal } from './scripts/arbitrage-fill-journal.mjs';
    import { readVerifiedFill } from './lib/arbitrage-receipts.ts';
    import { market, receiptClient, TX } from './tests/fixtures/arbitrage-receipts.mjs';
    const db=new ArbitrageFillJournal(process.argv[1],market());
    const fill=await readVerifiedFill([receiptClient(),receiptClient()],market(),TX);
    process.send('ready');
    process.once('message',()=>{ const r=db.record(fill); db.close(); process.send(r); process.disconnect(); });
  `;
  const children = [];
  try {
    new ArbitrageFillJournal(path, market()).close();
    for (let i = 0; i < 2; i++) children.push(spawn(process.execPath, ["--import", "./scripts/register-ts.mjs", "--input-type=module", "-e", worker, path], { stdio: ["ignore", "ignore", "pipe", "ipc"] }));
    await Promise.all(children.map(async child => { const [m] = await once(child, "message"); assert.equal(m, "ready"); }));
    const results = children.map(child => once(child, "message")); const exits = children.map(child => once(child, "exit"));
    children.forEach(child => child.send("go"));
    const rows = (await Promise.all(results)).map(([r]) => r);
    assert.deepEqual(rows.map(r => r.inserted).sort(), [false, true]);
    assert.ok((await Promise.all(exits)).every(([code]) => code === 0));
    const db = new ArbitrageFillJournal(path, market()); assert.equal(db.list().length, 1); db.close();
  } finally { children.forEach(child => child.kill()); rmSync(dir, { recursive: true, force: true }); }
});
