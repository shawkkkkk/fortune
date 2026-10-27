# Durable receipt observation jobs

This is read-only orchestration around `ArbitrageFillJournal`, not an executor or profit ledger. It queues explicit transaction hashes for the existing testnet receipt verifier. It does not discover swaps, sign transactions, fund strategies, bridge, convert gas costs or allocate buybacks. Existing Standard files and dependencies remain unchanged.

## Storage and authority

`ReceiptObservationQueue` uses Node SQLite, WAL, FULL synchronization, bounded busy waits and immediate transactions on one durable host. A singleton binds its schema and exact reviewed market fingerprint. Queue and journal policies must match before a worker claims a job. Reopening with a different policy fails; roles/contracts/depth changes require a reviewed migration preserving receipt uniqueness.

Transaction hashes are normalized and unique for the lifetime of the queue, including done/exhausted jobs. Retention is capped at 10,000 rows; full retention fails closed. There is no automatic purge, reset or requeue of terminal jobs. Do not create replacement queues as a way to count receipts again. The authoritative journal, not a job count, establishes recorded evidence.

A claim holds a 120-second lease and a fresh opaque fence token. Claims increment the persisted attempt count. Expired leases can be reclaimed; an old fence cannot finish or retry a replacement lease. No heartbeat extends a lease. Failed verification retries after 5, 10, 20 and 40 seconds; the fifth failure is terminal. Repeated worker crashes also exhaust after five expired claims. At most one active lease per transaction is granted by this database. A worker that stalls beyond expiry can overlap a replacement's **read**: fencing controls queue completion, not cancellation of an already-running provider request.

The worker commits the journal before completing its job. A crash between those commits causes an at-least-once replay; journal receipt deduplication prevents a second fill row. There is no distributed exactly-once claim or atomic profit settlement. A late worker may record fresh verified evidence before its queue completion is rejected. The existing journal still quarantines conflicting evidence or failed rechecks and never silently restores trust. Retrying a quarantined receipt cannot clear it.

`done` is a scheduling result under a trusted host/operator, not cryptographic provenance, continuous canonicality or a spending signal. Host code with queue access can call completion directly. Downstream settlement must authenticate/revalidate journal evidence and reconcile inventory and costs independently. Successfully observed jobs are not automatically scheduled for future canonicality checks. Use a separately reviewed revalidation policy before settlement.

The queue persists a nondecreasing host wall clock. Invalid or backwards time blocks writes/claims/completion; review clock synchronization and in-flight leases before recovery. Do not patch clock values or delete files merely to resume processing. The database stores only hashes, job state, attempt/time/fence metadata and fixed failure codes; upstream exceptions and RPC URLs are not stored.

## Operator commands

Use Node 22.15+ and a restricted durable volume outside the checkout. Both database paths are operator inputs. Prepare the existing bounded reviewed receipt-market manifest described in `ARBITRAGE_RECEIPT_JOURNAL.md`:

```bash
node --import ./scripts/register-ts.mjs scripts/run-receipt-observer.mjs /reviewed/market.json /durable/jobs.sqlite /durable/fills.sqlite enqueue 0x<transaction-hash>
node --import ./scripts/register-ts.mjs scripts/run-receipt-observer.mjs /reviewed/market.json /durable/jobs.sqlite /durable/fills.sqlite status
node --import ./scripts/register-ts.mjs scripts/run-receipt-observer.mjs /reviewed/market.json /durable/jobs.sqlite /durable/fills.sqlite once
```

`once` requires `FORTUNE_ARBITRAGE_READ_RPC_URL` and `FORTUNE_ARBITRAGE_SECONDARY_RPC_URL` with distinct trusted HTTPS origins; provider independence still needs review. Calls have eight-second transport timeouts and no automatic transport retries. One invocation claims at most one eligible job. An idle invocation exits successfully; a verification retry/exhaustion or infrastructure error exits nonzero. Output never grants execution/profit authority and errors omit upstream credentials and paths. No schedule or service is installed.

This is unsupported on ephemeral Vercel filesystem storage. Provision durable host/storage, least-privilege OS access, SQLite-consistent backups for both databases including WAL state, restore drills, supervisor/backoff and exhausted/clock/volume monitoring before operational use. Separate copies of queues/journals are not globally deduplicated. No such host or monitoring integration is provisioned here.

## Evidence and limits

Tests use real SQLite files, close/reopen, two competing child processes, a journal-before-job-completion crash boundary, lease expiry/fencing, bounded retries/exhaustion, policy mismatch, backwards clocks, quarantine persistence and the actual CLI. Receipt-provider data in these tests are fixtures; this does not establish a live two-provider route, public testnet deployment, a running service or complete strategy settlement. The new observation worker remains compatible with the separate vault receipt mode when that PR is integrated; this independent change does not bundle the vault or quote adapter.

## Local health monitoring

`status` now requires existing initialized queue and journal files and opens both with SQLite read-only connections. Missing/empty/incompatible files fail rather than creating a fresh healthy database. It returns queue counts, ready-pending count, expired-lease count, oldest **eligible** pending delay, remaining retention capacity, journal observation/quarantine counts and fixed reason codes. Transaction hashes, fence tokens, provider details and file paths are not included.

The command exits nonzero for exhausted jobs, expired leases, ready jobs overdue by at least five minutes, full 10,000-row retention, invalid/backwards host time, any quarantined receipt, or a file/policy/read failure. Healthy/idle local files exit zero. Retry backoff is excluded from eligible waiting delay. The library's health threshold is bounded to 1..3,600,000 milliseconds; the operator CLI uses the fixed five-minute default. Invalid clock readings leave time-dependent metrics null instead of inventing an age. Clock validity compares with the last persisted queue write; a health poll does not advance that clock.

Health inspection does not recover a lease, claim/retry a job, clear quarantine, purge retained history or reset attempts. Queue metrics use one SQLite read snapshot; journal metrics use a separate snapshot, so combined CLI output is not an atomic settlement view or proof of service liveness. A healthy empty queue does not prove a worker is running or receipts were ever discovered. Terminal jobs are not automatically revalidated. `readinessAttested`, `executionAuthorized` and `profitAllocated` remain false.

A durable host supervisor can use the JSON and exit code for local alerting. No alert destination, delivery, storage host or supervisor is provisioned or verified by this change. Investigate expired/overdue jobs and the host clock, retain quarantined/exhausted evidence, review capacity/backup procedures, and revalidate canonical receipts before any settlement. Do not remove evidence or manually reset clocks merely to turn monitoring green. Tests cover real disk/CLI health failures, missing and empty files, read-only write rejection, exact expiry/delay boundaries, retry backoff, persisted exhaustion, quarantine and full retention. They do not establish a running service, independent public-provider evidence or release readiness.
