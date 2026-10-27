import { DatabaseSync } from "node:sqlite";
import { isVerifiedFill, fillMarketHash, readVerifiedFill } from "../lib/arbitrage-receipts.ts";

/** Single durable host only; do not put this database on ephemeral serverless storage. */
export class ArbitrageFillJournal {
  #db;
  #marketHash;
  #market;
  constructor(path, reviewedMarket) {
    if (typeof path !== "string" || !path || path === ":memory:") throw new Error("Durable journal path required");
    this.#marketHash = fillMarketHash(reviewedMarket);
    this.#market = structuredClone(reviewedMarket);
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
      this.#db.exec(`CREATE TABLE IF NOT EXISTS config (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, market_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS fills (receipt_id TEXT PRIMARY KEY, payload TEXT NOT NULL, block_hash TEXT NOT NULL, observed_at_ms INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('observed','quarantined')));
        CREATE TABLE IF NOT EXISTS conflicts (receipt_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(receipt_id,payload));`);
      const row = this.#db.prepare("SELECT * FROM config WHERE singleton=1").get();
      if (row && (row.schema_version !== 1 || row.market_hash !== this.#marketHash)) throw new Error("Journal policy differs from reviewed market");
      if (!row) this.#db.prepare("INSERT INTO config VALUES(1,1,?)").run(this.#marketHash);
      this.#db.exec("COMMIT");
    } catch (e) { try { this.#db.exec("ROLLBACK"); } catch {} this.#db.close(); throw e; }
  }
  record(fill) {
    if (!isVerifiedFill(fill) || fill.marketHash !== this.#marketHash || Date.now() - fill.observedAtMs > 60_000 || fill.observedAtMs > Date.now()) throw new Error("Fresh verified receipt for this exact market required");
    // Re-verification times may differ; economic and block evidence must be identical.
    const { observedAtMs: _time, ...evidence } = fill;
    const payload = JSON.stringify(evidence);
    this.#db.exec("BEGIN IMMEDIATE");
    let conflict = false;
    try {
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
  close() { this.#db.close(); }
}
