# Testnet implementation ledger

This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is recorded in merged PR #61. Preserve the frozen Standard candidate.

## Syndicate atomic revision-bound result approvals

The isolated WorkEscrow adds client-only atomic approval of1–16 sorted job IDs,
each bound to its exact latest submitted revision/hash before any payment.
Existing exact whole-payment settlement preserves fixed workers, runtime/backing/
liability checks and receipts; any later failure rolls back all earlier effects.
Explicit retry/replay rejection and all legacy job paths/history/funding IDs are
preserved. Unit/boundary/foreign-client/reentry/conservation fuzz tests and the
compiled ten-job/two-asset local HTTP/ABI rehearsal cover stale rejection, late
transfer rollback, exact retry and receipt fields. ONE zero-account fixture does
not establish identity/delivery/IP/fairness/legal/legitimate capital/providers/
public custody or full P19 readiness. Changed isolated runtime requires fresh
deployment/audit evidence; no Standard/root pin/economic/authority/configuration
or release-gate changes. See SYNDICATE_WORK_ESCROW.md.

## Local strategy deployment failure visibility

The existing venue-fork rehearsal retains its failure status and all deadlines,
while submitted deployment failures add five bounded read-only loopback
observations with strict transaction binding and sanitized quantity-only output.
A real three-second diagnostic deadline fences late results. Actual zero-account
standalone pending/mined transaction tests exercise the reader without treating
an intentionally stalled fixture as reproduction of prior fork CI failures.
Earlier PR150 timeouts remain unclassified and unapproved; no retry, mining,
fee/nonce change, mock fallback, contract/dependency/root-pin/economic/authority
or release-gate change is introduced. See STRATEGY_EXECUTOR.md for non-atomic,
in-flight/event-loop and evidence limits. This does not complete M01/M07.

## Counter atomic-batch operator review CLI

A separate default-disabled one-shot CLI now consumes the unchanged actual
multi-asset funding review engine using a bounded16KiB strict literal policy
and restricted read providers. Output retains unsigned per-asset amounts/dust,
consecutive IDs and original block/deadline; checksum is not authentication,
authorization null and execution/readiness false. Actual child HTTP/ABI tests
and the compiled zero-account escrow rehearsal consume CLI bytes through
rollback/exact retry/replay rejection and recorded claims. No contract, signer,
approval, persistence, automatic retry, service or real configuration is added.
ONE fixture is not public custody/providers/legitimate capital/holder eligibility
or full M06/P04/audit approval. Standard/root pins/economics/gates unchanged.
See COUNTER_ROUND_ESCROW.md.

## Counter unsigned atomic-batch runtime integration

An explicit read-only library API prepares the existing isolated multi-asset
snapshot funding call through the actual allocation engine for each asset.
Whole-policy preflight, same-snapshot/round agreement, final header/age checks
and one shared20-second clock/failure fence reject partial or late reviews.
Per-asset amounts/dust and consecutive IDs remain separate. Actual compiled
zero-account HTTP/ABI integration executes the returned bytes and preserves
late transfer rollback, exact retry, replay rejection and recorded claims.
No contracts, signer, approval, CLI/service/configuration or financial authority
added. ONE fixture is not public custody, independent providers, eligibility,
fee/capital origin or full M06/readiness/audit approval. Standard/root pins,
economics and every release gate remain. See COUNTER_ROUND_ESCROW.md.

## Counter atomic snapshot funding batch

The isolated chain97 Counter escrow adds governor-only paused atomic funding
of2–10 sorted distinct payout assets, each retaining its own exact newly funded
round/rights/liability and SAME original block/hash/deadline reference with its
actual round ID. Any later failure rolls back every earlier transfer, allowance,
event, snapshot and entitlement; explicit retry and successful-batch replay
rejection preserve the original reference. Legacy single-round/claim behavior
is unchanged. Unit/boundary/conservation fuzz tests and actual compiled zero-
account HTTP/ABI funding rollback/retry/receipt/claim integration cover the slice.
No automatic basket selection/rotation, eligibility/fee/capital proof, gas-cost
optimization, recovery, public custody or full M06/readiness/audit approval is
established. Changed isolated runtime needs fresh deployment/audit evidence;
Standard/root pins/economics/authority/configuration/release gates unchanged.
See [COUNTER_ROUND_ESCROW.md](COUNTER_ROUND_ESCROW.md).

## Syndicate operator job-reader CLI

Default-disabled `inspect-work-job.mjs` consumes the unchanged actual two-client
job reader using a bounded literal16KiB policy and restricted HTTPS transports.
Policy mutation discards output; checksum is only a byte binding, snapshot times
remain original and all authorization/payment/readiness limits are preserved.
No signer, calldata, financial action, persistence, service or real configuration
is added. Actual child HTTP/ABI tests and the compiled eight-job local runtime
compare Funded/Accepted/paused/Disputed/Settled data and result history with the
library, while retaining all earlier settlement/rollback/retry checks. ONE local
zero-account fixture is not independent providers, public custody, verified
parties/capital or full P19/audit/mainnet readiness. Contracts/Standard/root pins,
economics and all gates unchanged. See [SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Social ownership stream work bound

The actual shared social ownership HTTP reader now caps non-final fragments at
4,096 per attempt, including empty fragments, before byte counting/decoding or
ownership projection. Empty/tiny regressions failed unchanged source; boundary,
retry/cleanup and existing actual HTTP/deadline tests cover the fix. Body limits,
eight-second attempt clock/failure fences, one retry and platform fallbacks remain
unchanged. Highly fragmented valid responses may reject; this is not an upstream
memory or whole-verification time/work bound. No attestor/binding/claim/financial
authority, configuration, contract, dependency or frozen Standard changes. Full
M04 and all release gates remain incomplete. See [SOCIAL_FEES.md](SOCIAL_FEES.md).

## Syndicate pinned job-state integration

An explicit chain97 read-only `inspectWorkEscrowJob` library API checks supplied
escrow/asset runtime and immutable role pins, intended job terms, all bounded
result revisions and reported selected liability/backing through two clients
at one twenty-confirmed, rechecked fresh block. Funded/Accepted/Disputed/Settled
and pause state are observed; real twenty-second lifetime/monotonic clock fences
late work. Settled storage does not reconstruct payment receipts: paid/refund/tx
stay null and authorization/delivery/fairness/provider/finality/global-solvency/
capital/execution/full-readiness remain unknown or false. No signer, service,
CLI/HTTP/MCP, real configuration or financial action added. The actual compiled
eight-job HTTP/ABI local rehearsal consumes the reader and preserves previous
settlement/rollback/retry checks. ONE zero-account fixture is not independent
providers, public custody or full P19/audit/mainnet approval. Standard/root pins,
economics and gates unchanged. See [SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Bitcoin serialized size and supplied-byte rate accounting

The actual legacy/SegWit transaction parser adds exact base/witness-related
byte counts, BIP141 serialized weight and ceiling virtual bytes. The existing
supplied-parent engine uses that actual child size as an exact rational
denominator for its unverified input-minus-output arithmetic. No floating
rounding or live fee/payment claim: fees/rate and sigop-adjusted policy size
stay null; mempool policy and all earlier authority/readiness flags stay false.
Tests include genesis, mixed witness, CompactSize boundaries, all ceiling
residues, changed witness/unchanged txid, existing 100kB bound and actual gated
CLI modes. Primary BIP141/Core v30 source was read; no executed Core differential,
provider/UTXO/issuance/custody/bridge/fullM05/audit/mainnet approval follows.
No contracts/rootpins/configuration/economics/authority/gates changed. See
[BITCOIN_TRANSACTION_INSPECTION.md](BITCOIN_TRANSACTION_INSPECTION.md).

## Counter unsigned claim-review CLI

Default-disabled `prepare-counter-claims.mjs` calls the unchanged actual
two-client `buildCounterClaimBatch` engine using an existing bounded literal
policy and restricted HTTPS read providers. It returns original observation
data and unsigned batch bytes; policy mutation discards output. Calldata stays
unbound to amounts/snapshot/expiry, authorization null and execution/readiness
false. No signing/submission/approval/retry/service/configuration added. Actual
child-CLI HTTP/ABI tests and the compiled two-asset local escrow rehearsal
exercise returned bytes and spent-claim rejection. ONE zero-account fixture
is not public custody, legitimate funding, independent providers, consent or
full M06/P04/audit/mainnet approval. Standard/root pins/contracts/economics and
all gates unchanged. See [COUNTER_ROUND_ESCROW.md](COUNTER_ROUND_ESCROW.md).

## Rune index stream allocation bound

The actual fixed-origin Rune index reader now caps retained non-final chunks
at 4,096, counting empty chunks before push/projection. Empty/tiny response
regressions failed unchanged source; boundary/cleanup and existing actual
child-CLI HTTP tests cover the fix. The independent 32 KiB limit and ten-second
clock/failure fences remain unchanged. Valid fragmented responses may reject;
this is not an upstream/process-memory bound or successful public index proof.
No new Bitcoin issuance/custody/bridge authority, configuration, contract,
dependency or frozen Standard change. Full M05 and all release gates remain
incomplete. See [BITCOIN_RUNE_INDEX.md](BITCOIN_RUNE_INDEX.md).

## Managed-liquidity held custody observation

An explicit chain97 `inspectLiquidityCustody` library API integrates the actual
unchanged LP reader with same-block custody runtime, immutable roles, stored
route/position policy, held/released/pause state and zero token approval. Exact
raw liquidity/ticks and two-client header/state agreement fail closed. One
outer real30sec monotonic-clock lifetime includes the nested reader and fences
late work on every outcome. Historical snapshots are supported; no fresh-state,
independent-provider, finality, project-consent, legitimate-capital, treasury
control or execution approval follows. Raw liquidity/owed values remain separate
from null TVL/claimable fees. Initial/unrecorded/released custody is rejected;
this does not reconstruct lifecycle receipts. No contract, Standard/root pin,
economics, authority, service, CLI, MCP or real configuration changes. Existing
zero-account Pancake runtime exercises actual held/open, held/paused, wrong
fixed-treasury rejection and rejection after release. Local fixtures/fork are
not public custody or complete M07 readiness; exact CI/runtime evidence and
all audit/legal/privacy/capital/provider/failure/recovery/ops gates remain
separate. See [MANAGED_LIQUIDITY_CUSTODY.md](MANAGED_LIQUIDITY_CUSTODY.md).

## Syndicate worker decline before acceptance

The isolated chain97 WorkEscrow adds `decline(id)`: only the named worker can
settle a still-Funded job with zero worker payment and a whole original-client
refund, before or after the acceptance deadline. Existing exact transfer,
runtime/backing/liability, pause and non-reentrancy gates apply. First valid
accept/cancel/decline wins; inexact refunds roll back for explicit retry.
Funding IDs and terms remain stored; Accepted payment/waiver/dispute paths are
unchanged. Unit/fuzz/invariant tests and the existing zero-account HTTP/ABI
runtime exercise decline and all six earlier jobs. One local synthetic fixture
does not verify identities, legal cancellation, delivery, fairness, independent
providers or public custody. New runtime requires fresh deployment/audit
evidence; full P19 and release gates remain incomplete. No fee allocation,
capital authority, dependency or frozen Standard baseline changes. See
[SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Project API stream allocation bound

The actual shared canon/snapshot HTTP reader rejects more than 4,096 non-final
stream chunks, counting empty chunks too, before retaining another chunk or
projecting JSON. The independent 32 KiB byte bound and existing real deadlines,
clock/failure fences and non-awaited cancellation remain unchanged. Both empty
and tiny over-fragmentation regressions failed old source; boundary and actual
local HTTP tests cover the fix. Chunk boundaries are transport-dependent, so an
over-fragmented valid response may be rejected. This bounds retained chunk-array
entries, not upstream buffering or process-wide memory. No provider, service,
authority, financial, dependency or frozen Standard/release gates change.


## Complete feature coverage

The owner's full MEME OS reference is mapped in [MEME_OS_PARITY.md](MEME_OS_PARITY.md):
eight launch blocks plus project/platform features P01–P24. That coverage is the
product target; recent arbitrage/receipt/budget work is only one subset. Preserve
all existing Fortune presets/capabilities. Documentation records scope, not parity
completion, deployment or approval.

## Implemented in the launch-catalog change

- `/launch/types`: ten presets with explicit builder, configuration-required and development states; navigation opens the catalog without removing `/launch` or changing Standard signatures.
- `/launch/omnichain`: plain-token global-supply planning over BNB Testnet and EVM testnet allocations. Local previews and bounded public API validation share the same validator. Plan responses never authorize transactions.
- Exact bigint fee-allocation helpers: received-fee allocations total 100%; launch-token fees only burn; rounding remains explicit; protocol recirculation is a subset of protocol earnings.
- Supply/dust accounting helpers: local balances, authenticated in-flight obligations and permanent burns reconcile separately. These helpers do not verify chain receipts themselves.
- Web tests and desktop/mobile CI fixtures cover malformed input, duplicate/unsupported chains, global-supply conservation, immutable non-readiness, stale validation display and the actual local preview API.

## Engine completion matrix

| Engine | Present foundation | Required before calling its full lifecycle testnet-ready |
| --- | --- | --- |
| Standard | Existing public testnet curve/trading/graduation/rescue | Repeat retained rehearsal and failure drills against the exact deployed candidate; preserve mainnet gates |
| Custom Pair | Isolated contracts and builder | Protected deployment/drill, configured factory, compatibility cases and operational evidence |
| Protected Launch | Merged custom-pair rules v2 from PR #54 | Deploy supported rules, test trade rejection, expiry and graduation against the exact deployed contracts |
| Social Fees | Custom-pair routing, social vault and proof service | Operator-provisioned attestor, exact identity/claim/recovery drills and configured vault |
| Basket Rewards | Isolated Stock Rewards contracts/builder | Protected deployment/drill, payout reconciliation and real multi-asset claims; arbitrary reward baskets need additional adapters |
| Burn + Rewards | Isolated token/accounting prototype | Infinity hook, factory, trade/graduation integration, indexer, settlement and audit scope |
| AI Assisted | Disabled operator-only source-card co-pilot and gateway adapter | Project-aware content drafts, public auth/quotas, protected model/privacy/spend/quality review, explicit wallet-reviewed action integration and injection tests |
| Autonomous Agent | Isolated testnet single-pair swap vault with contract-enforced caps/floors/expiry/revocation and local venue-fork/RPC-to-journal tests | Agent runtime, reviewed manifests, signer-bound/native/global limits, protected operator custody, durable orchestration and public testnet failure/recovery drills; SQLite native-gas books/holds are not wallet enforcement |
| Managed Liquidity | Read-only V3 quotes and pinned LP NFT inspector, profit-policy helpers, receipt journal and bounded testnet swap primitive | LP-management adapters, complete cycle/cost/inventory settlement, live deployment evidence, global limits, loss/conflict disclosures and economic tests |
| Omnichain | Supply planner, pinned isolated testnet OFT token engine, message/replay fixtures, read-only quotes and receipt journal | Exact network/security manifests, deployment/pool integration, durable job/payment/refund orchestration, real route and partial-deployment/recovery drills |

No amount of passing planner or UI tests substitutes for the missing engine implementations above. Solana and Robinhood Chain are not implemented by the EVM testnet planner. New engines cannot inherit another engine's audit or deploy authority.

The receipt journal is documented in `ARBITRAGE_RECEIPT_JOURNAL.md`. It verifies and persists individual fill observations, with retry deduplication and persistent quarantine. It does not allocate realized profit, convert native gas costs into settlement assets, close cross-chain inventory or authorize spending. Its adversarial provider tests use fixtures; SQLite restart/concurrency tests use real local files and worker processes. The bounded-vault change also adds real RPC receipt/journal integration against a local Anvil fork, with two clients of that same fixture rather than independent public providers. No live arbitrage or complete durable settlement is claimed.

`STRATEGY_EXECUTOR.md` describes the bounded testnet swap vault, fixed governor/guardian/treasury powers, expiring owner-reviewed price floors and exact test scope. Local Pancake V3 fork swaps are not a publicly deployed vault or a cross-chain arbitrage service. The public catalog remains gated; this source primitive does not make the full agent or managed-liquidity modes testnet-ready.

Recent merged #71–#78 add source-card assistance, queued actual local-fork receipts,
read-only health, revalidation/quarantine, retained local rollback drills, a pinned
LP-position reader and native-gas books/reconciliation with fenced holds. These
are component foundations. Budget schema2 rejects schema1 without explicit offline
migration (NATIVE_GAS_BUDGET_MIGRATION.md); crashed holds still have no reviewed
recovery tool. The complete project-facing modes,
public services, constrained signer integration and global settlement are not
made ready by those merges. See CREATOR_COPILOT.md, MANAGED_LIQUIDITY_READER.md,
STRATEGY_NATIVE_GAS_BUDGET.md and BUDGET_RECEIPT_RECONCILIATION.md.

## Burn-only inventory settlement (M01/M08)

A separate paused chain97 vault now permits only a pinned token's permanent burn
of existing inventory, with exact vault-balance/local-supply/permanent-counter
deltas and no transfer/approval/swap/sweep path. Unit/fuzz/invariant tests and the
actual local compiled-OFT route rehearsal cover this component. Anyone may burn
while governor-open; per-call caps are not daily limits. Received inventory has
no refund/recovery route, and donations do not prove fee origin or allocation.
Nested vault burns are outside the existing direct-burn receipt reader. No fee
collection, buyback/reward/recirculation, public deployment, full agent/omnichain
readiness or release approval follows. See BURN_ONLY_INVENTORY_VAULT.md.

## Isolated holder-round settlement (M06)

An optional `fundSnapshotRound` path now binds newly built calldata to the actual
next round, a recent EVM block hash (20–255 blocks behind execution), and a fixed
expiry. The snapshot builder and actual local RPC rehearsal use that path;
legacy `fundRound` and its builder are preserved. Exact successful bytes cannot
fund another round, but rebuilt allocations and the governor's legacy method
are not deduplicated. Hash binding does not prove historical holder balances,
eligibility, source of funds, independent providers or finality. New isolated
contract source requires fresh evidence; no old deployment or audit is upgraded.
See COUNTER_ROUND_ESCROW.md for bounds, tests and remaining wallet/release gates.


The bounded Counter allocation library now reads two supplied clients at a common
confirmed block, checks escrow/runtime policy and supplied balances against total
supply, applies explicit exclusions/minimum holdings, and generates exact pro-rata
`fundRound` calldata with unallocated dust separate. The actual local zero-account
escrow runtime consumes those bytes and verifies stored entitlements/claims.
Coverage arithmetic is not independent holder-index/eligibility approval; the
legacy calldata has no snapshot/expected-round/replay binding and authorizes no execution.
No fee origin, wallet/signer, public service, automatic rotation/carry-forward or
full Counter readiness is established. See COUNTER_ROUND_ESCROW.md for the real
wall timer, failure fences, asset/provider/finality and wallet-review boundaries.

`FortuneTestnetCounterEscrow` now implements actual separately funded payout
rounds, immutable explicit allocations, per-asset reserved liabilities and direct
recipient-bound claims. It starts paused on chain 97, rejects launched-token
payouts, requires fresh exact governor funding, preserves older entitlements
across payout-asset changes, and has no sweep/amendment/expiry/fee conversion.
Eligibility is supplied by the governor, not verified by this escrow. Bounded
1–128-recipient rounds are not a complete holder index or rotating-basket engine.
The existing isolated contract workflow includes unit/fuzz/invariant tests and a
zero-account local-EVM HTTP/ABI funding/claim/failure rehearsal with retained CI
reports. See COUNTER_ROUND_ESCROW.md for authority, asset and stranded-claim
risks. No public deployment, fee provenance, holder eligibility, full Counter
readiness, audit, mainnet activation or financial/release-gate approval follows.

## Receipt observation lifetime

The actual swap-receipt verifier now fences every awaited RPC action and enforces
its existing sixty-second limit with a real wall timer, including hung reads.
Failure/timeout ends both readers' shared lifetime; delayed responses cannot start
more reads or acquire a verified-fill marker. Host-clock rollback is rejected and
method receivers/duplicate-client identity checks are preserved. In-flight calls
are not cancelled. Real SQLite queued-coordinator timeout tests retain a blocked
budget hold and unfinished job, without a journal commit or automatic recovery.
Evidence/digest/schema/gas/economic and release gates remain unchanged. See
ARBITRAGE_RECEIPT_JOURNAL.md; this is a component safety fix, not full M01/M07
or public-service readiness.

## One-shot queued operator integration

The budget reconciliation CLI now explicitly accepts `--next <existing-queue>`
to run the actual queue-to-budget coordinator for at most one existing job.
Read-only matching-store preflight precedes writers, missing/aliased/foreign
stores fail, and no reservation or job is invented. Blocked restarts do not
claim or read RPC; done/idle report false execution/profit authority and a
point-in-time book status. Legacy single-hash reconciliation is preserved.
Actual child-process HTTP/ABI and temporary SQLite tests are component evidence,
not independent providers, a hosted supervisor, hold recovery, signer enforcement
or complete M01/M07 settlement. See BUDGET_RECEIPT_RECONCILIATION.md.

## Coordinator local-RPC and rollback rehearsal

The queued budget observer now connects an existing job lease to the actual
coordinator: hold before RPC, journal then gas charge before queue completion.
Blocked books do not claim work; quarantine and uncertain writes never mark a
job done or clear a hold. Expired completion can replay already committed evidence
without resetting gas charge time. The local venue-fork runtime calls this path
for its two swaps. Three SQLite stores remain non-atomic; no signer, automatic
hold recovery, hosted worker or complete strategy settlement is established.

The strategy runtime now calls the real budget coordinator over actual local
Pancake fork swap receipts: durable holds before RPC, journal commits before
charge, exact swap gas, reopen/replay without changing charge time, and permanent
holds/freezes after an actual local history rollback. It also restores #75's
reviewed revalidation/rollback drill, previously absent from main's runtime
despite merged PR metadata. Engine CI now follows the coordinator, budget and
revalidator source paths and retains the existing report/log. A source change
does not count as a passing rehearsal; inspect exact-head results.

See BUDGET_RECEIPT_RECONCILIATION.md. Both read clients use one local fixture;
temporary post-mining reservations are not signer enforcement or independent
providers. Other gas, hold recovery, durable operations and public deployment
remain outside this rehearsal. No operator book, wallet or release gate changes.

## Bitcoin Rune index observation (M05)

An additional offline output-script decoder now interprets real Runestone binary
payloads against a pinned ord source: pushdata, exact u128 varints, fields/flags,
delta edicts and cenotaphs. A separately disabled bounded local-file CLI calls the
actual decoder, with literal upstream-derived vectors and adversarial component
tests. Supplied output lists are not verified transactions or complete chain
data; etching/mint acceptance, balances, network/finality, custody/bridge backing,
execution and full M05 readiness always remain false. No wallet, network service,
transaction construction or financial activation is added. See
BITCOIN_RUNESTONE_DECODER.md for protocol pin, supported bounds and missing
Bitcoin validation/issuance/bridge lifecycle.

A separately disabled operator CLI now calls an actual fixed-origin ord Rune-ID
JSON adapter with lossless u128 integer parsing, strict requested-ID/block/schema
binding, bounded streaming and a real ten-second fenced read lifetime. It emits
whitelisted raw index labels/counts, unknown supply/market/backing fields and
false network/transaction/Runestone/finality/custody/bridge/execution readiness.
CLI/HTTP and timeout tests exercise the runtime; one fixture is not independent
Bitcoin/index verification or live deployment. No etching, wallet, bridge, fees,
public service or full M05 readiness is enabled. See BITCOIN_RUNE_INDEX.md for
pinned upstream schema, source-context runtime support and remaining gates.

## Voluntary worker waiver (P19)

The isolated work escrow now permits an Accepted job's named worker to waive all
payment and refund only the original client, bound to the exact current result
revision. Existing exact settlement/backing/pause/runtime checks and permanent
funding/result history remain. Disputed jobs still require arbitration; failed
refunds preserve liabilities for explicit retry. Unit/fuzz/invariant and actual
local HTTP/ABI settlement tests cover this additional path. This is voluntary
contract consent, not delivery/IP/identity/fairness or public service readiness.
See SYNDICATE_WORK_ESCROW.md for ordering, forfeiture and separate review gates.

## Worker result revision integration (P19)

The isolated escrow now stores up to 32 append-only worker result commitments
for Accepted jobs before their existing deadline. Expected revision fences
concurrent updates. Optional client approval binds the exact latest revision/hash
to existing whole-payment settlement; stale approvals and failed transfers retain
liabilities/history. Legacy unbound approval and all previous settlements remain.
The actual local HTTP/ABI rehearsal preserves four jobs and adds a fifth with
result/payment receipt bindings, stale and taxed-payment rejection and explicit
retry. Hashes are public supplied commitments, not verified delivery, identity,
authorship, IP/license, quality or complete P19 readiness. No public deployment,
signer, new fees, custody recovery or release authority follows. See
SYNDICATE_WORK_ESCROW.md for privacy and separate audit/operational gates.

## Client-scoped work funding IDs (P19)

The isolated work escrow adds optional `fundWithId` funding with permanent
client-scoped successful-ID binding, replay rejection before transfer and atomic
binding rollback on failed funding. Legacy funding and settlement remain intact.
Unit and actual local HTTP/ABI rehearsals cover funded/approved replay before
and after settlement, explicit failure retry and separate client namespaces.
Changing IDs or using legacy funding still creates new jobs; no signer, identity,
public deployment or complete Syndicate readiness is established. Changed source
requires fresh evidence. See SYNDICATE_WORK_ESCROW.md.

## Scoped-work settlement foundation (P19)

An isolated paused chain97 work escrow now implements exact client funding,
worker acceptance, explicit client payment approval, pre-acceptance cancellation,
expired unaccepted refunds and fixed-arbitrator dispute splits. Per-asset reserved
liabilities stay backed; final payment destinations are immutable and inexact
transfers revert all settlement state. Unit/fuzz/invariant and actual zero-account
HTTP/ABI rehearsals exercise this source. It is not an agent marketplace, identity,
work-delivery/fairness verification, public custody service or P19 readiness.
See SYNDICATE_WORK_ESCROW.md for trusted arbitration, stranded-fund/pause risks,
asset/capital review and independent audit/legal/operations gates.

## Single-position custody integration (M07)

An isolated chain97 custody component now locks one pinned V3 position policy,
accepts an explicitly approved governor NFT while open, and permits one terminal
fixed-treasury release while paused. It has no fee collection, liquidity mutation,
approval, arbitrary execution or recovery drain. The existing local Pancake fork
rehearsal connects actual NFT custody and treasury exit to the pinned LP reader;
old-owner policies reject and raw liquidity stays exact. This is source and test
integration, not a public deployment, legitimate capital proof, signer or complete
LP manager. See MANAGED_LIQUIDITY_CUSTODY.md for authority, stranded-asset risks,
local/independent-provider distinctions and separate readiness gates.

## LP reader request lifecycle

The separate paused omnichain route reader also rechecks both snapshots' age at
the combined result's completion time. Reads that age out while awaiting either
network fail closed; this does not enable transport or attest route readiness.
See OMNICHAIN_ROUTE_OBSERVATION.md.

The isolated position reader now enforces its thirty-second observation limit
with a real wall timer, including hung head reads. Every awaited RPC action is
fenced before and after it completes; after any result, delayed peer completions
cannot start more reads. Already in-flight calls are not cancelled. Ownership,
venue/runtime pins, unknown values, authority flags and release gates are unchanged.
See MANAGED_LIQUIDITY_READER.md for fixture tests and remaining operations limits.

## Pair-inspection provenance hardening

The existing public custom-pair inspector now reports a rechecked block hash and
timestamp, rejects incomplete proxy-slot/implementation reads, and qualifies its
simulation labels. See CUSTOM_PAIRS.md. This strengthens part of P08's existing
contract-intelligence foundation; it does not complete exhaustive admin/claim
analysis, independent-provider verification or a safety verdict. Local RPC/ABI
and state-override fixtures exercise the actual reader, without broadcasts.

## Share-card artwork deadline

The production share-card artwork reader now enforces its existing three-second
budget with a real fallback timer and late-read fences. Hung fetch/body reads or
cancellation cannot keep the artwork promise pending. Host-clock rollback fails
to the existing monogram fallback; trusted gateway/raster/byte/chunk restrictions
remain. Real and simulated timeout tests and loopback HTTP exercise the reader,
not public IPFS availability or full image decoding. No new service, credentials,
financial engine or release approval follows. See CREATOR_FLOW.md.

## Public project read lifetime

The actual canon/snapshot readers now enforce existing 10/30-second budgets with
a real rejecting timer and before/after response/chunk fences, even if transport
ignores abort. Failure/timeout/success closes the shared lifetime; best-effort
abort/cancellation never waits for stuck cancellation. Late results cannot start
new reads or return projected data. Safe nonnegative monotonic host clocks are
required. Fixed origin, 32KiB byte bounds, strict parsing, freshness/provenance and
shared MCP quotas remain unchanged. This strengthens existing MCP, research capture
and co-pilot consumers without authorizing models, publication, wallets or new
services. See PROJECT_MCP.md for event-loop and in-flight cancellation limits.

## Creator co-pilot public-project grounding

An explicit separately disabled `creator-copilot.mjs --brief <token>` mode now
runs the actual bounded public project snapshot reader and produces a whitelist
of exact facts, phase-specific review notes and pinned historical policy cards.
Creator prose is omitted, unknown analytics stay null and all creator/publication/
execution/full-readiness authority stays false. The source-card inference mode is
preserved; brief mode calls no model or Gateway. Real child-process HTTP tests
exercise the data path and private-safe failures. This is a one-shot operator
brief, not public authenticated AI, content publishing or complete M02/P06.
See CREATOR_COPILOT.md for limits and separate review gates.

## Owner-operated dependencies

`OMNICHAIN_PERMANENT_BURN.md` adds an explicit default-disabled receipt reader
for the isolated OFT's direct voluntary burn: pinned runtime/manifest, exact
transaction and matching Transfer/PermanentBurn events, rechecked receipt blocks
and two read-client observations. The local engine runtime exercises the actual
burn and wrong-amount rejection. Stable evidence IDs support deduplication but do
not provide a durable ledger or public badge/totals; buyback, fee funding,
independent providers, finality, global supply and spending remain unverified.

`OMNICHAIN_ROUTE_OBSERVATION.md` adds a default-disabled actual RPC reader for a
paused two-network OFT route: reciprocal identities/runtime pins, explicit message
libraries, raw/effective ULN and executor configuration, and bounded rechecked
per-network snapshots. The engine runtime uses the real OFT and pinned upstream
libraries on two separate zero-account local EVMs, with synthetic workers; it
does not send messages or verify public endpoints/providers/worker security.
Configuration matching always retains false execution/security/delivery/supply
readiness. No deployment, opening, payment, policy, root pin or release gate changes.

`CHARACTER_PROVENANCE_MCP.md` connects the actual provenance engine to a separately
enabled local MCP tool/resource, preserving offline history/canon readers. It pins
startup policy bytes, shares the existing read quota, returns no profile text and
always reports null current authorization/false execution authority. Actual child
stdio -> viem HTTP/ABI -> real SQLite fixtures are not public creator approval or
independent-provider/hosted-service evidence. No real config/profile is enabled.

`CHARACTER_PROVENANCE_RECHECK.md` adds an explicit default-disabled operator
read-only recheck of stored character history against current factory/creator
and recorded block hashes through two configured RPC clients. It detects changed
local revision/policy after reads, requires matching checked-block timestamps,
and fences late client completions after any outcome. It never renews signatures or persists trust,
and retains null current authorization/false execution authority. Fixture
SQLite/provider/CLI tests are not live creator approval or hosted integration.

`PROJECT_RESEARCH_NOTEBOOK.md` also documents an explicit, default-disabled
project API capture command: real bounded snapshot reader -> whitelisted exact
values/provenance -> expected-head SQLite append -> existing read-only MCP. It
rejects concurrent head changes and malformed/stale bindings, excludes creator
text and keeps unknown analytics null. This is recorded API attestation, not
independent verification, autonomous research, scoring or hosted service.

`PROJECT_RESEARCH_NOTEBOOK.md` adds a default-disabled local operator notebook:
expected-head/retry-ID append, correction-preserving hash-linked SQLite history
and a separate opt-in read-only MCP research tool/resource. Notes and host times
are unverified; no creator role, external timestamp, scoring or financial authority.
Full Arena/agent research, public authentication/moderation and hosted operations
remain missing. Real local CLI/SQLite/process/stdio tests are fixture evidence.

`CHARACTER_RECORD_MCP.md` connects the local stdio server to an explicitly selected
read-only character registry through a separate optional tool/resource. It checks
stored signature consistency and labels historical provenance/current authorization
unknown. It never fills public canon fields or grants publication authority.
Actual child stdio/SQLite fixture tests pass; live creator approval, current RPC
revalidation, hosted identity/privacy/quotas and public agent readiness remain open.

`CREATOR_CANON_REGISTRY.md` adds default-disabled operator-only EIP-712 character
imports and append-only SQLite version history for one reviewed Standard testnet
project. Two clients check pinned factory/creator/block bindings; replay and racing
revisions fail closed. It supports EOAs only and records historical authorization,
not current login, onchain metadata changes, public canon or publication authority.
Tests use signature/provider fixtures and actual files/processes/HTTP, not a real
creator's approval. Public Studio/MCP integration, smart-account support, live
creator evidence, revalidation and durable hosted operations remain outstanding.

`PROJECT_SNAPSHOT.md` adds a same-block Standard testnet metadata/curve API and
the MCP get_project_snapshot tool/resource. It binds creator/factory/token/block,
preserves exact supply and curve-accounting strings and hides retired curve prices.
It does not infer volume/holders/treasury/market cap or supply a trade quote, and
API attestations are not independent client RPC/finality or financial authority.

`CREATOR_STUDIO.md` adds `/studio`: browser-local character drafts, bounded
project-scoped JSON roundtrips and deterministic announcement wording with review
before download. It is not creator authentication, onchain canon, AI generation or
social publishing, and does not populate the MCP reader's missing character fields.

`PROJECT_MCP.md` adds the first project-facing canon/MCP developer slice:
an explicitly enabled local stdio server with real initialization/discovery/calls,
one process-bound Standard testnet token and a public-metadata projection. Empty
character/license fields remain null. This reads Fortune API attestations, not
independent RPC evidence, and has no treasury/wallet/write tools. Local HTTP/stdio
fixtures do not establish external-client interoperability or full agent readiness.
Creator-authenticated character editing, broader tools and hosted auth/quotas remain.

Use protected service/CI configuration for RPC, durable storage, holder cron, uploads and attestor provisioning. Do not share private keys in chat. Existing owner workflows need faucet tBNB and their explicit confirmation inputs, as documented in RELEASE_HANDOFF.md. Local fixtures are not provider, incident-alert or live cross-chain evidence.

Audit readiness additionally requires reproducible pinned builds, scoped contract inventory, lifecycle/invariant/fork evidence and retained deployment artifacts for each engine. Mainnet also needs independent audit remediation, legal/asset review, governance acceptance/signatures, funding, production operations and activation evidence. An audit alone does not establish mainnet readiness.

## Social claim amount units

The existing social-fee identity reader now fails closed if vault-token or curve
pair-token decimals are unavailable or malformed, instead of assuming 18 and
mis-scaling displayed amounts. Successful raw amounts and uint8 units are
preserved. Tests cover both detail paths and actual viem HTTP/ABI fixture reads;
this does not enable social routing, provision an attestor or establish public
claim/recovery readiness. See SOCIAL_FEES.md.

## Creator import snapshot consistency

The same import engine also fences each awaited RPC before and after completion,
ends its shared lifetime on every outcome, and rejects inter-check host-clock
rollback. Late responses cannot start further reads after failure or the real
20-second timeout; in-flight calls are not cancelled. SQLite/actual-timer fixtures
preserve no-commit behavior, method receivers and client identity checks. This
does not enable a public identity service or change signed/stored evidence.

Creator-character imports additionally require matching provider timestamps,
number/hash/timestamp rechecks, and final snapshot age within 120 seconds before
the existing SQLite transaction can commit. Real-file and viem HTTP/ABI fixture
regressions cover rejection/preserved history; no signed-message, schema, expiry,
historical authorization, public login or release authority changes. This applies
to new imports, not renewed verification of old records. See CREATOR_CANON_REGISTRY.md.

## Known protected-launch rules disclosure

The existing custom-pair detail reader rejects failed or undecodable reads from
an already discovered rules contract instead of returning null rules. Holder-gate
units must be read successfully, while valid inactive settings and raw thresholds
remain disclosed. Actual viem HTTP/ABI fixture regressions cover all required
rule reads and gate metadata. Legacy getter-discovery fallbacks remain a separate
limitation; this does not complete M03/P16 enforcement, deployment or full lifecycle
readiness. No contracts, configured factories, signing or release gates change.
See LAUNCH_RULES.md.


## Social ownership-source request lifetime (M04)

Actual ownership/profile HTTP attempts now reject at their existing eight-second
budget even when transport ignores abort or cancellation hangs. Before/after
read fences reject late evidence and host-clock rollback; cleanup ends every
attempt. Existing single retry and platform fallbacks retain separate attempt
budgets, not a global verification deadline. Real-timer and HTTP projection tests
are component evidence, not live identity/attestor/claim/recovery or full Social
Escrow readiness. No contracts, credentials, public activation or gates change.
See SOCIAL_FEES.md.


## Project LP-position MCP integration (P03/M07)

A separate default-disabled local tool/resource now invokes the actual pinned LP
reader over two configured read clients. A bounded literal startup policy must
include the fixed project token as a position asset; identical policy bytes are
required before/after reads. All readers share the existing four-read quota.
Raw liquidity/last-computed owed fields retain null value/claimable fees and false
project-custody, provider-independence, full-readiness and execution authority.
Actual child stdio/viem HTTP/ABI tests exercise this path, not public providers
or creator/custody approval. Existing reader logic is unchanged apart from an
export of its validation function. No fee collection, management, signer or
public service is enabled. See PROJECT_LIQUIDITY_MCP.md.

## Serialized Bitcoin transaction / Runestone integration (M05)

A separately disabled offline CLI now parses bounded supplied legacy/SegWit
transactions, checks an expected txid, computes wtxid and passes every serialized
output script in order to the actual Runestone decoder. Canonical CompactSize,
byte/count/value bounds and witness framing fail closed. Matching hashes bind
supplied bytes, not signatures, chain inclusion, UTXO/Rune balances, issuance,
custody or bridge backing; those verification/readiness flags remain false.
Known historical bytes, adversarial synthetic serialization and actual child CLI
tests are component evidence, not a public Bitcoin provider or full M05 lifecycle.
See BITCOIN_TRANSACTION_INSPECTION.md. No network, signing, broadcasts, financial
activation, dependency or frozen Standard changes are introduced.

## Public project-data attachment (P23)

The actual public project reader now has an additive JSON download endpoint with
exact decimal strings and same-block provenance, excluding creator prose/links
and retaining unknown analytics. A bounded UTF-8 payload string and SHA-256 make
byte checks portable; they do not authenticate the source or grant authority.
All existing reader errors and false verification/authorization flags remain.
The production API/RPC/MCP rehearsal exercises attachment headers, checksum,
provenance, unknowns and invalid/unregistered-token errors. This is a data/export
component, not API-key/durable-quota/hosted-auth/indexer or full P23 readiness.
See PROJECT_DATA_EXPORT.md. No financial or frozen release gates change.

## Offline Bitcoin header / transaction Merkle integration (M05)

A separately disabled local-file CLI now consumes the actual serialized
transaction/Runestone engines and checks a supplied txid path against a supplied
80-byte header's root and expected header hash. Exact depth, index/count bounds,
odd-width duplication and visible equal-pair checks fail closed. Count and index
remain claims; opaque subtree mutation and SegWit witness commitments are not
verified. Matching caller-supplied bytes does not establish trusted headers,
proof of work, canonical-chain inclusion, network, finality, valid transactions,
Rune issuance, custody or bridge backing; all those authority/readiness flags
remain false. Historical genesis and synthetic full-tree/child-CLI tests are
component evidence, not public-provider or Bitcoin Core differential evidence.
See BITCOIN_MERKLE_OBSERVATION.md. No network, signing, broadcasts, financial
activation, dependency or frozen Standard/release-gate changes are introduced.

## Developer download inspection (P04/P23)

A default-disabled local-file CLI now consumes actual project-data exports,
checks bounded UTF-8 payload bytes/digest and typed project/factory/block/phase
bindings, then emits a strict whitelist. Unknown analytics remain null; input
prose is not emitted or followed. Historical inspection preserves the original
API timestamp and cannot refresh trust or authorize execution. Actual exporter
round-trip/adversarial/child-CLI tests are component evidence, not authenticated
source, independent RPC, current canonicality, full API/dev-tool readiness or
financial authority. Existing exporter and endpoints are unchanged. See
PROJECT_DATA_EXPORT.md for bounds, usage and missing service/release gates.


## Atomic recipient claim batches (M06)

`claimMany(ids, recipient)` delivers existing whole entitlements from 1–32
strictly increasing, nonzero round IDs to the same recorded recipient. Anyone
may relay it across payout assets; the relayer receives nothing. Duplicate,
unsorted, oversized lists and missing/already-claimed entitlements reject.
All IDs are validated before transfers. Each claim reuses runtime, solvency,
exact-transfer and liability checks under one chain97, unpaused, non-reentrant
call. Any later failure reverts every earlier transfer, event and accounting
change. Explicit retry or separate legacy claims remain available. No partial
progress, automatic retry, allocation change, fee, recipient override, sweep or
pause bypass is added; existing single claims are preserved.

Unit/fuzz tests cover two assets, the 32-round boundary, reentry and rollback;
the liability invariant includes batch actions. The zero-account local HTTP/ABI
rehearsal binds two round/recipient/amount receipts and checks that a taxed
second payout rolls back the first. One synthetic fixture is not independent
providers or public custody. This is a bounded settlement component, not cost-
aware scheduling, pot/carry-forward accounting, eligibility, fee funding or full
M06 readiness. Changed bytecode requires fresh deployment/audit evidence.
Frozen Standard and all release gates remain; launch-token fees only burn,
rewards and earned platform recirculation remain separate, and creator/holder/LP
liabilities are never strategy capital.

## Counter operator funding review integration (M06/P04)

A default-disabled one-shot CLI now runs the actual two-client snapshot funding
engine from an existing bounded strict policy file. It emits unsigned exact
allocations, dust, block/deadline bindings and false authority, with pre/post
policy-byte rechecks and restricted read transports. It cannot approve, fund,
sign or submit. Actual child HTTP/ABI tests and the existing zero-account compiled
escrow rehearsal consume its output. One local fixture is not independent public
providers/eligibility/fee provenance/capital/custody or full Counter readiness.
No real configuration, financial engine logic, frozen Standard/root pins or
release gate changes. See COUNTER_ROUND_ESCROW.md.

## LP observation header consistency (M07/P03)

The actual LP reader now checks matching number/hash/timestamp across both clients
and each final header reread, emits exact blockTimestamp and rejects invalid
host clocks before RPC. Reproduced header/clock regressions and the existing
MCP/HTTP/fork integrations cover this path. Historical reads remain supported;
this adds no freshness/finality/provider-independence or custody authority.
Raw liquidity and null value/claimable fees/false readiness remain unchanged.
See MANAGED_LIQUIDITY_READER.md. Frozen Standard and all gates are preserved.

## Supplied Bitcoin previous-output accounting (M05)

The existing offline transaction CLI has a separately disabled optional parent
mode. Actual parsed child outpoints bind to hash-checked supplied parent bytes;
unique required parents/outputs yield exact input/output totals and an implied
fee, with duplicates, missing outputs, money bounds and negative fees rejecting.
Original transaction/Runestone inspection remains available. Arithmetic does not
verify unspent/mature inputs, signatures, chain inclusion or miner payment;
feesSats remains null and authority/readiness flags remain false. Synthetic and
actual child CLI tests are component evidence, not Bitcoin Core differential,
public provider, issuance, custody or bridge proof. Full M05 and all release gates
remain incomplete. See BITCOIN_TRANSACTION_INSPECTION.md. No financial authority,
frozen Standard, root pins, real configuration or network actions change.

## Offline Bitcoin CLI nonregular-input rejection

The Runestone, transaction/prevout and Merkle CLIs now open read-only with
nonblocking flags before existing descriptor regular-file checks. All three
writerless-FIFO regressions failed original main by child-process timeout; Linux
actual FIFO/symlink/directory/disabled cases now reject privately. Existing valid
regular-file tests and all parsing/byte bounds/gates remain. This does not add a
general filesystem deadline or platform-independent I/O guarantee, Bitcoin
validation, public service or financial authority. See
BITCOIN_TRANSACTION_INSPECTION.md. Frozen Standard/root pins are unchanged.

## Burn-only inventory receipt integration (M01/M08)

A separate chain97 library observer now verifies the actual burn-only vault's
outer uint128 burn and three nested logs against supplied runtime/identity pins,
receipt-height policy/counters and rechecked two-client transaction/header data.
The existing compiled zero-account OFT/vault rehearsal consumes this observer for
both burns and replay/mismatch rejection. Direct-token observation/CLI remains
strictly separate. Event and block-end counters are distinct, evidence IDs need
consumer deduplication, and fee funding/buyback/finality/supply/execution claims
remain false. This is no consumed ledger, badge, public service, fee-origin proof
or full M01/M08 readiness. Shared20-second fencing now rejects invalid host clocks
before RPC; no financial authority, frozen Standard/root pins or gates change.
See OMNICHAIN_PERMANENT_BURN.md.

## Durable local vault-burn research capture (M01/M08/P10 foundation)

An opt-in library path now calls the actual vault receipt observer and appends
its observation to the existing protected research notebook using the original
expected head. Concurrent changes reject without overwriting; deterministic
per-notebook transaction IDs and exact policy checks allow historical retries
without RPC, timestamp renewal or duplicate notes, including records older than
the recent-ten read window. The existing MCP notebook reader consumes that history.
Actual ABI/SQLite/MCP tests and the compiled zero-account OFT/vault rehearsal cover
the integration. This is local untrusted research, NOT a consumed financial ledger,
totals, badge, fee/buyback proof, current authorization, reorg recovery, public
service or full M01/M08/P10 readiness. No contracts, root pins, real configuration,
financial authority or release gates change. See OMNICHAIN_PERMANENT_BURN.md.

## Revision-bound Syndicate disputes (P19 component)

Optional disputeResult binds a party's dispute to the exact latest submitted
revision/hash, rejects stale prepared calldata, and retains that reference through
existing fixed-arbitrator split settlement. Legacy dispute and its deadline/role
semantics remain unchanged; its zero binding is explicitly unknown. Solidity tests
and the actual compiled eight-job local HTTP/ABI rehearsal cover stale rejection,
events and retained history/liabilities. No content/delivery/legal/fairness proof,
public custody, signer, deployment or full P19 readiness follows. Changed isolated
runtime needs fresh deployment/audit evidence; frozen Standard/root pins and all
release gates remain. See SYNDICATE_WORK_ESCROW.md.

## Sentinel optional-rule discovery failures (M03/P16 component fix)

Token/factory rule-address discovery now propagates transport and malformed ABI
failures and explicit-reason reverts instead of silently reporting no rules.
An actual multicall/detail-API malformed-getter regression failed old source200
and now requires generic503; focused HTTP/ABI and typed legacy-error tests pass.
Empty-data/empty-revert legacy compatibility remains explicitly unverified, not
proof of no rules, contract generation, enforcement or safety. No contracts,
root pins, configuration, signing authority or release gates change. Full M03/P16
remains incomplete. See LAUNCH_RULES.md.

## Counter unsigned claim-batch runtime integration (M06)

An isolated read-only builder now checks selected round entitlements, exact
recipient, payout/runtime/role pins, open state and selected reported liabilities/
backing through two clients at a fresh common block. It produces unsigned existing
claimMany bytes with explicit false snapshot-binding/authority/eligibility/global
solvency/finality-readiness claims. The actual compiled two-asset Counter runtime
consumes those bytes, preserves batch transfer rollback/retry and rejects consumed
claims on a new snapshot. No signer, service, public deployment or full M06
readiness follows; no contracts/root pins/economics/gates change. See
COUNTER_ROUND_ESCROW.md.
