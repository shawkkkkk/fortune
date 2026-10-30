import { fillMarketHash, readVerifiedFill } from '../lib/arbitrage-receipts.ts';

/** One queued observation, never a signer. Completion follows both durable commits.
 * On uncertainty leave the lease/hold intact; do not turn a failed write into a retry.
 */
export async function observeNextBudgetedReceipt(queue, book, journal, clients, reviewedMarket) {
  const market=structuredClone(reviewedMarket), digest=fillMarketHash(market);
  if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Two distinct read clients required');
  if(queue.marketHash!==digest||journal.marketHash!==digest)throw Error('Queue and journal receipt policy differ');
  if(book.status().blocked)return Object.freeze({state:'blocked',executionAuthorized:false,profitAllocated:false});
  const lease=queue.claim();
  if(!lease)return Object.freeze({state:'idle',executionAuthorized:false,profitAllocated:false});
  const result=await reconcileBudgetedReceipt(book,journal,clients,market,lease.tx);
  if(result.state!=='reconciled-observation')return result;
  return queue.complete(lease);
}

/** One explicit read-only-chain operation; no timer, signer or execution authority. */
export async function reconcileBudgetedReceipt(book, journal, clients, reviewedMarket, txHash) {
  const market=structuredClone(reviewedMarket);
  // Configuration failures must not acquire a hold or query providers.
  if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Two distinct read clients required');
  if(journal.marketHash!==fillMarketHash(market))throw Error('Journal and receipt policy differ');
  const hold=book.beginRecheck(txHash,market); // Durable BEFORE the first awaited read.
  try {
    const fill=await readVerifiedFill(clients,market,hold.tx);
    journal.record(fill); // Evidence commits before any unused ceiling is released.
    const charged=book.charge(fill,hold);
    if(charged.state!=='charged')throw Error('Budget quarantined');
    return Object.freeze({state:'reconciled-observation',executionAuthorized:false,profitAllocated:false});
  } catch {
    // Independent files are not an atomic settlement. Try both conservative writes;
    // any failed quarantine is surfaced and the durable hold is never auto-cleared.
    let failed=false;
    try { book.quarantineRecheck(hold); } catch { failed=true; }
    try { journal.quarantineKnown(hold.tx); } catch { failed=true; }
    if(failed)throw Error('Reconciliation unavailable; quarantine persistence requires operator investigation');
    return Object.freeze({state:'quarantined',executionAuthorized:false,profitAllocated:false});
  }
}
