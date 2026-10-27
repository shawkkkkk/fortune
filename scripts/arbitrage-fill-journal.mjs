import { DatabaseSync } from "node:sqlite";
import { isVerifiedFill, fillMarketHash, readVerifiedFill } from "../lib/arbitrage-receipts.ts";

/** Single durable host only; do not put this database on ephemeral serverless storage. */
export class ArbitrageFillJournal {
  #db;
  #marketHash;
  #market;
  constructor(path, reviewedMarket, { readOnly = false } = {}) {
    if (typeof path !== "string" || !path || path === ":memory:") throw new Error("Durable journal path required");
    this.#marketHash = fillMarketHash(reviewedMarket);
    this.#market = structuredClone(reviewedMarket);
    this.#db = new DatabaseSync(path, { readOnly });
    try {
      this.#db.exec(readOnly ? "PRAGMA busy_timeout=5000; BEGIN;" : "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
      if (!readOnly) this.#db.exec(`CREATE TABLE IF NOT EXISTS config (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, market_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS fills (receipt_id TEXT PRIMARY KEY, payload TEXT NOT NULL, block_hash TEXT NOT NULL, observed_at_ms INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('observed','quarantined')));
        CREATE TABLE IF NOT EXISTS conflicts (receipt_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(receipt_id,payload));`);
      const row = this.#db.prepare("SELECT * FROM config WHERE singleton=1").get();
      if ((readOnly && !row) || (row && (row.schema_version !== 1 || row.market_hash !== this.#marketHash))) throw new Error("Journal policy differs from reviewed market");
      if (!row) this.#db.prepare("INSERT INTO config VALUES(1,1,?)").run(this.#marketHash);
      this.#db.exec("COMMIT");
    } catch (e) { try { this.#db.exec("ROLLBACK"); } catch {} this.#db.close(); throw e; }
  }
  get marketHash() { return this.#marketHash; }
  record(fill) {
    if (!isVerifiedFill(fill) || fill.marketHash !== this.#marketHash || Date.now() - fill.observedAtMs > 60_000 || fill.observedAtMs > Date.now()) throw new Error("Fresh verified receipt for this exact market required");
    // Re-verification times may differ; economic and block evidence must be identical.
    const { observedAtMs: _time, ...evidence } = fill;
    const payload = JSON.stringify(evidence);
    this.#db.exec("BEGIN IMMEDIATE");
    let conflict = false;
    try {
      // A reorg can change the swap log index and therefore receipt_id. Bind all
      // observations of this transaction before permitting a new row.
      const siblings = this.#db.prepare("SELECT receipt_id FROM fills WHERE receipt_id LIKE ? AND receipt_id<>?")
        .all(`${this.#market.chainId}:${fill.transactionHash.toLowerCase()}:%`, fill.receiptId);
      if (siblings.length) {
        for (const sibling of siblings) {
          this.#db.prepare("UPDATE fills SET state='quarantined' WHERE receipt_id=?").run(sibling.receipt_id);
          this.#db.prepare("INSERT OR IGNORE INTO conflicts VALUES(?,?)").run(sibling.receipt_id, payload);
        }
        this.#db.exec("COMMIT");
        throw new Error("Transaction receipt identity changed; journal quarantined it");
      }
      const existing = this.#db.prepare("SELECT payload,state FROM fills WHERE receipt_id=?").get(fill.receiptId);
      if (existing) {
        if (existing.payload !== payload) {
          this.#db.prepare("UPDATE fills SET state='quarantined' WHERE receipt_id=?").run(fill.receiptId);
          this.#db.prepare("INSERT OR IGNORE INTO conflicts VALUES(?,?)").run(fill.receiptId, payload);
          conflict = true;
        } else if (existing.state === "quarantined") throw new Error("Receipt remains quarantined");
        else this.#db.prepare("UPDATE fills SET observed_at_ms=? WHERE receipt_id=?").run(fill.observedAtMs, fill.receiptId);
        this.#db.exec("COMMIT");
        if (conflict) throw new Error("Receipt changed; journal quarantined it");
        return { inserted: false, receiptId: fill.receiptId, executionAuthorized: false };
      }
      this.#db.prepare("INSERT INTO fills VALUES(?,?,?,?,'observed')").run(fill.receiptId, payload, fill.blockHash, fill.observedAtMs);
      this.#db.exec("COMMIT");
      return { inserted: true, receiptId: fill.receiptId, executionAuthorized: false };
    } catch (e) { try { this.#db.exec("ROLLBACK"); } catch {} throw e; }
  }
  list(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Bounded journal read required");
    return this.#db.prepare("SELECT receipt_id,payload,state,observed_at_ms FROM fills ORDER BY receipt_id LIMIT ?").all(limit).map(r => ({ fill: JSON.parse(r.payload), state: r.state, observedAtMs: r.observed_at_ms }));
  }
  dueForRevalidation(nowMs, maxAgeMs = 300_000, limit = 10) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 86_400_000
      || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Bounded revalidation policy required");
    if (this.#db.prepare("SELECT 1 FROM fills WHERE observed_at_ms>? OR observed_at_ms<0 LIMIT 1").get(nowMs)) throw new Error("Journal observation clock is invalid or reversed");
    return this.#db.prepare("SELECT payload FROM fills WHERE state='observed' AND observed_at_ms<=? ORDER BY observed_at_ms,receipt_id LIMIT ?")
      .all(nowMs - maxAgeMs, limit).map(row => JSON.parse(row.payload).transactionHash);
  }
  async refresh(clients, txHash) {
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Transaction hash required");
    try { return this.record(await readVerifiedFill(clients, this.#market, txHash)); }
    catch (e) {
      // Unavailability is conservative too. No automatically trusted state after a failed recheck.
      this.#db.prepare("UPDATE fills SET state='quarantined' WHERE receipt_id LIKE ?").run(`${this.#market.chainId}:${txHash.toLowerCase()}:%`);
      throw e;
    }
  }
  conflicts(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Bounded conflict read required");
    return this.#db.prepare("SELECT payload FROM conflicts ORDER BY receipt_id LIMIT ?").all(limit).map(r => JSON.parse(r.payload));
  }
  status() {
    const counts = { observed: 0, quarantined: 0 };
    for (const row of this.#db.prepare("SELECT state,count(*) AS n FROM fills GROUP BY state").all()) counts[row.state] = row.n;
    return Object.freeze(counts);
  }
  close() { this.#db.close(); }
}
