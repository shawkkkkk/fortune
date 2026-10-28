import { fillMarketHash, readVerifiedFill } from '../lib/arbitrage-receipts.ts';

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
