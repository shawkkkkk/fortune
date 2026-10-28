/** Bounded read-RPC reconciliation; never a settlement or spending signal. */
export async function revalidateFillBatch(journal, clients, { clock = Date.now, maxAgeMs = 300_000, limit = 10 } = {}) {
  // Select before awaiting RPC. Rechecking oldest observations prevents starvation
  // across bounded invocations without a resettable in-memory cursor.
  const nowMs = clock();
  const due = journal.dueForRevalidation(nowMs, maxAgeMs, limit);
  let refreshed = 0, failed = 0;
  for (const tx of due) {
    try { await journal.refresh(clients, tx); refreshed++; }
    catch { failed++; }
  }
  const finishedAt = clock();
  if (!Number.isSafeInteger(finishedAt) || finishedAt < nowMs) throw new Error("Revalidation clock reversed");
  const remainingDue = journal.dueForRevalidation(finishedAt, maxAgeMs, 100).length;
  const status = journal.status();
  return Object.freeze({ scope: "receipt-revalidation-batch", selected: due.length, refreshed, failed,
    remainingDue, remainingDueCapped: remainingDue === 100, ...status,
    healthy: failed === 0 && remainingDue === 0 && status.quarantined === 0,
    readinessAttested: false, executionAuthorized: false, profitAllocated: false });
}
