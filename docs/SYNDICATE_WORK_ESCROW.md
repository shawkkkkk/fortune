# Isolated testnet scoped-work escrow

## Disabled batch-waiver observation operator command (P19)

work-waiver-observations.mjs read <config> reads existing history without RPC.
An explicit capture <config> <request> requires separate
FORTUNE_WORK_WAIVER_BOOK_ENABLED and FORTUNE_WORK_WAIVER_BOOK_WRITE_ENABLED gates
and calls the unchanged waiver book and complete receipt reader exactly once.
The16KiB config pins the existing book ID/path/worker policy; the68KiB request
pins complete policies and the ORIGINAL expected predecessor. Bounded nonblocking
regular descriptors and strictUTF8/JSON reject FIFOs, excess bytes and extra fields.
Two distinct HTTPS origins,5second transport/no redirects/retries/credentials,
and literal config/request bytes checked before/after all7 awaited RPC methods
preserve the reader's20second lifetime and book's5second commit freshness.
No initialization, head refresh, repair, reset, loop, recovery or signing.

Actual child→HTTP/ABI→SQLite tests cover1/2/16 mixed-client/asset refunds,
read/reopen/retry times and IDs, gates/foreign IDs/stale heads, late failures,
changed inputs, private provider errors, strict bounds/UTF8 and writerless FIFOs.
The existing compiled zero-account drill invokes the actual command for read,
immutable retry and later-bad-policy rejection against its existing two refunds.
No new financial transaction, mining or clock change; old state/snapshot checks
remain. Synthetic HTTPS origins reach ONE local fixture, not independent providers.

Config SHA is a checksum, not authentication. Failure/output loss may follow
commit/quarantine: inspect history before explicit ORIGINAL retry; never renew
the predecessor. Trusted host/files/clock/RPC can change after the last check;
this is not a general filesystem deadline, power-loss or recovery certification.
Permission/privacy review is required before storing/sharing real wallet metadata.
No real config/service/cash totals/badges/financial authority; authorization null,
execution/readiness false. Full P19/audit/public deployment remain unfinished.
Standard/root pins, existing book/readers/commands and release gates stay unchanged.

## Durable batch-waiver observation book (P19)

The separately disabled WorkWaiverObservationBook calls the unchanged complete
batch-waiver reader and stores each original client's refund in its own asset
units. Explicit exclusive0600 initialization, existing protected absolute files,
read-only default, worker/runtime/role policy, WAL/FULL, expected predecessor,
64 batches of up to16 jobs, 96KiB documents and a5second commit freshness fence
constrain capture. Separate schema rejects result-payment books; no migration.
Full history/hash-chain/index validation, transaction/job/evidence deduplication,
immutable original retry records and permanent conflict quarantine survive reopen.
New positive conflicting observations quarantine; failed RPC/invalid policies
do not manufacture replacement evidence. No reset, repair, prune, recovery,
CLI, service, signing, cash totals, badges or financial authority.

Actual HTTP/ABI plus SQLite tests exercise mixed clients/assets,1/16 jobs,
capacity, concurrent handles, corruption, clock rollback/expiry, replay and
positive changed-block/job conflicts. The existing zero-account compiled drill
now captures its two actual refunds, reopens/replays original times/digests and
rejects a later bad policy without writes; existing snapshot/state assertions
remain. No added financial transaction, mining or clock override.

Host storage/clock/policy/RPC remain trusted; local hash chains are rewritable,
not independent anchors. Deduplication is per book only; separate payment and
waiver books are not atomic/global settlement. Uncertain output may follow commit
or quarantine: inspect existing history before explicit original retry. No silent
head renewal or unquarantine. Temporary drill DB is deleted; no retained storage,
power-loss certification, public reorg/recovery, independent providers, legitimate
capital, identity, delivery/IP/legal/fairness, audit or fullP19 readiness proof.
Authorization stays null; execution/readiness flags stay false. All gates remain.

## Complete worker batch-waiver receipt observation (P19)

inspectAllWorkBatchWaivers requires COMPLETE ordered policies for all1–16 call
entries before RPC: common batch/worker/runtime/roles, exact job IDs/revisions,
consistent per-asset code/cap pins, and each original client/amount/terms policy.
It calls the actual unchanged selected-job reader for EVERY entry under ONE
shared real20second monotonic lifetime, original RPC receivers and finally fences.
All receipt reads must share a bounded normalized whitelist digest and header;
every settlement ID is distinct and MUST be deduplicated downstream. Refunds
retain individual asset/base-unit amounts; no cross-asset total or consumed ledger.
The digest is consistency, not authentication. The selected API still reports
otherBatchJobsVerifiedfalse; the complete API marks allCallEntriesObserved only
after every selected observation passes. No CLI/service/signer/new configuration.

Tests cover1/2/16 entries, mixed clients/assets, complete-policy preflight with
zeroRPC, later failures, receipt changes, own slots, receiver binding, intermediate
clock reversal and shared timeout/late-follow-on fences. The existing compiled
zero-account waiver rehearsal reads both actual refunds through the whole engine,
checks replay digest/IDs, rejects incomplete/later wrong policies, and preserves
its original height/nonces/balances/liabilities via the existing snapshot restore.
No new financial transaction, mining or clock behavior. Existing selected engine,
contracts, root pins and old tests remain unchanged; workflow adds only two paths
in both triggers. One local fixture is not independent providers/public custody,
capital/identity/delivery/IP/legal/fairness/finality/recovery/audit/fullP19 proof.
Authorization remains null and execution/readiness false; all gates remain.


## Selected batch worker-waiver receipt engine (P19)

The explicit read-only inspectWorkBatchWaiverReceipt library API observes ONE
selected refund in direct chain97 waivePaymentsMany calldata containing 1–16
sorted job IDs and exact revisions0–32. It binds worker/call/receipt/block/log
indices, runtime/role/asset/job terms and receipt-height latest revision; exact
positional Transfer/JobSettled/PaymentWaived events must return whole principal
only to the selected original client. Shared two-client20confirmed/gap10,
20-second monotonic lifetime/fences and reread guards remain. Stable settlement
IDs MUST be deduplicated; repeated observations are not additional payments.
Other jobs' terms/assets/amounts/storage are NOT verified; otherBatchJobsVerified
stays false. No batch totals, consumed ledger, CLI, service, signer or new config.
Existing direct APIs, contracts, root pins and authority gates stay unchanged.

The zero-account compiled waiver drill uses a snapshot-restored block to observe
both existing refunds at20confirmations via actual HTTP/ABI, repeat stable IDs,
reject wrong amounts/direct-route confusion and preserve balances/liabilities,
height and role nonces during reads. The snapshot is restored before old replay
assertions. No extra financial transaction or clock override; two clients still
reach ONE local synthetic fixture, not independent providers or public custody.
Always null current authorization/false execution, provider independence,
finality, capital/identity/delivery/IP/legal/fairness and full-readiness claims;
full P19 and audit/deployment qualification remain unfinished.


## Own-topic validation in work receipt readers (P19/P10)

Both shared receipt topic validators now require own canonical bytes32 values at
all three expected slots; receipt rereads also require own slots before JSON
comparison (which would otherwise serialize inherited values). Missing slots and values supplied only by an array
prototype reject before canonical event comparison or batch digesting. Payment,
result, cancellation, expiry, worker refund, arbitration and selected/all-job
batch routes preserve their calldata, amount, runtime, role, confirmation,
20-second lifetime, reread, stable-ID and null/false authority rules. Tests cover
every log/slot, either peer, initial/reread/both observations, inherited slots
and dense controls. Two new groups fail on old source; dense controls pass.
JSON cannot encode holes; this is an in-process client-result boundary, not a
claimed public JSON-RPC exploit. No contract, schema, ledger recovery, signer,
configuration or financial authority change; full P19/P10 remains incomplete.


`FortuneTestnetWorkEscrow` is an unaudited chain97-only P19 settlement primitive.
It is separate from project treasury agents, frozen Standard, holder rewards,
Social Fees, Counter and managed liquidity. There is no deployment script, public
address, UI, job marketplace, signer, agent-to-agent access or activation approval.

A constructor fixes three distinct governor/guardian/arbitrator addresses and
1–10 sorted ERC20 assets with runtime hashes and positive per-job base-unit caps.
No role or asset policy can change. The default is paused. Governor opens/pauses;
guardian can only pause. Every mutable entry is chain97 and nonReentrant. Pause
blocks new funding, acceptance, cancellation, payment and arbitration alike.
A compromised/unavailable governor can delay all exits; pause is not recovery.

A client explicitly funds a new job from its own wallet, naming a distinct
worker, supported asset, positive amount, nonzero terms hash, acceptance deadline
within one day, and later delivery-review deadline within seven days of funding.
Arbitrator cannot be client or worker. New transferFrom must debit client and
credit escrow by the exact amount; donations and older jobs cannot substitute
for funding. Existing backing must cover all reserved liabilities first.
Job IDs increase; terms, parties, asset, amount and deadlines cannot be edited.
A terms hash is supplied data, not verified content, IP/license or agreement.

State transitions are explicit:

- Funded → Accepted: only the named worker, through the acceptance deadline.
- Funded → Settled: client cancels before acceptance; after acceptance expiry
  anyone may return the full amount only to the original client.
- Accepted → Settled: only explicit client payment approval, all to the worker.
- Accepted → Disputed: either party; after the delivery-review deadline anyone
  may open dispute, without deciding who should receive funds.
- Disputed → Settled: only the fixed arbitrator selects worker amount from zero
  through the funded total; the exact remainder returns to the original client.

Delivery expiry does not automatically approve work, pay a worker or refund an
accepted job. Disputed funds can remain locked indefinitely if arbitration is
unavailable. The arbitrator's decision is trusted, not mechanically fair or an
independent legal determination. External identity, common control of wallets,
work quality/delivery, authorship, terms preimages, dispute evidence, consumer
protection and jurisdiction are not verified by these role checks.

Per-asset reserved amounts equal all unsettled job principal. Settlement marks
the job terminal and reduces liability before two recipient-bound transfers;
failed/inexact/taxed transfers revert both payments and state. Backing and runtime
changes fail closed. No amendment, expiry sweep, arbitrary destination, fee,
protocol revenue allocation, arbitrary call, native handling or admin withdrawal
exists. Blacklisting, rebasing/proxy changes and pause can strand funds; no
insurance or generic recovery bypass is provided. Code hashes are not token,
issuer or proxy safety certification. Legacy `fund` creates a new job each time. The optional `fundWithId` method
requires a nonzero public client-scoped ID and permanently binds successful IDs
to job numbers through `fundingJobs` and `FundingBound`. Every reuse by that
client rejects before another transfer, even with changed terms or after
settlement. Failed funding rolls back the binding and permits explicit retry.
The same ID under another client's wallet is a separate namespace. IDs carry no
identity or financial authority, are not secret, and cannot be reset/pruned.
Changing IDs or using legacy funding can still intentionally duplicate a job;
this is not cross-wallet intent recognition. Preserve the original ID, inspect
receipts/state after uncertain outcomes, and never silently generate a new ID.
New contract source/runtime requires fresh evidence; old deployments do not
acquire this method or audit approval.

Client custody of funding is not proof of legitimate capital origin. Never use
creator/holder/LP liabilities or launch reserves as agent capital. This contract
does not claim project fees, sell fee tokens, process launch-token-side fees or
fund platform recirculation. Burn-only fee rules and separate allocation ledgers
remain unchanged. A payment event is a transfer record, not a work, identity,
research performance or receipt-backed reputation verdict.

The workflow compiles tests and runs an actual newly compiled contract through
viem HTTP/ABI on pinned Anvil1.7.1 with zero generated accounts and local VM
impersonation. Four funded jobs cover explicit acceptance/payment, cancellation,
arbitrated split, failed taxed split preserving liability with explicit retry,
and unaccepted expiry refund. Events bind exact job/amounts/client approver;
worker/client balances and final reserved zero are checked. Unit/fuzz/invariant
coverage checks conservation, roles, deadlines, failure atomicity and backing.
Synthetic assets and one local fixture are not public deployment, independent
providers, real parties/work, operational arbitration or complete P19 readiness.

Exact-source deployment/audit/legal, capital and asset policy, signer/governance,
identity/privacy, durable auth/quotas, disputes/recovery, public receipt/indexing
and operations gates remain separate and fail closed. No real stores, keys,
accounts, signatures, funded workflows or public transactions are needed here.

## Optional worker result revisions

While Accepted and through the delivery-review deadline (inclusive), the named
worker may submit a nonzero result hash with the exact expected previous revision.
Up to 32 append-only revisions are stored; identical consecutive hashes, stale
revision writers and writes after dispute/settlement reject. Earlier commitments
are never overwritten. ResultSubmitted binds job, worker wallet, revision and hash.
No content, URL, identity, author, IP/license, quality or delivery is verified or
fetched. Avoid commitments to sensitive/low-entropy data without privacy review;
a hash onchain is public and permanent, not an anonymity guarantee.

The optional approveResult method requires the original client, Accepted state
and exact current revision/hash before whole-amount settlement. A worker update
invalidates a prepared older approval. ResultApproved plus JobSettled bind the
consented revision and actual recipient-bound transfer. An inexact transfer
reverts both events/payment/state; revision history and liability remain for
explicit review/retry. No submission automatically pays, approves work, changes
deadlines or prevents existing dispute/arbitration. Legacy approvePayment still
permits explicit unbound client consent, including jobs with no result. This is
not identity/authenticated creator integration or complete Syndicate delivery.
New isolated source/runtime needs fresh evidence; old deployments/audits are not
upgraded. The local runtime preserves the original four settlements and adds a
fifth job with two revisions, stale/wrong approval and taxed-transfer rejection,
explicit retry and revision/payment receipt binding.

## Voluntary worker payment waiver

The optional `waivePayment(id, expectedRevision)` lets only the named worker of
an Accepted job forgo the entire unpaid principal and return it to the original
client. It works before or after the delivery deadline while the escrow is open
on chain97. The exact current result revision, including zero when no result
exists, must match; a concurrent result update invalidates prepared waiver bytes.
Funded, Disputed, missing and settled jobs reject. Client/governor/guardian/
arbitrator cannot invoke this worker power. Disputed jobs still use arbitration.

Settlement reuses the existing exact refund/backing/runtime checks and reserved
liability accounting. `JobSettled` and `PaymentWaived` identify the job, worker
caller, complete client refund and consented revision. Failed/inexact transfers
revert state, liabilities and both events; explicit retry is required. Existing
result history and successful funding IDs are never erased. No partial waiver,
arbitrary recipient, fee, sweep, pause bypass or new arbitrator power is added.
Legacy payment, cancellation and dispute methods remain available.

A worker waiver is a voluntary contract action, not proof of mutual legal
agreement, cancelled work, delivery, fairness, identity or IP/license transfer.
It relinquishes all payment on this job; wallet software must disclose that
consequence and require fresh consent. Transaction ordering decides competing
payment/dispute/waiver calls: the first valid state transition wins, and later
calls reject. This does not undo an already paid job or add automatic refunds.
Pause, incompatible assets and trusted arbitration can still strand funds.

Unit/fuzz/invariant tests include the waiver in liability conservation. The
zero-account local HTTP/ABI rehearsal preserves all five previous jobs and adds
a sixth with current-revision/refund-receipt binding, stale/unauthorized calls,
inexact refund rollback and explicit retry. One synthetic asset/EVM is not a
public escrow, real worker/client identity, independent providers or full P19
readiness. Changed bytecode requires fresh deployment/audit evidence; no earlier
contract's deployment, signatures or approval transfer to this source.

## Worker decline before acceptance

`decline(id)` lets only the named worker return the entire funded principal to
the original client while the job is still Funded. It works before or after
`acceptBy`, only on chain97 while open. Accepted jobs cannot use this method;
their existing payment, revision-bound waiver and dispute paths are preserved.
The first valid acceptance, cancellation or decline wins; later calls reject.

Decline reuses exact refund, asset runtime, backing and reserved-liability
checks. `JobSettled` and `JobDeclined` bind the job, worker caller and whole
client refund. A failed/inexact transfer rolls back the state, liabilities and
events; retry is explicit. Immutable terms and permanent client-scoped funding
IDs remain stored after decline. There is no arbitrary recipient, partial
refund, fee, automatic action, pause bypass or new governor/arbitrator power.

Unit/fuzz tests and the liability invariant cover decline. The zero-account
local HTTP/ABI rehearsal retains all six prior jobs and adds a seventh with
unauthorized-call rejection, inexact-refund rollback, explicit retry, exact
recipient/amount receipt checks and terminal-state rejection. This is one local
synthetic asset/EVM, not public deployment, verified parties or independent
providers. Decline does not establish legal cancellation, fairness, work
delivery, identity, IP rights or legitimate capital origin. Changed bytecode
requires fresh deployment and audit evidence; full P19 and all release gates
remain incomplete. Never use creator/holder/LP liabilities or launch reserves
as strategy capital; this component changes no fee allocations.

## Optional revision-bound disputes

`disputeResult(id, revision, resultHash)` lets only the original client or named
worker dispute an Accepted job against its exact latest nonzero submitted result.
A newer worker revision invalidates previously prepared dispute calldata. The
contract records `disputedResultRevision`, emits JobDisputed and ResultDisputed,
and retains the revision/hash after resolution. It neither pays nor releases
liabilities when opening a dispute. Result submission and payment/waiver stop once
Disputed; the existing fixed arbitrator and exact split settlement remain required.
The method works before or after deliverBy, subject to the unchanged chain97,
open-state, non-reentrancy and asset-runtime checks.

Legacy `dispute(id)` remains available with its original roles/deadline semantics,
including permissionless opening after deliverBy. Its zero disputed revision means
no revision binding, not absence of submitted results. No result or legal dispute
is required for that legacy route; zero is not a safety verdict. First valid
payment, waiver or dispute wins. Hashes remain public, permanent, unverified content
commitments; neither revision binding nor arbitration proves delivery, identity,
authorship, IP rights, fairness, legal agreement or legitimate capital origin.

Tests and the actual eight-job compiled escrow/HTTP/ABI local rehearsal cover
stale rejection, exact event fields, locked liabilities and retained revision
through split settlement. One zero-account local VM with impersonated roles is not
public custody or real-party authorization. The changed runtime requires fresh
deployment/audit evidence; no old deployment evidence transfers. No public service,
signer, deployment, financial authority or full P19 readiness is enabled. Frozen
Standard, root pins, economics and release gates are unchanged.

## Pinned job-state observation

`inspectWorkEscrowJob` in `lib/work-escrow-observation.ts` is an explicit read-only
library API, with no automatic invocation, HTTP/CLI/MCP surface, service or real
provider configuration. A strict supplied chain97 policy fixes escrow and asset
runtime hashes, distinct immutable governor/guardian/arbitrator, job ID, client,
worker, amount, terms hash and asset per-job cap. Addresses/hashes use canonical
lowercase; IDs/amounts/caps are exact positive bounded decimal strings. Unknown
policy fields, missing jobs and mismatched identities/terms fail closed.

Two distinct read-client objects select their common minimum head minus twenty,
with head gap at most ten. Every code/contract call uses that same height. The
reader checks matching block number/hash/timestamp, snapshot age at most 120
seconds (including completion after waiting for either client), escrow/asset
runtime, immutable roles, asset hash/cap, next-job bound, pause state and all job
fields. Funded, Accepted, Disputed and Settled states are supported, including
paused escrow. This observation grants no action or pause bypass.

It reads all zero-to-32 stored result revisions in order, rejects missing/zero or
consecutively repeated hashes, and checks state/disputed-revision consistency.
A zero disputed revision can accompany submitted results under legacy dispute;
it does not mean no result or no dispute. Commitments are public, permanent and
unverified; no preimage/content/URL is fetched. The selected job's outstanding
principal is its whole amount until Settled, then zero. That amount must fit the
asset's reported reserved liability, and reported balance must cover reserved.
Other jobs and assets are not enumerated; this is not a global solvency, capital
origin, asset/proxy safety or holder/creator/LP allocation proof.

One real twenty-second wall deadline and safe nonnegative monotonic host clock
bound the whole read. Before/after fences wrap every awaited RPC and stop new
follow-on reads after success, failure or timeout, preserving original method
receivers. Finally closes the lifetime on every outcome. Already in-flight work
is not cancelled; host/event-loop scheduling, trusted policy/clock/RPC and
height-addressed reads remain limitations. Matching clients do not establish
independent providers, EIP-1898 hash calls, consensus, finality or ABA/reorg safety.
A successful returned snapshot is historical, not current authorization.

`workerPaid`, `clientRefund` and `settlementTransaction` always remain null, even
for Settled storage. The observer does not reconstruct settlement receipts or
identify whether payment, cancellation, decline, waiver or arbitration settled
the job. Settlement-receipt, identity, delivery, dispute-fairness, capital-origin,
provider-independence, finality, global-solvency, execution and full Syndicate
verification remain false; current authorization is null. No unsigned action,
signing, transfer, persistence, automatic retry or renewed trust is produced.
Review privacy before storing or sharing identifiable wallet/commitment metadata.

Focused tests cover all states, pause, 32 revisions, exact policy/term/asset and
backing failures, provider/header disagreement, stale completion, clock rollback,
late work and a real twenty-second timeout. The existing eight-job zero-account
compiled escrow rehearsal now calls the actual observer over viem HTTP/ABI for
Funded/Accepted/paused/Disputed/Settled snapshots, submitted history and foreign
terms rejection, retaining all previous settlement/rollback/retry checks. Two
clients of ONE synthetic local EVM are not independent public providers, real
parties, legitimate funding, public custody or full P19 readiness. No contract,
root dependency, Standard fingerprint, economic allocation, authority or release
gate changes. Exact-source audit/legal/governance, public receipt/service,
provider/finality, privacy, custody/failure/recovery and operations gates remain.

## Default-disabled operator job CLI

`node --import ./scripts/register-ts.mjs scripts/inspect-work-job.mjs <policy.json>`
requires `FORTUNE_WORK_JOB_READ_ENABLED=true`, `FORTUNE_WORK_READ_RPC_URL` and
`FORTUNE_WORK_SECONDARY_RPC_URL`. Supply the exact `WorkJobPolicy` described above
and in the library type, using an already existing regular file. The CLI calls
that unchanged actual `inspectWorkEscrowJob` engine, not a separate projection or
mock. No provider, policy or project configuration is enabled by this source.

Policy reads open a nonblocking read-only file descriptor, require a regular
file and read at most16KiB+1 before enforcing16KiB and strict UTF-8 JSON. Missing,
malformed and foreign policies reject without RPC or file creation. Literal
policy bytes are pinned before and after awaited RPC; mutation discards the
observation. This is not a global filesystem deadline or privileged-host/path-swap
ABA defense. HTTPS providers must have distinct origins and no userinfo/fragment;
each transport has a five-second timeout, zero retries and no redirects or
credentials forwarding. Distinct origins are not independent-provider evidence.
Errors are generic with no policy path, RPC credential or upstream exception.

Output contains the original engine observation and policy SHA-256 byte checksum
(not authentication). Snapshot time is not renewed by formatting. Paused escrow
and Settled storage retain the library semantics: paid/refund/settlement tx stay
null, current authorization null and execution/full-readiness false. No signing,
transaction preparation/submission, writes, automatic retry, trust persistence,
HTTP/MCP, hosted service, model or financial authority is added. Obtain privacy
review before storing or sharing real identifiable wallet/commitment metadata.

Actual child CLI → viem HTTP/ABI tests cover observation/result history, pause,
Settled unknown payments, disabled/preflight failures, unsafe providers, foreign
terms, insufficient reported backing, provider failure, policy mutation, exact
16KiB boundary and Linux writerless FIFO rejection. The compiled eight-job local
rehearsal also calls the actual child CLI for Funded/Accepted/paused/Disputed/
Settled snapshots and compares all same-block engine data including history;
only the independent call timestamps differ. All previous settlement/rollback/
retry checks remain. The synthetic HTTPS test-only preload maps two origins to
ONE zero-account local EVM; it is never loaded by the production CLI and proves
neither public service, real parties/funding nor independent providers. All
contract, Standard/root dependency, economic, audit/legal/privacy/custody/
provider/finality/recovery/operations and full P19 release gates remain separate.

## Atomic client approval of exact results (P19 component)

`approveResultsMany(ResultApproval[] approvals)` is an additive chain97, open,
non-reentrant whole-payment path. It accepts1–16 strictly increasing nonzero job
IDs with explicit revision/hash tuples. The caller must be the original client
of EVERY job; each job must still be Accepted and each tuple must match its
exact latest nonzero submitted revision/hash. All tuples are validated before
any payment. A new result invalidates an older prepared batch; disputed, Funded,
missing, settled, foreign-client and malformed jobs reject the whole call.

Each payment uses the existing `_settle` path: exact recorded whole principal to
the recorded worker, runtime/backing/liability checks and exact vault debit/
worker credit, with existing JobSettled and ResultApproved receipts. There is no
caller-selected amount/recipient, relayer/admin authority, fee, partial progress,
allocation change, native handling, sweep, recovery or pause bypass. A later
failed/taxed transfer, changed asset runtime or insufficient reported backing
reverts ALL earlier transfers/events/states/liabilities. Retain the exact tuples
for explicit retry after resolving the failure; there is no automatic retry or
deadline refresh. Successful replay fails because the jobs are already Settled.

Existing single `approveResult` and unbound `approvePayment`, funding IDs, result
history, cancellation/decline/waiver/dispute/arbitration remain unchanged. As in
the single approval path, a client can explicitly approve an Accepted result
after the delivery deadline; no automatic payment/refund or new legal deadline
rule follows. Separate legacy calls may still settle jobs individually.

Unit/boundary/role/foreign-client/deadline-state tests, conservation fuzzing and an
authorized-client reentry fixture cover the new path. Existing stateful handlers
remain unchanged and do not prove all batch interleavings. The compiled local
zero-account HTTP/ABI rehearsal preserves the earlier eight jobs and adds two
assets/jobs: stale later-revision rejection, later-asset taxed-transfer rollback,
exact retry, canonical settlement/result/transfer receipt fields, replay rejection
and retained history. One synthetic fixture is not independent providers, public
custody, real clients/workers, legitimate capital or operational recovery proof.

Result hashes remain permanent public commitments, not verified content, delivery,
authorship, identity, IP/license, quality, dispute fairness or legal agreement.
Client consent to payment is a wallet role, not a statement that the work was
independently checked. No service, signer, real configuration or financial agent
authority is enabled. Changed isolated bytecode needs NEW exact-source deployment,
configuration and independent audit evidence; old evidence does not transfer.
Full P19/testnet/mainnet readiness remains incomplete. Frozen Standard/root pins,
economics and all asset/custody/capital/privacy/provider/finality/legal/governance/
funding/failure/recovery/ops gates remain. Launch-token-side fees only burn; pair-
asset holder rewards and earned platform recirculation stay distinct; creator/
holder/LP liabilities and launch reserves are never strategy capital.

## Direct whole-payment receipt observation

The separate explicit read-only library `inspectWorkPaymentReceipt` accepts an
exact `WorkJobPolicy` plus transactionHash. It supports ONLY a direct zero-native
original-client `approvePayment(id)` transaction: successful receipt, twenty
confirmations at a common two-client head (head gap at most10), exact mined
transaction/block/index bindings, receipt-height escrow and payout-token runtime
pins, immutable roles, asset policy and exact settled job terms. Canonical adjacent
asset Transfer(escrow, worker, whole principal) and JobSettled(id, principal,0,client)
logs are required; extra/removed/foreign/noncanonical logs reject. Receipt and block
are reread and both clients must agree. Historical receipts are allowed; headers
must not be future-dated, but this is no fresh-state/head-age guarantee.

One real20-second lifetime and safe nonnegative monotonic host clock fence every
awaited read and every outcome. Late peer completions cannot start follow-on reads;
in-flight calls are not cancelled. Trusted host/policy/clock/RPC and height-based
reads are not independent-provider proof, EIP1898 hash calls, consensus, finality
or ABA/reorg-recovery proof. Runtime pins are supplied trust, not independent
security/issuer/proxy review. Receipt events and block-end settled storage do not
independently prove pre/post balances, legitimate capital, global solvency,
identity, delivery, IP, fairness, current consent or legal approval.

The result exposes exact reported workerPaid and zero clientRefund ONLY for this
matched direct path. The old storage observer and CLI remain unchanged with NULL
payment/transaction fields. Evidence ID is chain/escrow/transaction/settlement-log;
repeated reads retain it and MUST be deduplicated by consumers. No durable consumed
ledger, totals, badge, custody service, current authorization or execution authority
is added. Revision-bound payments, atomic batches, refunds/declines/waivers,
arbitrated splits and smart-wallet outer calls are deliberately unsupported by
this reader and reject; their existing contract capabilities remain intact.

Five focused adversarial groups include actual twenty-second timeout/late-response
checks. The unchanged compiled escrow's ten-job/two-asset HTTP/ABI rehearsal now
passes its first actual direct payment through this reader, rereads the stable
identity, rejects a wrong amount and preserves the old settled-storage NULL fields
and all later job/batch/refund/dispute tests. ONE zero-account fixture with two
clients is not public custody, real parties, independent providers, audit or full
P19 readiness. No contract, signer, CLI/HTTP/MCP/service, real configuration,
dependency/root pin, financial/economic policy or release gate changes.

## Separate revision-bound payment receipt observation

`inspectWorkResultPaymentReceipt` is a separate explicit read-only library API
with the same exact WorkPaymentPolicy plus canonical revision1–32 and nonzero
resultHash. It accepts ONLY direct original-client zero-native approveResult
calldata bound to that exact job/revision/hash. The shared receipt engine retains
all old runtime/roles/job/asset/block/confirmation/log-binding/reread/provider/
clock gates, and additionally requires receipt-height latestResultRevision and
resultHashes to match, followed by an exact canonical adjacent ResultApproved
log after Transfer and JobSettled. The third event indexes job ID and revision;
its data is the literal result hash. Missing/extra/noncanonical/stale/mismatched
bindings reject. The legacy whole-payment reader still requires its exact
approvePayment calldata and TWO events, never accepting this three-event route.

Output adds approvedResult with literal revision/hash and a separate source label;
all old authority/readiness limitations remain false/null. It is still a historical
RPC observation, not current consent, independently verified content/delivery,
identity/IP/license/fairness/legal approval, independent providers, finality,
pre/post balances, legitimate capital or public custody. Stable settlement evidence
IDs still require consumer deduplication; no ledger, totals, service, CLI, wallet,
publication, contract, root pin, economics or release-gate change follows. Batches,
refunds, waivers, arbitration and smart-wallet outer calls remain unsupported by
these two readers; all prior contract methods and storage-observer NULLs remain.

The actual compiled ten-job fixture exercises existing job five's result-bound
payment, stable reread, wrong-revision rejection and legacy-reader rejection.
Its PREEXISTING101-second expiry jump can put later local receipt headers in the
future. The initial newly added read failed without exposing raw errors. Before
the new read, the fixture now waits for REAL host time to reach that fixed receipt
timestamp (at most60seconds, monotonic checks), then starts the UNCHANGED20-second
production reader. No Date.now override, header rewrite, source trust renewal,
clock/confirmation bypass or workflow timeout increase is used. This test-only
wall wait is not a public-service policy or diagnosis of earlier CI failures.
Eight focused test groups retain all five legacy groups and add exact result
binding, adversarial field/method/event/storage cases and a separate real20-second
result-mode timeout/late-response fence. ONE zero-account local fixture is not
independent-provider, public custody, full P19/testnet readiness or audit approval.


## Direct original-client cancellation receipt observer

inspectWorkCancellationReceipt is a separate explicit read-only library API,
using the same strict WorkPaymentPolicy and shared bounded receipt engine.
It supports only direct zero-native original-client cancel(jobId) transactions.
The successful receipt must contain exactly two adjacent canonical logs:
asset Transfer(escrow, original client, whole principal), then escrow
JobSettled(jobId, 0, whole principal, original client). It binds transaction,
receipt, block and log hashes/numbers/indices, transaction-list position,
receipt-height runtime/roles/asset cap and settled immutable job terms.
Two distinct clients must agree after the existing rereads, common minimum head
with20 confirmations and head gap at most10. The unchanged real20sec monotonic
clock/failure fences apply to all outcomes; in-flight requests are not cancelled.

The result reports workerPaid zero, clientRefund equal to policy principal,
directCancellationObserved true and a distinct source label. It does not emit
directPaymentObserved. Existing approvePayment and approveResult readers stay
exact and reject cancellation; this reader rejects those payment routes.
The evidence ID remains chain/escrow/transaction/settlement-log index: consumers
MUST deduplicate, never sum repeated reads. No consumed ledger, total or badge
is provided. The old job observer and CLI still leave payment/transaction fields
NULL; every onchain cancellation and other escrow capability remains intact.

Historical receipts are supported without a freshness-age bound, but future
headers reject. Runtime/policy/provider/host trust is required. This does not
prove pre/post balances, legitimate funding, independent providers, EIP1898
canonicality/ABA/finality, current consent, global solvency, identity, delivery,
IP/license, fairness or legal agreement. currentAuthorization remains NULL;
all provider/finality/capital/identity/delivery/global-solvency/execution/full
Syndicate readiness flags remain false. No signing, calldata preparation,
CLI/HTTP/MCP/service/config activation or financial action is introduced.

Third-party expired-job cancellation, worker decline/waiver, arbitrated splits,
batches and smart-wallet outer calls are deliberately unsupported by this API;
no inference of these routes from settled storage is permitted. The actual
compiled ten-job rehearsal observes job two's50-unit direct client cancellation,
stable evidence reread, wrong-amount rejection and both payment/cancellation
route directions. One zero-account local fixture is component evidence only.


## Separate expired-job third-party cancellation observer

inspectWorkExpiredCancellationReceipt takes WorkExpiredCancellationPolicy:
the strict WorkPaymentPolicy plus one explicit lowercase nonzero caller.
The caller must differ from the original client and escrow. It strips caller
before invoking the existing strict base-policy validator; unknown fields still
reject before RPC. Only direct zero-native cancel(jobId) is supported. The
receipt and transaction sender and canonical JobSettled settledBy must equal
that caller. At the receipt height, the stored job acceptBy must be strictly
less than the matching block timestamp: before and exactly at expiry reject.
The whole-principal Transfer recipient stays the original client, never caller.
The exactly-two adjacent-event requirement and all other runtime/role/asset/job,
block/transaction/log/index, confirmation/head-gap and reread checks remain.

Output adds cancellationCaller and a separate source label; the same stable
chain/escrow/transaction/settlement-log ID MUST be deduplicated. workerPaid is
zero, clientRefund is whole principal and directCancellationObserved is true.
Existing direct-client cancellation/payment/result APIs keep exact old output
and route restrictions; direct-client and third-party cancellation readers
mutually reject. No ledger/totals/badge or financial action is supplied. Old
storage observer/CLI NULL payment/transaction semantics and all escrow methods
remain unchanged. No CLI/HTTP/MCP/service/real config is introduced.

The existing REAL20sec safe monotonic clock/failure fences cover every outcome;
in-flight reads are not cancelled. Historical receipts have no freshness-age
bound, future headers reject. Trusted host/policy/clock/RPC height reads are
not independent provider/EIP1898/ABA/canonicality/finality proof. This does not
establish pre/post balances, legitimate funding, current consent, global solvency,
identity, delivery, IP/license, fairness or legal agreement. currentAuthorization
is NULL and all provider/finality/capital/identity/delivery/global-solvency/
execution/full-readiness flags stay false. A governor observed calling the
public expired-job refund method is not new governor privilege or authority.

The compiled ten-job fixture uses the existing30-unit job four cancelled by the
governor after the existing101sec expiry jump. It reads that older receipt only
after the already bounded real-host-clock alignment for job five; no header,
host clock, reader lifetime, confirmation check or workflow budget is altered.
Stable ID/wrong caller/direct-vs-expired route checks are included. Two clients
of ONE zero-account local fixture are not public custody/provider or audit proof.
Worker decline/waiver, arbitrated splits, batches and smart-wallet outer calls
remain unsupported by these receipt APIs and require separate integration.


## Worker decline and revision-bound waiver receipt observer

inspectWorkWorkerRefundReceipt is a separate explicit read-only library API.
WorkWorkerRefundPolicy is the strict WorkPaymentPolicy plus refundKind decline,
or refundKind waiver with canonical decimal expectedRevision0–32. Decline must
not supply expectedRevision; unknown fields and malformed bindings fail before
RPC. The named worker must be direct transaction/receipt sender with zero native
value and exact decline(jobId) or waivePayment(jobId, expectedRevision) calldata.
The receipt has exactly three adjacent canonical logs: whole-principal asset
Transfer(escrow, original client, principal); escrow JobSettled(id,0,principal,
worker); then JobDeclined(id,worker) with empty data or PaymentWaived(id,worker,
expectedRevision). Third-event topic/data arity, emitter, ordering and all original
receipt/transaction/block/index/header bindings remain exact. At the receipt
height, stored latestResultRevision must equal zero for decline or the selected
waiver revision. Waiver revision0 remains supported; revision is not a result
hash/content/delivery/IP verdict, nor a new deadline or automatic settlement.

The shared engine preserves pinned runtimes, roles, asset/cap/immutable job terms,
two-client agreement,20 confirmations/head gap10, rereads and REAL20sec monotonic
safe-clock/failure fences/finally every outcome. In-flight requests may continue
but late follow-on reads are fenced. Existing approvePayment/approveResult/client
cancel/third-party expiry APIs and their output remain unchanged and reject worker
refund routes. Output includes workerRefund kind and waiver revision (NULL for
decline), directWorkerRefundObserved true, zero workerPaid and whole clientRefund.
It omits payment/cancellation-observed labels. Stable chain/escrow/tx/settlement-log
IDs MUST deduplicate: no consumed ledger, totals, badge or reinvestment claim.

Historical-height observations have no freshness-age bound and future headers
reject. Trusted host/policy/clock/RPC height reads are not independent provider,
EIP1898/ABA/canonicality/finality proof, pre/post balances, legitimate capital,
current consent, global solvency, identity, delivery, IP/license, fairness or legal
approval. currentAuthorization remains NULL and all provider/finality/capital/
identity/delivery/global-solvency/execution/full-readiness flags are false. No
contract change, signer, CLI/HTTP/MCP/service/real config or financial action is
introduced; old storage observer/CLI payment fields remain NULL. Arbitrated splits,
batches and smart-wallet outer calls stay unsupported by these APIs.

The compiled ten-job fixture consumes actual job six15-unit waiver at revision1
and job seven25-unit decline receipts, stable rereads, stale waiver revision and
route-separation failures. Its preexisting101sec expiry jump can also put later
worker receipts ahead of real host time: a separate at-most60sec safe-monotonic
REAL wall wait before these readers aligns with the fixed latest receipt header.
No host clock/header override, reader deadline or workflow budget is changed.
One local zero-account fixture with two clients is component evidence only.


## Direct fixed-arbitrator settlement receipt observer

inspectWorkArbitrationReceipt / WorkArbitrationPolicy is a separate read-only
library API. Its strict base policy adds canonical decimal workerAmount0–principal
bounded to uint128. Unknown fields, malformed/out-of-range amounts and a split
above the job principal reject before RPC. Only the pinned arbitrator's exact
zero-native direct resolve(jobId,uint128 workerAmount) transaction is accepted.

Principal is split exactly into workerAmount and principal minus workerAmount.
Zero worker amount requires only an escrow→original-client principal Transfer;
full worker amount requires only escrow→named-worker principal Transfer. An
intermediate split requires TWO transfers in worker then client order, with
exact amounts and recipients, followed by the escrow JobSettled event binding
job/worker amount/refund/arbitrator. No zero-value/extra/foreign/reordered logs
are accepted. All logs are canonical and adjacent, bound to the same mined
transaction/block/indices; the transaction's block-list position also binds.
The shared pinned runtime/roles/asset cap/settled immutable job terms, two-client
agreement/common20confirmations/head gap10/rereads and REAL20sec monotonic-clock
failure/finally fences remain. In-flight reads may continue; late follow-ons
are fenced. Legacy payment/result/client-cancel/expiry/worker-refund APIs keep
their exact outputs/routes and reject arbitration receipts.

Output reports exact workerPaid/clientRefund, directArbitrationObserved true,
a distinct source label and disputeFairnessVerified false. Payment/cancellation
labels are omitted. Stable chain/escrow/tx/settlement-log ID MUST deduplicate;
no ledger/totals/badge. Old storage observer/CLI payment/transaction fields remain
NULL. No contract, signer/calldata builder, CLI/HTTP/MCP/service/config or financial
action is introduced. Batch and smart-wallet outer calls remain unsupported.

Historical receipts have no freshness-age bound; future headers reject. Trusted
host/policy/clock/RPC height reads are not EIP1898/ABA/canonicality/finality or
independent-provider proof. Receipt/state/runtime matching does not prove
pre/post balances, legitimate funding, current consent, global solvency, party
identity, work delivery, IP/license, fairness or legal approval. In particular,
this reader does not reconstruct pre-transaction Disputed state or independently
verify the arbitrator's decision. currentAuthorization stays NULL and all old
provider/finality/capital/identity/delivery/global-solvency/execution/full-readiness
flags remain false. No audit/deployment/mainnet approval transfers.

Actual compiled integration reads the original ten-job fixture's job three
60/40 settlement after its existing bounded clock alignment, checks stable ID,
wrong amount and route separation. A separate synthetic asset/compiled escrow
before the preexisting expiry jump supplies two10-unit boundary jobs (0/10 and
10/0), consumed through actual HTTP/ABI; original ten-job balances/counts and
all rollback/retry/history checks remain. One zero-account fixture with two
clients is not independent providers, public custody or audit evidence.


## Direct whole-payment operator CLI

`FORTUNE_WORK_PAYMENT_READ_ENABLED=true node --import ./scripts/register-ts.mjs
scripts/inspect-work-payment.mjs /protected/payment-policy.json` calls the actual
unchanged `inspectWorkPaymentReceipt` engine. The explicit policy is the existing
WorkPaymentPolicy including transactionHash. This separate default-disabled CLI
accepts only direct original-client zero-native approvePayment(id) receipts;
result approvals, refunds, arbitration, batch and smart-wallet outer calls reject.
The old job observer/CLI still leaves settlement amounts and transaction NULL.

An existing regular file is opened nonblocking, read at most16KiB+1, decoded with
strict UTF-8 and JSON, and literal bytes are checked again before/after RPC. This
is not a general filesystem deadline or privileged path-swap defense. Configure
FORTUNE_WORK_READ_RPC_URL and FORTUNE_WORK_SECONDARY_RPC_URL to two reviewed distinct
HTTPS origins; no userinfo/fragment, redirects or retries; each transport has5sec
timeout. The original20sec reader lifetime, confirmations, runtime/role/asset/job
pins, full transaction/receipt/log/block binding and failure fences are unchanged.

Output wraps the ORIGINAL observation with a SHA-256 checksum of policy bytes,
not policy authentication or approval. currentAuthorization is NULL and execution
and full readiness remain FALSE. Private generic errors emit no provider URL,
policy path or raw exception. No signing, calldata generation, submission, writes,
automatic retry, trust refresh, ledger, badge or service configuration. Stable
receipt evidence IDs MUST deduplicate; repeated reads do not establish more funds.
Historical height reads do not prove EIP1898/ABA canonicality/finality, provider
independence, pre/post balances, current consent, legitimate funding, global
solvency, identity, delivery, IP, legal validity, audit or full P19 readiness.

Actual child CLI HTTP/ABI tests cover strict file/provider/preflight and failures.
Compiled zero-account runtime checks match the CLI against the library's original
whole-payment observation, preserve replay identity and reject a wrong amount.
Two clients of ONE local fixture are not independent providers/public custody.


## Selected result payment in a direct batch

`inspectWorkBatchResultPaymentReceipt` is a separate read-only API for ONE
selected job in direct `approveResultsMany`. Policy adds `approvals`: the exact
1–16 strictly increasing positive uint256 IDs, revisions1–32 and nonzero result
hashes, all detached before awaits. Each entry has exactly id/revision/resultHash;
the selected policy job must occur. Full zero-native original-client calldata,
exact3N receipt logs and selected positional Transfer/JobSettled/ResultApproved
bind to that tuple. Every log retains block/transaction/index binding and bounded
three-topic/one-or-two-word data framing. Selected receipt-height job terms,
runtimes, roles and latest result/hash reuse the original actual reader.

Output explicitly says `selectedBatchResultPaymentObserved:true`, zero-based
batchJobIndex, batchJobCount and `otherBatchJobsVerified:false`. Other jobs'
asset, terms, worker, amounts and storage are NOT verified; never present this as
a complete batch ledger, total, backing/fairness/identity/current-consent or full
Syndicate approval. Stable selected settlement evidence IDs MUST be deduplicated;
re-reading never creates another payment. Direct single-payment/result/refund
APIs keep their strict routes and reject batch outer calls. No signing, writes,
service, CLI or authority is added; all existing false flags remain.

The same two-client20-confirmation/head-gap10/reread/real20-second monotonic-clock
and failure fences apply. Historical height calls are not independent providers,
EIP1898/ABA/finality, pre/post balances or legitimate-capital proof. First/last,
1/16 boundaries, policy/transaction/event mutations and late-reader fencing are
tested. The unchanged compiled ten-job escrow rehearsal feeds its two-asset
batch into the actual observer for each job, replay identity and wrong-amount/
legacy-route rejection, preserving all earlier balances/rollback/retry tests.
Any test-only real-clock alignment precedes the unchanged reader; clocks, headers
and production limits are never replaced. One zero-account local VM with copied
source-matched artifacts is component evidence, not public custody or audit.

## Coherent observation of every result-batch entry

`inspectAllWorkBatchResultPayments(clients, policies)` is a separate library API.
It requires exactly one full selected-job policy for every1–16 calldata entry,
in call order. ALL policies are detached and validated before RPC. Missing,
repeated, reordered or conflicting entries/transaction/escrow/client/role pins,
and conflicting runtime/cap pins for the same asset, reject without RPC.

It invokes the actual selected-payment engine for every entry, under one shared
real20-second deadline and monotonic safe-clock fences around all seven RPC
methods. Original receivers are preserved. Every receipt read from every job and
both clients must have one identical normalized, bounded receipt/log fingerprint;
all outputs must agree on receipt block/hash/timestamp and have distinct stable
settlement IDs. The digest is a consistency checksum, NOT authentication or an
independent chain anchor. Failure or expiry discards the whole result and fences
all jobs' follow-on calls; in-flight RPC is not canceled and event-loop scheduling
is not a process watchdog. Existing per-job lifetime/finality limits remain.

Output `allCallEntriesObserved:true` means all supplied exact call entries were
observed together through trusted configured RPC. `payments` retains each original
selected observation and its own narrow-scope `otherBatchJobsVerified:false`;
the envelope combines their coverage without changing those individual claims.
Amounts remain separate in each payout asset's own units. No cross-asset total,
consumed ledger, capital origin, solvency, identity, delivery/IP, current consent,
provider independence, finality, execution or full Syndicate readiness follows.
All authority/readiness flags remain false and currentAuthorization stays null.
Existing selected-only/direct APIs and all contract methods remain available.

Tests cover complete1/2/16-entry coverage, zero-RPC whole-policy preflight,
late-job mismatches, changing unselected receipt bytes, method receivers and the
actual20sec timeout/failed-peer fence. The unchanged compiled two-asset ten-job
runtime consumes the aggregate observer, matches both original payment IDs,
checks a stable replay digest and rejects a wrong later amount while preserving
old settlement/rollback/retry assertions. ONE zero-account local VM is not a
public custody service, independent provider, audit or full P19/mainnet approval.

## Atomic worker result submissions

The isolated chain97 contract adds `submitResultsMany`, accepting 1–16 strictly
increasing nonzero job IDs with an explicit `expectedRevision` and nonzero
`resultHash` for each job. The caller must be the named worker on **every** job;
clients may differ. Every job must be Accepted and at or before its own stored
`deliverBy`, with unchanged pinned asset runtime, exact current revision below 32
and a hash different from that job's latest hash. All entries are checked before
any history write. Only then does each job append its next revision and emit the
existing `ResultSubmitted` event in call order. Any failure rolls back the entire
transaction, including events; there is no partial-success result.

Submission does not transfer tokens, change liabilities, recipients, job terms,
funding IDs or settlement state, and does not authorize payment. A worker batch
across different clients cannot approve payments for those clients. New revisions
invalidate older **revision-bound** approvals/disputes; legacy unbound
`approvePayment` remains an explicit original-client option. All existing single
submission, acceptance, decline, waiver, dispute, batch approval and arbitration
paths are preserved. Chain97/open/nonReentrant guards and per-job 32-revision caps
remain; no deadline extension, admin bypass, new fees, recovery or automatic action
is added. A paused or uncertain attempt is not permission to resubmit blindly:
inspect receipts/history first. Successful replay with old expected revisions
rejects; an unsuccessful attempt does not consume revisions. Explicit retry still
requires current pause, deadline, role, runtime and revision checks to pass.

Commitments are public permanent hashes, not verified work content, authorship,
identity, delivery, IP ownership/license, fairness or a legal agreement. Review
privacy and low-entropy disclosure before submitting real commitments. This source
change produces new bytecode and needs fresh deployment/audit/governance evidence;
no existing deployment or approval is upgraded. The default-paused isolated engine
and all funding/custody/asset/legal/signature/provider/finality/operations/recovery
release gates remain. Frozen Standard/root dependencies/economics are unchanged.

The compiled local rehearsal preserves the original ten-job escrow and adds a
separate two-job/two-asset escrow for atomic worker events/history, later invalid
revision rejection, replay rejection, explicit retry after pause and exact latest
client-approval payment receipts. Local VM impersonation and synthetic assets are
not public custody, legitimate capital, independent parties/providers or full P19
readiness. No real profile, signer, service, public transaction or config is enabled.

## Atomic worker batch waiver

`waivePaymentsMany(PaymentWaiver[])` is an additive chain97-only contract path.
One named worker may voluntarily waive 1–16 accepted jobs, sorted by strictly
increasing nonzero job ID, with each job's exact latest result revision (including
zero). All worker/state/revision/runtime-pin checks precede the first refund.
Different original clients and supported assets are allowed; every whole
principal returns only to that job's original client. No recipient or amount is
caller-selected. The unchanged exact `_settle(id,0)` path emits `JobSettled`, then
`PaymentWaived` for each entry. History and funding bindings remain intact.

A stale revision, foreign worker, missing/unaccepted/disputed/settled job, changed
asset runtime, inexact later transfer, pause or wrong chain rejects the whole
call. EVM rollback retains every earlier balance, job and liability; explicit
retry of unchanged bytes can succeed only after the underlying rejection is
resolved. Successful replay rejects. As with single waiver, voluntary forfeiture
is allowed before or after delivery expiry; no automatic deadline refund, partial
waiver, admin bypass, fees or dispute verdict is added. First valid settlement or
dispute still wins. Single-job APIs are unchanged; existing direct receipt readers
continue to reject batch outer calls. Batch receipt reconciliation is separate work.

Compiled Solidity tests cover mixed clients/assets/revisions, exact fixed-client
refunds, canonical waiver events, late transfer rollback/retry, role/state/pin and
ordering/bounds rejection, pause/wrong chain, expiry and 1–16-job fuzzing. These
are local VM tests, not a public deployment, legitimate-capital/identity/delivery/
IP/legal/fairness proof or full P19 readiness. Changed bytecode needs fresh review
and deployment evidence; old contract audit/deployment approval cannot transfer.
Frozen Standard/root pins, economic policy and all release gates remain unchanged.

### Compiled batch-waiver RPC rehearsal

`contracts-omnichain/scripts/work-batch-waiver-runtime.mjs` starts its own pinned
Anvil1.7.1 on a fresh loopback port, chain97 and zero generated accounts. No fork,
public RPC URL, clock override, key or signing path is accepted. Fixed local VM
impersonation funds synthetic accounts/assets only. Both compiled artifacts must
match every owned source keccak256 in their metadata before execution.

Two original clients fund separate runtime-pinned assets through permanent public
funding IDs; one worker accepts both and submits revision1 for the second job.
Actual batch transactions reject a stale revision, foreign caller and pause while
preserving financial state. A tax on the SECOND asset forces failure after the
first refund would have run. An actual eth_call must report InexactTransfer
before the mined revert: both clients' balances, escrow backing/liabilities,
job terms/state, result history and funding bindings must remain unchanged.
After explicit fixture repair, the exact original calldata succeeds with six
ordered Transfer/JobSettled/PaymentWaived logs, exact per-asset refunds, no worker
payment, zero liabilities and original result/funding history. A successful replay
rejects and leaves those values unchanged. Failed transactions consume local gas
and nonces; rollback does not mean they were never submitted. Reverted receipts
must contain no logs. Impersonation is stopped and eth_accounts is empty again.

A separate three-minute CI step and retained log/JSON artifact are additive.
Removing the marked step restores the previous workflow byte for byte; old
runtime source/assertions/deadlines/mining/clock rules are unchanged. Failure
exits1 with a fixed stage label and no PASS JSON; stale report removal precedes
artifact/source parsing. A single fixture and synthetic tokens do not establish
independent providers, legitimate capital, identity, delivery, IP, fairness,
public deployment, global solvency, recovery, audit or full Syndicate readiness.
Canonical test receipts are not a production batch receipt observer or consumed
ledger. No contracts, Standard/root pins, economics, service config, signer or
financial-authority gates change.
