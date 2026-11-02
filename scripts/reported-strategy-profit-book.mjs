// Local operator reports only. No receipt authentication, cash custody or execution.
import { DatabaseSync } from "node:sqlite";
import { constants, openSync, closeSync, lstatSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import { emptyProfitLedger, allocateRealizedProfit } from "../lib/arbitrage-policy.ts";

const LIMIT = 256, MAX = (1n << 128n) - 1n;
const SCHEMA = [
  "CREATE TABLE profit_book(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,book_id TEXT NOT NULL,policy TEXT NOT NULL,last_clock INTEGER NOT NULL)",
  "CREATE TABLE profit_cycles(sequence INTEGER PRIMARY KEY,cycle_id TEXT NOT NULL UNIQUE,previous TEXT NOT NULL,digest TEXT NOT NULL UNIQUE,recorded_at INTEGER NOT NULL,document TEXT NOT NULL)",
  "CREATE TABLE profit_receipts(receipt_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL)",
];
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exact = (value, keys) => {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).some(k => typeof k !== "string")
    || Reflect.ownKeys(value).sort().join() !== [...keys].sort().join()
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !("value" in d))) throw Error("Literal fields required");
};
const time = value => { if (!Number.isSafeInteger(value) || value < 0) throw Error("Invalid book clock"); return value; };
const quantity = value => { if (typeof value !== "bigint" || value < 0n || value > MAX) throw Error("Invalid report amount"); return value.toString(); };
const decimal = value => { if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,38})$/.test(value) || BigInt(value) > MAX) throw Error("Invalid stored amount"); return BigInt(value); };
function policy(value) {
  exact(value, ["scopeId", "accountingAsset", "buybackBps"]);
  if (typeof value.scopeId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.scopeId)) throw Error("Scope label required");
  emptyProfitLedger(value.accountingAsset, value.buybackBps);
  return { scopeId: value.scopeId, accountingAsset: value.accountingAsset, buybackBps: value.buybackBps };
}
function document(cycle, p) {
  exact(cycle, ["id", "accountingAsset", "receiptIds", "reconciled", "inventoryDelta", "proceeds", "purchaseCost", "costs"]);
  exact(cycle.costs, ["gas", "bridge", "rebalance", "other"]);
  if (!Array.isArray(cycle.receiptIds) || cycle.receiptIds.length > 32) throw Error("Dense receipt list required");
  const receiptIds = Array.from({ length: cycle.receiptIds.length }, (_, i) => Object.getOwnPropertyDescriptor(cycle.receiptIds, i)?.value);
  if (receiptIds.some(x => typeof x !== "string")) throw Error("Dense receipt list required");
  const d = { id: cycle.id, accountingAsset: cycle.accountingAsset, receiptIds, reconciled: cycle.reconciled,
    inventoryDelta: quantity(cycle.inventoryDelta), proceeds: quantity(cycle.proceeds), purchaseCost: quantity(cycle.purchaseCost),
    costs: Object.fromEntries(["gas", "bridge", "rebalance", "other"].map(k => [k, quantity(cycle.costs[k])])) };
  if (Buffer.byteLength(JSON.stringify(d)) > 8192) throw Error("Report byte bound");
  // The unchanged reducer enforces IDs, denomination, reconciliation and zero inventory.
  allocateRealizedProfit(emptyProfitLedger(p.accountingAsset, p.buybackBps), decode(d));
  return d;
}
function decode(d) {
  exact(d, ["id", "accountingAsset", "receiptIds", "reconciled", "inventoryDelta", "proceeds", "purchaseCost", "costs"]);
  exact(d.costs, ["gas", "bridge", "rebalance", "other"]);
  return { ...d, inventoryDelta: decimal(d.inventoryDelta), proceeds: decimal(d.proceeds), purchaseCost: decimal(d.purchaseCost),
    costs: Object.fromEntries(["gas", "bridge", "rebalance", "other"].map(k => [k, decimal(d.costs[k])])) };
}
function regular(path) {
  if (typeof path !== "string" || !isAbsolute(path)) throw Error("Protected absolute book path required");
  const s = lstatSync(path);
  if (!s.isFile() || s.nlink !== 1 || (s.mode & 0o077) !== 0 || s.size > 16 * 1024 * 1024) throw Error("Protected regular book required");
  return s;
}
const flags = () => ({ source: "local-unverified-operator-profit-reports", currentAuthorization: null,
  receiptAuthenticationVerified: false, inventoryVerified: false, costsVerified: false, realizedProfitVerified: false,
  capitalProvenanceVerified: false, independentProvidersVerified: false, finalityVerified: false,
  buybackExecuted: false, executionAuthorized: false, fullStrategyReadiness: false });

/** One protected host/book. Hashes are consistency checks, not authentication. */
export class ReportedStrategyProfitBook {
  #db; #policy; #now; #readOnly;
  static initialize(path, inputPolicy, { enabled = false, now = Date.now() } = {}) {
    if (enabled !== true) throw Error("Reported profit book disabled");
    if (typeof path !== "string" || !isAbsolute(path)) throw Error("Durable absolute book path required");
    const p = policy(inputPolicy); time(now);
    const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); closeSync(fd);
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;");
      for (const sql of SCHEMA) db.exec(sql);
      db.prepare("INSERT INTO profit_book VALUES(1,1,?,?,?)").run(randomBytes(32).toString("hex"), JSON.stringify(p), now);
      db.exec("COMMIT;");
    } finally { db.close(); }
  }
  constructor(path, inputPolicy, { enabled = false, readOnly = true, now = Date.now } = {}) {
    if (enabled !== true) throw Error("Reported profit book disabled");
    if (typeof readOnly !== "boolean" || typeof now !== "function") throw Error("Literal book options required");
    this.#policy = policy(inputPolicy); this.#now = now; this.#readOnly = readOnly;
    const before = regular(path); this.#db = new DatabaseSync(path, { readOnly });
    try {
      const after = regular(path);
      if (before.ino !== after.ino || before.dev !== after.dev) throw Error("Book replaced");
      this.#db.exec("PRAGMA busy_timeout=5000;");
      if (!readOnly) this.#db.exec("PRAGMA synchronous=FULL;");
      const tables = this.#db.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
      if (tables.length !== SCHEMA.length || tables.some((x, i) => x.sql !== SCHEMA[i]) || this.#db.prepare("PRAGMA quick_check").get().quick_check !== "ok"
        || this.#db.prepare("PRAGMA journal_mode").get().journal_mode !== "wal") throw Error("Book schema differs");
      this.read();
    } catch (e) { this.#db.close(); throw e; }
  }
  #scan() {
    const now = time(this.#now()), meta = this.#db.prepare("SELECT * FROM profit_book").all();
    if (meta.length !== 1) throw Error("Book metadata differs");
    const m = meta[0];
    if (m.singleton !== 1 || m.version !== 1 || !/^[0-9a-f]{64}$/.test(m.book_id) || m.policy !== JSON.stringify(this.#policy) || time(m.last_clock) > now) throw Error("Book policy or clock differs");
    const count = this.#db.prepare("SELECT count(*) AS n,max(length(CAST(document AS BLOB))) AS bytes FROM profit_cycles").get();
    const receiptCount = this.#db.prepare("SELECT count(*) AS n FROM profit_receipts").get().n;
    if (count.n > LIMIT || count.bytes > 8192 || receiptCount > LIMIT * 32) throw Error("Book capacity");
    const rows = this.#db.prepare("SELECT * FROM profit_cycles ORDER BY sequence").all();
    let ledger = emptyProfitLedger(this.#policy.accountingAsset, this.#policy.buybackBps), head = sha([1, m.book_id, this.#policy]), last = 0;
    const receipts = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], d = document(decode(JSON.parse(r.document)), this.#policy);
      if (r.sequence !== i + 1 || r.cycle_id !== d.id || r.previous !== head || time(r.recorded_at) < last || r.recorded_at > m.last_clock
        || JSON.stringify(d) !== r.document || r.digest !== sha([1, m.book_id, this.#policy, r.sequence, r.previous, r.recorded_at, d])) throw Error("Book history inconsistent");
      ledger = allocateRealizedProfit(ledger, decode(d));
      for (const receipt_id of d.receiptIds) receipts.push({ receipt_id, sequence: r.sequence });
      head = r.digest; last = r.recorded_at;
    }
    receipts.sort((a, b) => a.receipt_id < b.receipt_id ? -1 : a.receipt_id > b.receipt_id ? 1 : 0);
    if (JSON.stringify(receipts) !== JSON.stringify(this.#db.prepare("SELECT receipt_id,sequence FROM profit_receipts ORDER BY receipt_id").all())) throw Error("Receipt index inconsistent");
    return { m, rows, ledger, head, now };
  }
  #view(s) {
    return { schemaVersion: 1, bookId: s.m.book_id, policy: { ...this.#policy }, head: s.head, total: s.rows.length,
      reportedLossCarry: s.ledger.lossCarry.toString(), modeledBuybackAllocation: s.ledger.buybackBudget.toString(), modeledRetainedProfit: s.ledger.retainedProfit.toString(),
      entries: s.rows.map(r => ({ sequence: r.sequence, previous: r.previous, digest: r.digest, recordedAtMs: r.recorded_at, cycle: JSON.parse(r.document) })), ...flags() };
  }
  read() {
    this.#db.exec("BEGIN;");
    try { return this.#view(this.#scan()); } finally { this.#db.exec("ROLLBACK;"); }
  }
  appendReportedCycle(request) {
    if (this.#readOnly) throw Error("Book is read-only");
    exact(request, ["cycle", "expectedHead"]);
    const expectedHead = request.expectedHead;
    if (typeof expectedHead !== "string" || !/^[0-9a-f]{64}$/.test(expectedHead)) throw Error("Expected head required");
    const d = document(request.cycle, this.#policy), payload = JSON.stringify(d), before = time(this.#now());
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const s = this.#scan(); if (s.now < before) throw Error("Book clock moved backwards");
      const old = s.rows.find(r => r.cycle_id === d.id);
      if (old) {
        if (old.document !== payload || old.previous !== expectedHead) throw Error("Reported cycle retry differs");
        if (time(this.#now()) < s.now) throw Error("Book clock moved backwards");
        this.#db.exec("ROLLBACK;"); return { inserted: false, sequence: old.sequence, digest: old.digest, recordedAtMs: old.recorded_at, ...flags() };
      }
      if (s.head !== expectedHead || s.rows.length >= LIMIT) throw Error("Book head or capacity differs");
      allocateRealizedProfit(s.ledger, decode(d)); // actual cost/loss/cumulative-bound and global receipt checks
      const sequence = s.rows.length + 1, digest = sha([1, s.m.book_id, this.#policy, sequence, s.head, s.now, d]);
      this.#db.prepare("INSERT INTO profit_cycles VALUES(?,?,?,?,?,?)").run(sequence, d.id, s.head, digest, s.now, payload);
      for (const id of d.receiptIds) this.#db.prepare("INSERT INTO profit_receipts VALUES(?,?)").run(id, sequence);
      const ended = time(this.#now()); if (ended < s.now) throw Error("Book clock moved backwards");
      this.#db.prepare("UPDATE profit_book SET last_clock=? WHERE singleton=1").run(ended);
      this.#db.exec("COMMIT;"); return { inserted: true, sequence, digest, recordedAtMs: s.now, ...flags() };
    } catch (e) { try { this.#db.exec("ROLLBACK;"); } catch {} throw e; }
  }
  close() { this.#db.close(); }
}
