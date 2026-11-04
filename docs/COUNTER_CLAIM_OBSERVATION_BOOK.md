# Local Counter batch-claim observation book

This disabled-by-default library connects the actual unchanged
`inspectCounterBatchClaimReceipt` to protected local SQLite for M06/P10
reconciliation. It stores historical observations, not financial settlement,
current entitlement, a public payout ledger or a badge. It is separate from the
Work observation book and frozen Standard. No contract or existing API changes.

## Explicit local use and boundaries

Import `CounterClaimObservationBook` from
`scripts/counter-claim-observation-book.mjs`. Both explicit fresh `initialize`
and opening require `{enabled:true}`. Initialize creates one exclusive0600 file
at an absolute filesystem path. Existing empty/foreign/invalid files never
initialize or repair. Relative, URI, memory and Buffer paths are unsupported;
symlinks, hardlinks, loose permissions and files above16MiB reject. The host,
parent directories, filesystem and clock remain trusted; there is no general
filesystem deadline, encryption, immutable archive or power-loss certificate.
The16MiB ceiling applies to the main file, not total WAL/filesystem usage.

The fixed policy is exactly chainId97, escrow/runtime hash, governor, guardian,
launchToken/runtime hash and recipient. This labels the selected project/recipient;
it does not prove holder eligibility, wallet ownership, legitimate funding or
creator consent. Default opening is read-only. Explicit `{readOnly:false}` permits
`capture(twoClients, completeReaderPolicy, originalExpectedHead)`; it never signs,
submits transactions, claims money, resets, prunes or starts a service.

Capture first validates literal bounded input and the existing book/head/capacity
without RPC. It copies input before awaits and calls the real batch reader, with
its unchanged20-confirmation/head-gap/two-client/runtime/role/receipt bindings and
real20-second monotonic lifetime. The complete1–32 claims may contain up to10
assets. This library adds no provider, oracle, index or finality qualification.

After a successful read, BEGIN IMMEDIATE rechecks full stored history, schema,
policy, hash chain, unique receipt/round index and expected predecessor before
committing. WAL/FULL and a five-second SQLite lock wait remain local durability
settings. One safe monotonic host clock spans preflight through commit; original
reader observations must be at most five seconds old at each commit fence.
Expiry/reversal/invalid clock or changed head rolls back writes. Time may change
after the last sample; no global clock or atomic external settlement is proven.

Each immutable observation stores original record/reader times, transaction,
receipt checksum, exact per-asset base-unit amounts and stable evidence IDs.
Canonical positive uint256 quantities, sorted rounds and claim-log indices1–
99,999,999 are application bounds. There are at most64 observations of96KiB each,
32 receipts per observation and64KiB capture inputs. There are no cross-asset
sums, token decimals, monetary values, balances, available-capital estimates or
receipt-backed badges. A checksum/hash chain is consistency, not authentication.

## Retry, conflicts and uncertainty

An exact original transaction/policy/predecessor retry re-reads RPC but returns
the original digest, sequence and times without renewing stored history. A wrong
retry predecessor rejects. Two handles racing one receipt insert one observation.
At capacity, new captures fail before RPC; exact prior retries remain possible.
If persistence fails, the exception cannot guarantee quarantine; stop writes and
inspect storage rather than assuming a successful block. Different valid receipts
for an already recorded transaction, or another valid
transaction paying a recorded round to this recipient, persist quarantine before
rejecting. Reopening retains all original entries/IDs/times/head and quarantine;
subsequent capture rejects before RPC. There is no unquarantine/reset API.

Transport or missing/invalid-receipt failures reject without appending and do not
automatically quarantine or certify old records as canonical. This is not a
background reorg monitor. After crash/output failure, a commit or quarantine may
already exist: inspect existing history before explicit original retry; never
refresh a predecessor, initialize a replacement or blindly replay financial work.
Deduplication is only per book; copied books or privileged rewritten histories
are not global consumption, completeness, independent anchoring or recovery.

Reads always return currentAuthorization:null and false execution,
independent-provider, finality, eligibility, fee-funding, capital-origin,
pre/post-balance, global-solvency and full-Counter-readiness claims. Records can
identify recipients and transactions; protect plaintext and obtain separate
permission before sharing real records with any client/model. No real policy or
book is configured, and no HTTP, MCP, model or public service is enabled. The
separate local operator command below is also disabled by default.

## Explicit operator command (M06/P10)

`scripts/counter-claim-observations.mjs` connects an existing reviewed book to
the unchanged book/receipt engine. With `FORTUNE_COUNTER_BOOK_ENABLED=true`:

```sh
node --import ./scripts/register-ts.mjs scripts/counter-claim-observations.mjs read /absolute/config.json
```

The exact config keys are `bookPath`, `bookId` and `policy`. `bookId` is the
existing book's public64-character lowercase hex identifier, not a credential;
`policy` is the fixed policy described above. The command cannot initialize an
absent/empty book, reset history, repair corruption or clear quarantine. Read
opens read-only, needs no RPC configuration and returns the bounded full history
including quarantine and original times. This is identifiable plaintext; obtain
permission for real data disclosure and protect output as well as storage.

Capture additionally requires `FORTUNE_COUNTER_BOOK_WRITE_ENABLED=true`:

```sh
node --import ./scripts/register-ts.mjs scripts/counter-claim-observations.mjs capture /absolute/config.json /absolute/request.json
```

The exact request keys are `input` (the complete existing batch receipt policy)
and `expectedHead` (the original lowercase64-character predecessor). Config is
at most16KiB; request is at most68KiB, including the book's unchanged64KiB input
bound. Reads use opened nonblocking regular descriptors, limit-plus-one buffers,
strict UTF8 JSON and finally-close. Regular config/request symlinks remain
supported; the book's stricter no-alias path rules remain unchanged. This is not
a general filesystem deadline or protection from a privileged host swapping files.

Read-only identity/history/quarantine/head/capacity preflight precedes reopening
the book for writes. Identity and predecessor are rechecked after reopening;
the book still rechecks under its SQLite write lock. Exact retry uses its original
predecessor, re-reads RPC and returns original sequence/digest/times. The command
does not refresh heads, loop, automatically retry or recover anything.

Capture uses `FORTUNE_COUNTER_READ_RPC_URL` and
`FORTUNE_COUNTER_SECONDARY_RPC_URL`: distinct HTTPS origins, no userinfo/fragment,
five-second transport timeout, no redirects/retries and omitted browser credentials.
URLs/errors are never printed. Config/request bytes are pinned before/after all
seven awaited reader methods with original receivers. The engine's20-second
lifetime and five-second book commit freshness remain unchanged; in-flight RPC
is not canceled. Trusted host/files/clock/providers and height-call limits remain.

Output includes a config-byte SHA256 consistency checksum, never authentication.
Capture returns the original book result, not money, a claim submission, badge,
current consent or readiness. A failure may follow a committed observation or
quarantine, including an output failure: inspect existing history before explicit
original retry. Never infer no commit, reset a book or replay financial work from
the exit code. No real book/config/provider setup or service is enabled here.

## Evidence scope

The actual HTTP/ABI reader→SQLite tests cover replay/reopen,1/32 claims,64-record
capacity, racing handles, clock rollback/expiry, late/provider failures, literal
input, file protections and committed history/index/schema corruption. The
separate `contracts-omnichain/scripts/counter-claim-book-runtime.mjs` uses actual
compiled Counter contracts and synthetic assets on one zero-account local VM:
whole two-asset claims, rollback/missing receipt, valid alternate payment,
persistent conflict quarantine and unchanged reader chain state. Both clients
use that one fixture. Temporary databases are deleted. These are not independent
public providers, public reorgs, real eligibility/capital/custody, retained backup,
full M06/P10 delivery, audit approval or mainnet readiness.

Actual child-command HTTP/ABI/SQLite tests cover offline reads,1/32 claims,
replay/original times, disabled/write gates, stale predecessor, wrong book/policy,
missing book, changed inputs, later-claim/provider failures, persistent quarantine,
UTF8/byte bounds and Linux writerless FIFOs. A TEST-ONLY preload maps two synthetic
HTTPS origins onto one loopback server; production has no mapping hook. The compiled
local Counter drill also runs the command against its actual two-asset receipt,
replay/offline history and alternate-payment quarantine without changing chain
state. These do not establish independent providers, public reorg/custody, real
creator/holder permission, retained storage, operational recovery or full readiness.
