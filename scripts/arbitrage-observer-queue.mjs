// Durable observation jobs only. No wallet, transaction submission or profit allocation.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { fillMarketHash } from "../lib/arbitrage-receipts.ts";
const MAX_ATTEMPTS = 5, LEASE_MS = 120_000, CAPACITY = 10_000;
const txValid = value => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value);
export class ReceiptObservationQueue {
  #db; #clock; #policy;
  constructor(path, market, clock = Date.now) {
    if (typeof path !== "string" || !path || path === ":memory:") throw Error("Durable queue path required");
    const policy = fillMarketHash(market);
    this.#clock = clock; this.#policy = policy;
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
      this.#db.exec(`CREATE TABLE IF NOT EXISTS observation_config(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, policy TEXT NOT NULL, last_clock INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS observation_jobs(tx TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','leased','done','exhausted')), attempts INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL, fence TEXT, last_failure TEXT);`);
      const row = this.#db.prepare("SELECT * FROM observation_config WHERE singleton=1").get();
      if (row && (row.version !== 1 || row.policy !== policy)) throw Error("Queue policy differs from reviewed market");
      if (!row) this.#db.prepare("INSERT INTO observation_config VALUES(1,1,?,0)").run(policy);
      this.#db.exec("COMMIT");
    } catch (e) { try { this.#db.exec("ROLLBACK"); } catch {} this.#db.close(); throw e; }
  }
  get marketHash() { return this.#policy; }
  #atomic(fn) {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const now = this.#clock();
      const { last_clock: last } = this.#db.prepare("SELECT last_clock FROM observation_config WHERE singleton=1").get();
      if (!Number.isSafeInteger(now) || now < last || now < 0 || now > Number.MAX_SAFE_INTEGER - 1_000_000) throw Error("Queue clock invalid or moved backwards");
      this.#db.prepare("UPDATE observation_config SET last_clock=? WHERE singleton=1").run(now);
      const result = fn(now); this.#db.exec("COMMIT"); return result;
    } catch (e) { this.#db.exec("ROLLBACK"); throw e; }
  }
  enqueue(hash) {
    if (!txValid(hash)) throw Error("Transaction hash required");
    const tx = hash.toLowerCase();
    return this.#atomic(now => {
      if (this.#db.prepare("SELECT tx FROM observation_jobs WHERE tx=?").get(tx)) return { inserted: false, tx };
      if (this.#db.prepare("SELECT count(*) AS n FROM observation_jobs").get().n >= CAPACITY) throw Error("Queue retention capacity reached");
      this.#db.prepare("INSERT INTO observation_jobs VALUES(?,'pending',0,?,0,NULL,NULL)").run(tx, now);
      return { inserted: true, tx };
    });
  }
  claim() {
    return this.#atomic(now => {
      this.#db.prepare("UPDATE observation_jobs SET state='exhausted',fence=NULL,last_failure='LEASE_EXPIRED' WHERE state='leased' AND lease_until<=? AND attempts>=?").run(now, MAX_ATTEMPTS);
      const row = this.#db.prepare("SELECT * FROM observation_jobs WHERE (state='pending' AND available_at<=?) OR (state='leased' AND lease_until<=? AND attempts<?) ORDER BY available_at,tx LIMIT 1").get(now, now, MAX_ATTEMPTS);
      if (!row) return null;
      const fence = randomUUID(), until = now + LEASE_MS;
      this.#db.prepare("UPDATE observation_jobs SET state='leased',attempts=attempts+1,lease_until=?,fence=? WHERE tx=?").run(until, fence, row.tx);
      return Object.freeze({ tx: row.tx, fence, leaseUntil: until, attempt: row.attempts + 1 });
    });
  }
  #finish(lease, success) {
    if (!lease || !txValid(lease.tx) || typeof lease.fence !== "string") throw Error("Lease required");
    return this.#atomic(now => {
      const row = this.#db.prepare("SELECT * FROM observation_jobs WHERE tx=?").get(lease.tx);
      if (!row || row.state !== "leased" || row.fence !== lease.fence || row.lease_until <= now) throw Error("Lease expired or superseded");
      const state = success ? "done" : row.attempts >= MAX_ATTEMPTS ? "exhausted" : "pending";
      const delay = Math.min(60_000, 5_000 * 2 ** (row.attempts - 1));
      this.#db.prepare("UPDATE observation_jobs SET state=?,available_at=?,lease_until=0,fence=NULL,last_failure=? WHERE tx=?").run(state, now + (success ? 0 : delay), success ? null : "VERIFICATION_FAILED", row.tx);
      return { state, tx: row.tx, executionAuthorized: false, profitAllocated: false };
    });
  }
  complete(lease) { return this.#finish(lease, true); }
  retry(lease) { return this.#finish(lease, false); }
  stats() {
    const counts = { pending: 0, leased: 0, done: 0, exhausted: 0 };
    for (const row of this.#db.prepare("SELECT state,count(*) AS n FROM observation_jobs GROUP BY state").all()) counts[row.state] = row.n;
    return counts;
  }
  close() { this.#db.close(); }
}

/** At-least-once observation. Journal commits first; a crash before completion replays idempotently.
 * A stale worker may still record verified evidence, but cannot complete a newer queue lease.
 */
export async function observeNextReceipt(queue, journal, clients) {
  if (queue.marketHash !== journal.marketHash) throw Error("Queue and journal policy differ");
  const lease = queue.claim();
  if (!lease) return { state: "idle", executionAuthorized: false, profitAllocated: false };
  try { await journal.refresh(clients, lease.tx); }
  catch { return queue.retry(lease); }
  return queue.complete(lease);
}
