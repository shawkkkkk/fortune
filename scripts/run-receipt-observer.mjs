import { lstatSync, realpathSync, statSync } from "node:fs";
import { readReceiptPolicy } from "./read-receipt-policy.mjs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createPublicClient, http } from "viem";
import { ArbitrageFillJournal } from "./arbitrage-fill-journal.mjs";
import { ReceiptObservationQueue, observeNextReceipt } from "./arbitrage-observer-queue.mjs";
function resolveStore(path, readOnly) {
  if (path === ":memory:" || /^file:/i.test(path)) throw Error("Durable path required");
  try { lstatSync(path); }
  catch (error) {
    if (error.code !== "ENOENT" || readOnly || path.endsWith(sep) || (sep !== "/" && path.endsWith("/"))) throw error;
    return { path: join(realpathSync(dirname(path)), basename(path)), stat: null };
  }
  const canonical = realpathSync(path);
  const stat = statSync(canonical, { bigint: true });
  if (!stat.isFile()) throw Error("Regular durable file required");
  return { path: canonical, stat };
}
let queue, journal;
try {
  const [manifestPath, queuePath, journalPath, action, tx, ...extra] = process.argv.slice(2);
  if (!manifestPath || !queuePath || !journalPath || resolve(queuePath) === resolve(journalPath) || extra.length || !["enqueue", "once", "status"].includes(action)
    || (action === "enqueue" ? !tx : tx !== undefined)) throw Error("Arguments");
  // Reject aliased roles before SQLite can initialize either store.
  const readOnly = action === "status";
  const q = resolveStore(queuePath, readOnly), j = resolveStore(journalPath, readOnly);
  if (q.path === j.path || (q.stat && j.stat && q.stat.dev === j.stat.dev && q.stat.ino === j.stat.ino)) {
    throw Error("Distinct durable stores required");
  }
  const market = readReceiptPolicy(manifestPath);
  // Check both files against the same manifest even for enqueue/status; no silent policy migration.
  queue = new ReceiptObservationQueue(q.path, market, Date.now, { readOnly });
  journal = new ArbitrageFillJournal(j.path, market, { readOnly });
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
    const clients = urls.map(u => createPublicClient({ transport: http(u.href, { timeout: 8000, retryCount: 0, fetchOptions: { redirect: "error" } }) }));
    result = await observeNextReceipt(queue, journal, clients);
  }
  console.log(JSON.stringify({ ...result, executionAuthorized: false, profitAllocated: false }));
  if (result.healthy === false || result.state === "pending" || result.state === "exhausted") process.exitCode = 1;
} catch { console.error("Receipt observation unavailable: check reviewed policy, durable files, read providers, job state and host clock. No trade or profit allocation was submitted."); process.exitCode = 1; }
finally { try { journal?.close(); } finally { queue?.close(); } }
