# Durable strategy native-gas budget book

`StrategyNativeGasBudget` is a BSC-Testnet-only SQLite accounting primitive for
one reviewed gas payer across up to sixteen reviewed fill-market hashes. Its
immutable policy names `fundingScope: strategy-native-gas`, payer, per-transaction
ceiling and rolling-day ceiling, both in exact decimal native-wei strings. It
never converts gas to a settlement asset or allocates profit. Funding-source
segregation must be established by custody and operations; this label cannot
prove that a wallet's funds came from permitted strategy capital.

This is NOT a wallet, signer, broadcaster, execution authorization, onchain cap,
complete orchestration service or global cross-chain value budget. A trading
engine must not treat its result as permission to spend. The public catalog and
financial engines retain all existing gates. Frozen Standard is unchanged.

## Implemented behavior

- `reserve(txHash, maximumNativeWei)` atomically counts outstanding reservations
  plus charges recorded during the preceding24hours. Exact-cap reservations are
  allowed; a one-wei overrun is rejected. Both per-transaction and shared limits
  apply. Transaction hashes are normalized and deduplicated permanently.
- Pending and quarantined reservations never expire or auto-release. A valid
  old reservation is still counted after restart, process crashes or days of
  inactivity. There is deliberately no cancellation, deletion, refund-by-clock,
  policy reset, or unquarantine operation.
- `charge(verifiedFill)` accepts only a fresh in-process branded receipt from
  the existing two-client verifier, with matching chain, reviewed market and
  actual payer (`gasPayer` in vault mode, wallet in direct-router mode). It needs
  an existing transaction reservation. Copies/JSON/caller-supplied totals fail.
- Successful verified charges replace the ceiling with actual native gas cost;
  unused headroom becomes available. A replay is idempotent and never advances
  its charged-at timestamp, even after the rolling window expires.
- A cost above the reservation or changed receipt evidence permanently blocks
  new reservations, quarantines that transaction and retains conflicting evidence.
  Quarantined exposure uses at least the greater of ceiling and recorded cost.
  Other reserved receipts may still be reconciled while new reservations remain
  blocked. A later successful read never restores trust automatically.
- The shared window is24hours after the local charge was recorded, not after
  an untrusted transaction timestamp. Host-clock rollback relative to committed
  mutations fails closed. The clock and filesystem are trusted-host dependencies;
  forward clock manipulation and file rollback are not solved by SQLite.
- WAL/FULL and `BEGIN IMMEDIATE` serialize competing worker processes. Policy
  fingerprints prevent silent repinning. Ten thousand retained transaction hashes
  is a hard capacity; exhaustion fails closed rather than purging deduplication
  history. `status` is a read snapshot and does not advance the persisted clock.
  A `readOnly` constructor option inspects an already initialized matching file.

## Integration boundary

The API has no CLI, public endpoint, auto-created service, credentials, key or
provider URL. A reviewed worker can construct the book with a durable path and
policy, reserve a **known transaction hash**, then pass a fresh `readVerifiedFill`
result to `charge`. There is no atomic binding to a signer or pre-broadcast path
in this change. A reservation supplied after mining proves accounting behavior,
not that the trade was prevented by a limit. Unsigned-plan reservations and their
binding to eventual signed hashes still need a separately constrained executor.

Only successful supported swap receipts can currently charge. Reverted, dropped,
unavailable, bridge, approval and unrelated transactions retain their full
reservation; native L1/data-fee chains are not supported. Do not invent a zero
cost or free a reservation to get around missing evidence. Capacity/recovery
policy needs an explicit future design and review rather than manual SQL edits.

`healthy` describes the local book's blocked/capacity state. It is not worker
liveness, receipt freshness, canonical chain provenance or available wallet cash.
The book does not continuously recheck charges. A later reorg is detected only
when a newly verified fill is presented, and a failed RPC read alone does not
notify or freeze this book. Journal/queue/quarantine integration, continuous
revalidation and durable supervision remain required before an execution service
can use any native-budget constraint. Native charges after24hours can age out;
that does not settle bridge inventory or realized profit.

A hash cannot be reserved twice with a new amount or silently reused after the
window. Separate files with different scopes are not a shared global cap. Every
market for the reviewed payer must use the same protected book; the database
cannot stop another wallet or external process from broadcasting transactions.
No creator, holder or liquidity allocation may fund strategy capital or gas.

## Verification

Seven new regression tests use actual SQLite files, close/reopen, read-only
connections, capacity boundaries and two independent worker processes racing one
shared cap. The charge inputs come through the real receipt verifier using two
provider fixtures, including vault-operator payer checks and changed evidence.
These are fixture receipts, not public route or live custody evidence. Existing
root dependencies, frozen contracts and other active PRs are untouched.
