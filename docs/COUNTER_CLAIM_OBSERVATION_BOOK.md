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
book is configured, and no CLI, HTTP, MCP, model or public service is enabled.

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
