# Durable work batch observation book

This is an explicit local library, disabled by default. It calls the existing
unchanged `inspectAllWorkBatchResultPayments` reader and stores historical
observations in a separate SQLite book. It is not a financial settlement ledger,
receipt badge, payment service or execution permission. No real book, provider,
service, wallet, deployment or model configuration is enabled by this source.

## Scope and storage

`WorkBatchObservationBook.initialize(path, policy, {enabled:true})` exclusively
creates a fresh0600 file. The absolute path must be a filesystem path, not a SQLite
URI. Opening an existing book requires explicit enablement and defaults read-only;
`readOnly:false` is a separate opt-in. Protected regular single-link files, inode/
device checks, exact schema/version/policy, WAL/FULL and quick_check are required.
Missing, symlink/hardlink, loosely permissioned, foreign or corrupt books fail;
there is no automatic init, repair, reset, pruning, migration or unquarantine.
These checks do not defend against a privileged host swapping or rewriting files.

The immutable book policy is exactly chain97, escrow/runtime hash, governor,
guardian, arbitrator and original client. Addresses are canonical lowercase and
these five roles must be distinct. Labels/pins do not prove legitimate capital,
people, control, consent, legal terms or issuer/proxy safety. Review plaintext
wallet/job privacy before recording or disclosing actual observations.

`read()` returns bounded history, head, public random book ID and quarantine state.
The ID is not a generated wallet/account/key. `capture(clients, completePolicies,
expectedHead)` requires the two supplied read clients, every1–16 ordered job policy
and the actual original predecessor head. Input is a dense literal canonical JSON
structure of at most64KiB; key order is normalized before awaits. The unchanged
reader validates every policy/calldata/event/state binding before acceptance.
No caller-provided observation can be inserted through the API.

## Commit, retry and conflict behavior

Read-only preflight validates history, scope/head, capacity and quarantine before
RPC. After the actual reader succeeds, BEGIN IMMEDIATE rechecks full history and
head under the write lock. A batch row, all stable receipt IDs, unique per-book
job IDs and clock metadata commit together. A failed later insert/check rolls
back all writes. Concurrent same-receipt captures through separate handles yield
one insertion and one exact replay; other stale heads fail without head refresh.

A safe nonnegative per-capture monotonic host clock and original reader completion
time are checked after RPC, after lock, after scans/writes and after metadata
update before commit. Observation age may not exceed5seconds at these samples.
Original readerObservedAtMs, recordedAtMs and digest are preserved on exact retry;
replay still calls the reader and never renews stored evidence or allocations.
Stored records remain historical, even after a successful reread. Time can change
after the final sample; no global persistent clock, general filesystem deadline,
atomic RPC/SQLite settlement or power-loss certification is established.

A successful reread of the same transaction with different normalized policies or
receipt observations permanently quarantines the book instead of replacing the
original. A different positively observed transaction containing an already
recorded job also quarantines. Original history/head/index remain intact. The
book stores the quarantine flag, not a complete second-conflict forensic record;
retain operator failure evidence separately. There is no built-in recovery path.
A reader/network/policy failure alone writes nothing and does not prove a reorg.
Inspect history after a crash/uncertain result before explicitly retrying the
original request; never refresh the head silently or initialize a replacement.

## Bounds and acceptance boundary

The book stops at64 batches/1024 receipt labels,96KiB per document and a16MiB main
file bound. WAL/temporary files, process memory, privileged-host consistency and
VFS availability are not covered by that file-size check. Exact retries remain
available at capacity; no history is deleted. Hash links, policy checksums and
SQLite constraints are local consistency, not independent anchoring, tamperproof
storage or authentication; a trusted host can rewrite/truncate/copy the book.
Deduplication is per book and fixed escrow/client; different books/jobs can still
represent duplicated economic intent. There are no cross-asset totals, cash,
liability consumption, profit, buybacks, burns or public claims from these rows.

Two clients of one fixture are not independent providers. Existing20-second read
fences and height-based confirmation checks do not establish EIP1898, consensus,
finality, pre/post balances, work delivery, IP, fairness or global solvency. Every
read/capture result retains null current authorization and false execution,
provider independence, finality, capital-origin, identity, delivery, solvency and
full-readiness flags. No CLI, HTTP, MCP, scheduler, signer or financial adapter is
added. Full P19/testnet readiness/audit handoff and all release gates remain.

## Compiled local escrow integration

The zero-account WorkEscrow runtime now feeds its existing actual two-asset
`approveResultsMany` receipt through the unchanged book. It compares the stored
receipt digest/IDs, per-asset payments, reader/recording timestamps and one-batch/
two-job SQLite index against the existing receipt-reader observations. Read-only
reopen and explicit replay preserve the entire stored view; a wrong later-job
policy rejects without changing or quarantining the valid history.

Before/after height, all fixture-role latest/pending nonces, escrow/client/worker
asset balances and per-asset reserved liabilities must remain unchanged during
book operations. Only temporary SQLite storage is written. The test deletes the
book afterward; retained reports/logs are not a retained database or power-loss
certificate. Existing ten-job and separate worker-submission lifecycles remain.

This is one local VM with compiled escrow and synthetic assets, using VM
impersonation and zero generated accounts/keys/public broadcasts. Two read clients
are not independent providers. The integration does not exercise an actual
chain reorg or conflicting positive receipt against this compiled VM; those book
conflict cases remain HTTP-fixture evidence. It does not establish public custody,
legitimate capital, live deployment, identity, delivery, IP, fairness, consensus,
financial settlement, full P19 readiness or audit/mainnet approval. No book,
reader, contract, Standard/root pins, authority or release gate is changed.
