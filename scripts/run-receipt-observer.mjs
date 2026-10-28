import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { ArbitrageFillJournal } from "./arbitrage-fill-journal.mjs";
import { ReceiptObservationQueue, observeNextReceipt } from "./arbitrage-observer-queue.mjs";
let queue, journal;
try {
  const [manifestPath, queuePath, journalPath, action, tx, ...extra] = process.argv.slice(2);
  if (!manifestPath || !queuePath || !journalPath || resolve(queuePath) === resolve(journalPath) || extra.length || !["enqueue", "once", "status"].includes(action)
    || (action === "enqueue" ? !tx : tx !== undefined) || statSync(manifestPath).size > 16_384) throw Error("Arguments");
  // Monitoring must not create empty files and mistake an absent worker installation for health.
  if (action === "status" && (!statSync(queuePath).isFile() || !statSync(journalPath).isFile())) throw Error("Existing durable files required");
  const market = JSON.parse(readFileSync(manifestPath, "utf8"));
  // Check both files against the same manifest even for enqueue/status; no silent policy migration.
  queue = new ReceiptObservationQueue(queuePath, market, Date.now, { readOnly: action === "status" });
  journal = new ArbitrageFillJournal(journalPath, market, { readOnly: action === "status" });
  let result;
  if (action === "enqueue") result = queue.enqueue(tx);
  else if (action === "status") {
    const queueHealth = queue.health(), journalStatus = journal.status();
    const reasons = [...queueHealth.reasons, ...(journalStatus.quarantined > 0 ? ["QUARANTINED_RECEIPTS"] : [])];
    result = { ...queueHealth, scope: "local-observation-files", journal: journalStatus, healthy: reasons.length === 0, reasons };
  }
  else {
    const urls = [process.env.FORTUNE_ARBITRAGE_READ_RPC_URL, process.env.FORTUNE_ARBITRAGE_SECONDARY_RPC_URL].map(raw => new URL(raw || ""));
    if (urls.some(u => u.protocol !== "https:" || u.username || u.password || u.hash) || urls[0].origin === urls[1].origin) throw Error("Distinct reviewed read origins required");
    const clients = urls.map(u => createPublicClient({ transport: http(u.href, { timeout: 8000, retryCount: 0 }) }));
    result = await observeNextReceipt(queue, journal, clients);
  }
  console.log(JSON.stringify({ ...result, executionAuthorized: false, profitAllocated: false }));
  if (result.healthy === false || result.state === "pending" || result.state === "exhausted") process.exitCode = 1;
} catch { console.error("Receipt observation unavailable: check reviewed policy, durable files, read providers, job state and host clock. No trade or profit allocation was submitted."); process.exitCode = 1; }
finally { try { journal?.close(); } finally { queue?.close(); } }
