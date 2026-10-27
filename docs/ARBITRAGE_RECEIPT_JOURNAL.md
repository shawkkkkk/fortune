# Testnet arbitrage receipt journal

This adds a read-only receipt verifier and a disk-backed fill journal. It does not authorize trades, allocate realized profit or perform buybacks. Existing Standard contracts, dependencies and release fingerprints are unchanged.

## Verification boundary

`readVerifiedFill` requires two distinct configured RPC clients to agree on a transaction's reconciled fill. Each checks the chain, successful receipt, transaction/receipt/block/log provenance, confirmation depth, strategy sender and configured router. Code hashes for the router, factory, pool and both assets must match the operator-reviewed manifest at the receipt block. The pool must match the canonical factory lookup, pool factory, exact token ordering, fee tier and both token precisions. The receipt block's hash is rechecked after the reads.

Exactly one configured V3 swap must match exactly two direct ERC-20 transfers between the strategy wallet and that pool. Swap deltas and wallet deltas must reconcile. Other wallet assets/transfers, intermediate custody, native-value swaps, reverted transactions, duplicate/removed logs, ambiguous swaps and insufficient depth fail closed. Both Pancake V3 and Uniswap V3 event formats are explicit manifest choices. Fee-on-transfer, rebasing, proxy/upgradeable or otherwise unreviewed tokens are outside this adapter; runtime hashes alone do not prove plain-token behavior.

Current receipt accounting supports BSC Testnet (97) and Ethereum Sepolia (11155111), with legacy, EIP-2930 and EIP-1559 transactions only. Base Sepolia is deliberately rejected until its additional L1/data-fee accounting is implemented. Blob and delegated-account transactions need separate cost/custody adapters. `nativeGasCost` records `gasUsed * effectiveGasPrice` in that chain's native units. It is **not** silently converted into settlement-token units. Pool fees are already in the actual swap deltas. Bridging, rebalance costs, cost conversion and unmatched inventory still need cycle reconciliation before realized-profit allocation.

These checks depend on trusted RPC responses, pinned configuration and the chain's finality assumptions. They are not Merkle proofs or proof that two provider accounts are independently operated. The CLI requires different HTTPS origins; the operator must separately verify provider independence. Confirmation depth is not a guarantee against deeper reorgs. The library grants an in-process, immutable verification marker only to completed observations; deserialized or caller-constructed JSON is not accepted as a fresh verified fill.

## Durable storage and retry behavior

`ArbitrageFillJournal` uses Node's built-in SQLite on a **single durable host**. It uses WAL, FULL synchronization, bounded lock waits, `BEGIN IMMEDIATE`, prepared statements and a receipt primary key. Configuration is fingerprinted and bound to the database. Reopening it with a different chain/wallet/contracts/fee/depth policy fails. A verified retry with identical evidence returns `inserted: false`; it never creates another row. Decimal strings preserve exact amounts.

Changed evidence for the same receipt identity atomically quarantines the original and retains the conflicting payload. A failed `refresh` also quarantines any existing observations for that transaction, including when a provider is unavailable. Successful later verification does not silently restore a quarantined row. Recovery requires investigating the evidence and a reviewed rebuild/reconciliation procedure; there is no unquarantine or spending endpoint in this slice. An `observed` row states what was verified at observation time, not that it has been continuously revalidated. Downstream settlement must recheck current canonicality before using it.

Deduplication is scoped to this database. A future settlement service must ensure one authoritative journal/policy and global receipt uniqueness across markets before allocating profit. Do not independently add amounts from copied databases. Store files outside the checkout on a durable volume with restricted OS permissions. Use SQLite-consistent backups covering WAL state and rehearse restore; copying only the main database while WAL is active is not a valid backup plan. Ephemeral Vercel function storage is not supported. No service or storage volume is provisioned by this PR.

## Read-only worker command

Prepare a reviewed JSON manifest:

```text
chainId: 97 | 11155111
wallet: public strategy address
router, factory, pool: { address, codeHash }
token, settlement: { address, codeHash, decimals }
fee: V3 fee tier
confirmations: integer 1..256
eventKind: "pancake-v3" | "uniswap-v3"
```

`codeHash` is keccak256 of the independently reviewed runtime bytecode; it is not an automatically trusted observation from the RPC under test. All addresses/roles must be distinct. Both precisions must be integers 0..18. The strategy wallet must be dedicated capital, separate from holders, creators and launch reserves.

Configure `FORTUNE_ARBITRAGE_READ_RPC_URL` and `FORTUNE_ARBITRAGE_SECONDARY_RPC_URL` through the operator's server environment, then:

```bash
node --import ./scripts/register-ts.mjs scripts/journal-arbitrage-fill.mjs /path/to/reviewed-market.json /durable/fortune/fills.sqlite 0x<transaction-hash>
```

Node 22.15+ is required by the existing loader; the worker uses the built-in SQLite API available in that line. The manifest is bounded to 16 KiB and RPC calls have timeouts without automatic retries. The command has no wallet or private-key input. Output reports only the receipt observation; errors are generic so RPC credentials and local paths are not printed. `profitAllocated` and `executionAuthorized` remain false. No automatic schedule is installed.

## Evidence and remaining work

Tests use fixture RPC clients, not live receipt evidence. Real disk tests cover close/reopen, idempotent retry, policy mismatch, forged-fill rejection, persistent conflict quarantine and failed rechecks. A two-process race verifies that two workers recording the same fill produce exactly one row. These tests do not establish a working cross-chain strategy, independent providers, real-host backup/restore or a deployed treasury.

Still required: retained live/fork receipt evidence for reviewed routes, provider/finality drills, durable cycle/job orchestration, authenticated native-cost conversion, inventory/rebalance/bridge settlement, global deduplication, enforced execution limits, failure/unwind recovery and separately reviewed profit/buyback policy. Pair-asset holder claims, creator earnings and liquidity cannot fund this strategy. All mainnet review/governance/operations gates remain in force.

References: [Node 22 SQLite API](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html), [SQLite transactions](https://www.sqlite.org/lang_transaction.html). The database mechanism establishes storage behavior, not economic correctness or independent audit approval.
