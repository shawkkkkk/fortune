import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync, chmodSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { ReportedStrategyProfitBook as Book } from "../../scripts/reported-strategy-profit-book.mjs";
import { allocateRealizedProfit, emptyProfitLedger } from "../../lib/arbitrage-policy.ts";

const policy = () => ({ scopeId: "fixture_strategy", accountingAsset: "fixture:6", buybackBps: 1250 });
const receipt = n => `97:0x${BigInt(n).toString(16).padStart(64, "0")}:0`;
const cycle = (id, n = 1, net = 100n) => ({ id, accountingAsset: "fixture:6", receiptIds: [receipt(n)], reconciled: true, inventoryDelta: 0n,
  proceeds: net >= 0n ? 113n + net : 113n, purchaseCost: net >= 0n ? 100n : 100n - net,
  costs: { gas: 7n, bridge: 3n, rebalance: 2n, other: 1n } });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "fortune-reported-profit-")), path = join(dir, "book.sqlite");
  Book.initialize(path, policy(), { enabled: true, now: 1000 });
  return { dir, path, open: options => new Book(path, policy(), { enabled: true, readOnly: false, now: () => 1000, ...options }), clean: () => rmSync(dir, { recursive: true, force: true }) };
}
function rows(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return ["profit_book", "profit_cycles", "profit_receipts"].map(t => db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()); } finally { db.close(); }
}

test("profit book is disabled before filesystem access; explicit initialization and protected policy are required", () => {
  const dir = mkdtempSync(join(tmpdir(), "fortune-profit-disabled-")), path = join(dir, "missing.sqlite");
  try {
    assert.throws(() => Book.initialize(path, policy()), /disabled/); assert.throws(() => new Book(path, policy()), /disabled/); assert.equal(existsSync(path), false);
    assert.throws(() => Book.initialize(":memory:", policy(), { enabled: true, now: 1000 }), /Durable/);
    const probe = spawnSync(process.execPath, ["--import", resolve("scripts/register-ts.mjs"), "--input-type=module", "-e",
      `import {ReportedStrategyProfitBook as Book} from ${JSON.stringify(resolve("scripts/reported-strategy-profit-book.mjs"))};
try{Book.initialize('file:probe?mode=memory',${JSON.stringify(policy())},{enabled:true,now:1000});process.exitCode=1;}catch{process.exitCode=0;}`], { cwd: dir });
    assert.equal(probe.status, 0, "SQLite URI-like memory path must reject before creating a file"); assert.equal(existsSync(join(dir, "file:probe?mode=memory")), false);
    assert.throws(() => new Book(path, policy(), { enabled: true })); assert.equal(existsSync(path), false);
    Book.initialize(path, policy(), { enabled: true, now: 1000 }); assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.throws(() => Book.initialize(path, policy(), { enabled: true, now: 1000 }));
    const ro = new Book(path, policy(), { enabled: true, now: () => 1000 });
    try { assert.equal(ro.read().total, 0); assert.throws(() => ro.appendReportedCycle({ cycle: cycle("a"), expectedHead: ro.read().head }), /read-only/); } finally { ro.close(); }
    for (const change of [{ scopeId: "other" }, { accountingAsset: "other:6" }, { buybackBps: 0 }, { extra: true }]) assert.throws(() => new Book(path, { ...policy(), ...change }, { enabled: true, now: () => 1000 }));
    const alias = join(dir, "alias.sqlite"); symlinkSync(path, alias); assert.throws(() => new Book(alias, policy(), { enabled: true })); rmSync(alias);
    linkSync(path, alias); assert.throws(() => new Book(path, policy(), { enabled: true })); rmSync(alias);
    chmodSync(path, 0o644); assert.throws(() => new Book(path, policy(), { enabled: true }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("actual reducer cost/loss history survives reopen and old exact retries preserve original time without duplicating allocations", () => {
  const f = fixture(); let b;
  try {
    b = f.open(); const initial = b.read().head, reports = [cycle("loss", 1, -30n), cycle("partial", 2, 10n), cycle("profit", 3, 100n)];
    let ledger = emptyProfitLedger("fixture:6", 1250), first;
    for (const c of reports) { const r = b.appendReportedCycle({ cycle: c, expectedHead: b.read().head }); first ??= r; ledger = allocateRealizedProfit(ledger, c); }
    const view = b.read(); assert.equal(view.reportedLossCarry, "0"); assert.equal(view.modeledBuybackAllocation, "10"); assert.equal(view.modeledRetainedProfit, "70");
    assert.equal(view.modeledBuybackAllocation, ledger.buybackBudget.toString()); assert.equal(view.total, 3);
    for (const key of ["receiptAuthenticationVerified", "inventoryVerified", "costsVerified", "realizedProfitVerified", "capitalProvenanceVerified", "independentProvidersVerified", "finalityVerified", "buybackExecuted", "executionAuthorized", "fullStrategyReadiness"]) assert.equal(view[key], false);
    assert.equal(view.currentAuthorization, null); b.close(); b = f.open({ now: () => 2000 });
    const retry = b.appendReportedCycle({ cycle: reports[0], expectedHead: initial });
    assert.equal(retry.inserted, false); assert.equal(retry.sequence, first.sequence); assert.equal(retry.digest, first.digest); assert.equal(retry.recordedAtMs, 1000);
    assert.deepEqual(b.read(), view); assert.equal(rows(f.path)[0][0].last_clock, 1000);
  } finally { b?.close(); f.clean(); }
});

test("changed retries, stale heads, receipt aliases and invalid reported economics never consume history", () => {
  const f = fixture(); let b;
  try {
    b = f.open(); const firstHead = b.read().head, c = cycle("first"); b.appendReportedCycle({ cycle: c, expectedHead: firstHead }); const before = rows(f.path), current = b.read().head;
    const rejected = [
      { cycle: { ...c, proceeds: c.proceeds + 1n }, expectedHead: firstHead }, { cycle: c, expectedHead: current },
      { cycle: cycle("stale", 2), expectedHead: firstHead }, { cycle: cycle("reused", 1), expectedHead: current },
      ...[{ reconciled: false }, { inventoryDelta: 1n }, { id: 2 }, { proceeds: -1n }, { proceeds: 1n << 128n }, { costs: { ...c.costs, other: "1" } },
        { receiptIds: [receipt(2) + "0"] }, { receiptIds: [receipt(2).replace(/^97:/, "56:")] }, { receiptIds: Array(1) }, { extra: true }]
        .map(change => ({ cycle: { ...cycle("invalid", 2), ...change }, expectedHead: current })),
    ];
    for (const r of rejected) { assert.throws(() => b.appendReportedCycle(r)); assert.deepEqual(rows(f.path), before); }
    let changing; b.close(); b = f.open({ now: () => { if (changing) changing.expectedHead = current; return 1000; } });
    changing = { cycle: cycle("clock_mutation", 2), expectedHead: firstHead };
    assert.throws(() => b.appendReportedCycle(changing), /head/); assert.deepEqual(rows(f.path), before);
  } finally { b?.close(); f.clean(); }
});

test("late invalid/reversed clocks roll back cycle, receipt index and metadata together; final observed clock is persisted", () => {
  for (const ended of [999, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); let b, sequence = [1000], i = 0;
    try {
      b = f.open({ now: () => sequence[Math.min(i++, sequence.length - 1)] }); const head = b.read().head, before = rows(f.path);
      sequence = [1000, 1000, ended]; i = 0; assert.throws(() => b.appendReportedCycle({ cycle: cycle("a"), expectedHead: head }), /clock/);
      assert.deepEqual(rows(f.path), before); b.close(); b = f.open(); assert.equal(b.read().total, 0);
      b.appendReportedCycle({ cycle: cycle("a"), expectedHead: head }); assert.equal(b.read().total, 1);
    } finally { b?.close(); f.clean(); }
  }
  const f = fixture(); let b, sequence = [1000], i = 0;
  try { b = f.open({ now: () => sequence[Math.min(i++, sequence.length - 1)] }); const head = b.read().head; sequence = [1000, 1000, 1020]; i = 0;
    b.appendReportedCycle({ cycle: cycle("a"), expectedHead: head }); b.close(); b = null;
    assert.equal(rows(f.path)[0][0].last_clock, 1020); assert.throws(() => f.open({ now: () => 1010 }), /clock/);
  } finally { b?.close(); f.clean(); }
});

test("changed stored schema, policy, hash history and receipt index fail closed without repair", () => {
  for (const sql of ["UPDATE profit_book SET version=2", "UPDATE profit_book SET last_clock=999", "UPDATE profit_cycles SET cycle_id='other'",
    "UPDATE profit_cycles SET document='{}'", "UPDATE profit_cycles SET recorded_at=999", "DELETE FROM profit_receipts", "CREATE TABLE foreign_data(value TEXT)"]) {
    const f = fixture(); let b;
    try { b = f.open(); b.appendReportedCycle({ cycle: cycle("a"), expectedHead: b.read().head }); b.close(); b = null;
      const db = new DatabaseSync(f.path); try { db.exec(sql); } finally { db.close(); }
      const before = rows(f.path); assert.throws(() => f.open()); assert.deepEqual(rows(f.path), before);
    } finally { b?.close(); f.clean(); }
  }
});

test("bounded book preserves cumulative uint128 limits and stops at 256 cycles without pruning, while exact retries remain readable", () => {
  const f = fixture(); let b;
  try {
    b = f.open(); const initial = b.read().head, first = cycle("c1", 1, 0n);
    for (let n = 1; n <= 256; n++) b.appendReportedCycle({ cycle: cycle(`c${n}`, n, 0n), expectedHead: b.read().head });
    const before = rows(f.path); assert.throws(() => b.appendReportedCycle({ cycle: cycle("overflow", 257), expectedHead: b.read().head }), /capacity/);
    assert.equal(b.appendReportedCycle({ cycle: first, expectedHead: initial }).inserted, false); assert.deepEqual(rows(f.path), before);
    assert.equal(b.read().entries.length, 256);
  } finally { b?.close(); f.clean(); }
  const g = fixture();
  try { b = g.open(); const max = (1n << 128n) - 1n, c = { ...cycle("max"), proceeds: max, purchaseCost: 0n, costs: { gas: 0n, bridge: 0n, rebalance: 0n, other: 0n } };
    b.appendReportedCycle({ cycle: c, expectedHead: b.read().head }); const before = rows(g.path);
    assert.throws(() => b.appendReportedCycle({ cycle: { ...cycle("overflow", 2), proceeds: max, purchaseCost: 0n, costs: c.costs }, expectedHead: b.read().head })); assert.deepEqual(rows(g.path), before);
  } finally { b?.close(); g.clean(); }
});

test("two actual worker processes serialize same-report retries and reject competing stale reports without duplicate consumption", async () => {
  const f = fixture(); let b;
  try {
    const worker = join(f.dir, "worker.mjs"), loader = resolve("scripts/register-ts.mjs"), modulePath = resolve("scripts/reported-strategy-profit-book.mjs");
    writeFileSync(worker, `import {writeFileSync,existsSync} from 'node:fs'; import {ReportedStrategyProfitBook as Book} from ${JSON.stringify(modulePath)};
const [path,head,id,ready,go,n]=process.argv.slice(2), b=new Book(path,${JSON.stringify(policy())},{enabled:true,readOnly:false,now:()=>1000});
writeFileSync(ready,'ready'); while(!existsSync(go))await new Promise(r=>setTimeout(r,5));
try{const r=b.appendReportedCycle({expectedHead:head,cycle:{id,accountingAsset:'fixture:6',receiptIds:['97:0x'+BigInt(n).toString(16).padStart(64,'0')+':0'],reconciled:true,inventoryDelta:0n,proceeds:100n,purchaseCost:0n,costs:{gas:0n,bridge:0n,rebalance:0n,other:0n}}});console.log(JSON.stringify(r));}catch{console.log(JSON.stringify({rejected:true}));}finally{b.close();}`);
    for (const same of [true, false]) {
      b = f.open(); const head = b.read().head, before = b.read().total; b.close(); b = null;
      const go = join(f.dir, `go-${same}`), ready = [0, 1].map(i => join(f.dir, `ready-${same}-${i}`));
      const children = [0, 1].map(i => spawn(process.execPath, ["--import", loader, worker, f.path, head, same ? "same" : `other${i}`, ready[i], go, same ? "1" : "2"], { stdio: ["ignore", "pipe", "pipe"] }));
      const outputs = children.map(c => { let output = ""; c.stdout.on("data", x => output += x); return once(c, "exit").then(([code]) => { assert.equal(code, 0); return JSON.parse(output); }); });
      const deadline = Date.now() + 15000; while (!ready.every(existsSync) && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
      if (!ready.every(existsSync)) { for (const c of children) c.kill(); throw Error("Workers failed to start"); }
      writeFileSync(go, "go"); const result = await Promise.all(outputs); assert.equal(result.filter(r => r.inserted === true).length, 1);
      assert.equal(result.filter(r => same ? r.inserted === false : r.rejected === true).length, 1);
      b = f.open(); assert.equal(b.read().total, before + 1); b.close(); b = null;
    }
  } finally { b?.close(); f.clean(); }
});

test("post-metadata invalid or reversed clock rolls back all profit tables and allows only explicit retry", () => {
  for (const final of [1015, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); let b, samples = [1000], i = 0;
    try {
      b = f.open({ now: () => samples[Math.min(i++, samples.length - 1)] });
      const head = b.read().head, before = rows(f.path), request = { cycle: cycle("late_clock"), expectedHead: head };
      samples = [1000, 1010, 1020, final]; i = 0;
      assert.throws(() => b.appendReportedCycle(request), /clock/);
      assert.deepEqual(rows(f.path), before); b.close(); b = f.open();
      assert.equal(b.read().total, 0); assert.deepEqual(rows(f.path), before);
      assert.equal(b.appendReportedCycle(request).inserted, true); assert.equal(b.read().total, 1);
    } finally { b?.close(); f.clean(); }
  }
});

test("valid final clock check preserves original record, digest and metadata sample without retry renewal", () => {
  const f = fixture(); let b, samples = [1000], i = 0;
  try {
    b = f.open({ now: () => samples[Math.min(i++, samples.length - 1)] });
    const head = b.read().head, request = { cycle: cycle("late_valid"), expectedHead: head };
    samples = [1000, 1010, 1020, 1030]; i = 0;
    const result = b.appendReportedCycle(request);
    assert.equal(result.recordedAtMs, 1010); assert.equal(rows(f.path)[0][0].last_clock, 1020);
    b.close(); b = f.open({ now: () => 2000 }); const before = rows(f.path);
    const retry = b.appendReportedCycle(request); assert.equal(retry.inserted, false);
    assert.equal(retry.digest, result.digest); assert.equal(retry.recordedAtMs, 1010); assert.deepEqual(rows(f.path), before);
  } finally { b?.close(); f.clean(); }
});
