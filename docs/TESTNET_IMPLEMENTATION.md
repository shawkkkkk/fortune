# Testnet implementation ledger

This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is recorded in merged PR #61. Preserve the frozen Standard candidate.

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

## Isolated holder-round settlement (M06)

The bounded Counter allocation library now reads two supplied clients at a common
confirmed block, checks escrow/runtime policy and supplied balances against total
supply, applies explicit exclusions/minimum holdings, and generates exact pro-rata
`fundRound` calldata with unallocated dust separate. The actual local zero-account
escrow runtime consumes those bytes and verifies stored entitlements/claims.
Coverage arithmetic is not independent holder-index/eligibility approval; the
calldata has no snapshot/expected-round/replay binding and authorizes no execution.
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
