# Isolated testnet holder-round escrow

`contracts-omnichain/src/FortuneTestnetCounterEscrow.sol` adds an unaudited
BSC Testnet (97) settlement primitive for M06. It is independent of the existing
Stock Rewards token/factory, frozen Standard, Burn + Rewards v2 and omnichain
transport. It reuses the isolated workspace's existing locked OpenZeppelin 5.4.0
and compiler/toolchain; no root dependency, fee rate or deployed configuration
changes. It has no deployment script, public address, UI enablement or authority
to activate another engine.

## Funded rounds and claims

The immutable constructor identifies a governor, a distinct guardian, the launched
token, 2–10 sorted payout-asset addresses/runtime hashes, and up to 32 sorted
excluded recipients. The launched token cannot be a payout asset. Zero, this
escrow and the launched-token contract are always excluded recipients. The asset
and exclusion lists cannot change. Runtime hashes are checked at funding and
claim time; they do not prove asset safety, proxy implementation immutability,
issuer eligibility or economic approval.

The escrow starts paused. While paused, only the governor can fund a new round
for one allowed asset. Each round contains 1–128 explicitly listed, sorted,
unique recipients with positive exact base-unit amounts. The contract sums the
allocations and transfers **new** funding from the governor. Both vault credit
and funder debit must equal that sum; an existing round, donation or surplus
cannot substitute for new funding. This establishes custody of that amount,
not its legitimate origin: the operator must separately prove funding does not
consume creator/holder/LP liabilities or other earmarked capital.

The resulting round ID, asset, total, recipient entitlements and domain-bound
allocation hash are immutable. The commitment covers chain ID, escrow address,
round ID, asset and complete recipient/amount arrays; the funding transaction
calldata discloses the arrays. This avoids a Merkle root whose advertised total
has not been proven to equal its leaf sum. It is bounded explicit settlement,
not a scalable holder-snapshot index or an eligibility proof. Lists larger than
128 require separately funded rounds; no automatic splitting is implemented.

Only the governor can unpause. The guardian can pause but cannot open, change an
allocation, redirect a claim or withdraw funds. Global pauses delay every claim
and new round staging requires a pause; disclose these availability powers.
An unpaused claim may be relayed by anyone but sends the entire entitlement
only to its recorded recipient. A relayer cannot redirect it. The entitlement,
round remainder and asset-level reserved liability decrease together; failed,
taxed or inexact transfers revert all those changes. Reentrancy is blocked.
Insufficient total backing for an asset blocks its claims and further funding;
changed runtime code blocks use of that asset. Each asset has separate reserves.

There is no allocation amendment, expiry, sweep, refund, owner recovery,
arbitrary call, approval, swap or native-value path. Unclaimed rights remain
reserved when another asset is selected for a later round. Accidental transfers
and unused donations cannot be withdrawn through this contract. Paused,
blacklisted, rebasing, upgraded or otherwise incompatible assets can strand
claims; no recovery mechanism or insurance is established. A reverted claim
can be retried explicitly after the underlying condition is corrected; there
is no automatic worker or retry loop. Onchain state follows the canonical chain;
offchain receipt consumers still need reorg reconciliation and finality policy.

## Eligibility, economics and readiness remain separate

The governor **supplies** the recipients and amounts. The contract does not prove
holder balances, historical snapshots, same-block/flash-loan exclusions,
thresholds, full holder coverage or that exclusions match an approved policy.
The governor could choose an incorrect allocation. Funding and a successful
claim prove a transfer under that supplied allocation, not a fair reward round,
fee provenance, buyback, permanent burn, reinvestment or verified contributor
work. No score or badge follows automatically.

Changing the funded payout asset between rounds is supported. Automatic basket
rotation, 2–10-asset selection, ecosystem ranking, market pricing, minimum pots,
cost-aware batching/carry-forward, fee collection before/after graduation,
conversion routes and a public holder claim service are **not** implemented.
Pair assets and payout assets are separate concepts; this escrow performs no
conversion. It accepts no launch-token-side fee processing. Those fees retain
their burn-only invariant. Pair-asset holder liabilities and earned platform
recirculation remain separate; this escrow does not allocate platform revenue.
There is no winner mode or adopted competitor percentage.

Before public testnet use: independently review the contract and chosen asset
behaviors, exact source/runtime/configuration, eligibility/snapshot producer,
allocation generation, custody/funding origin, governor/guardian control and
availability, receipt/reorg reconciliation, wallet review and operational recovery
limitations. Retain actual deployment and lifecycle evidence. Public testnet
readiness, full Counter/M06 completion, audit and mainnet approval remain false.
Audit alone does not satisfy other release gates.

## Executable verification

### Bounded balance snapshot to unsigned allocation

`lib/counter-allocation.ts` now connects supplied holder addresses to the actual
escrow's funding ABI. It is a read-only library, not a public route, signer or
automatic allocation service. The caller supplies an explicit chain-97 policy:
escrow/governor/guardian/launch token, three runtime hashes, payout asset, a
sorted unique nonzero account list (1–128), positive minimum holding and payout
budget. Amounts are exact uint256 base units, with no decimals/price inference,
adopted fee rate, token percentage or default threshold.

Two distinct read-client objects must agree at the lower head minus twenty
blocks, with head gap at most ten and matching block number/hash/timestamp.
Runtime pins, governor/guardian/launch-token identity, paused state, next round,
allowed payout runtime hash, launch-token total supply, every supplied balance
and each escrow exclusion are read at that same height. The balances must sum
to total supply exactly, including excluded and below-threshold balances.
Missing supply coverage, zero supply, malformed data, policy mismatch or
provider disagreement rejects the result. Under honest conventional ERC20
semantics, this detects omitted positive balances; an agreed RPC response or
malicious token can still misreport balances/supply. No transfer-history index,
deployment/factory authentication, Merkle proof, independent-provider operation
or holder-eligibility approval follows from arithmetic agreement.

Only non-excluded balances meeting the supplied minimum enter the denominator.
Each entitlement is `floor(budget * balance / eligibleUnits)` using bigint
arithmetic, including intermediate products wider than uint256. Zero payouts
are omitted. The returned `fundedAmount` is the sum of positive entitlements;
`unallocatedDust` is the budget less that sum. No zero-funded round is produced.
The builder never assigns dust to a recipient, another round, platform revenue
or a creator/LP allocation. It does not consume a budget or persist carry-forward.

The output includes the snapshot block/hash, observed next-round ID, exact
allocations and encoded `fundRound` calldata. The next-round ID is observational:
the existing contract function does **not** bind an expected ID, snapshot hash,
manifest, allocation expiry or replay nonce. Repeated observation/call generation
does not reserve funds or prevent a governor from funding another round. Wallet
review and a fresh check of policy, canonical snapshot, round, exact allowance,
actual funding balance/origin and liabilities remain mandatory before any future
execution integration. This library does not simulate funding or establish those
conditions. Sending its data is not authorized by the observation.

Every awaited client action is fenced before and after completion within a
shared real twenty-second wall timer and nondecreasing safe host clock. The
checked block and chain are reread; snapshots must be no more than 120 seconds
old, including at shared completion. A failed peer/timeout closes the lifetime,
preventing late responses from starting follow-on reads or producing calldata.
Already in-flight calls are not cancelled. Trusted host/clock/policy/providers,
height-based reads, deeper reorgs, finality and ABA limitations remain.

All output flags for complete holder index verification, independent providers,
approved eligibility policy, fee funding, execution authority and full Counter
readiness remain false. Runtime hashes do not verify proxy implementation safety
or issuer behavior. No launch-token fees are spent, sold or converted; holder
funding and platform recirculation remain separate obligations.

The local runtime now mints synthetic launch-token balances 10/30, observes both
at a shared confirmed block, generates 8/25 entitlements from a 34-unit budget
with one unit of unallocated dust, and submits those **actual encoded bytes**
to the compiled escrow using only local VM impersonation. It rejects an omitted
holder list, checks stored entitlements, and preserves the prior second-asset,
claim, pause, relayer, duplicate and transfer-failure/retry checks. It uses two
clients of one zero-account local EVM, not independent public providers, real
holders, approved funding or a publicly deployed reward service.

The existing `Omnichain Testnet Engine` workflow compiles/tests this isolated
contract, applies the same formatting and EIP-170/EIP-3860 size gates, and runs
`contracts-omnichain/scripts/counter-escrow-runtime.mjs`. The new runtime starts
pinned Anvil 1.7.1 on loopback with **zero generated accounts**, deploys the actual
compiled escrow and synthetic assets, and uses local VM impersonation with
actual viem HTTP/ABI transactions and receipt/state reads. It exercises two
funded assets/rounds, four claims, relayer destination binding, paused and
duplicate rejection, guardian restrictions, inexact-transfer rollback and an
explicit successful retry. The JSON report always marks eligibility, fee origin,
public deployment, full readiness and execution authority unverified/false.
An old report is removed before each run. CI retains the log/report for 14 days.

Solidity unit/fuzz/invariant tests cover the above plus wrong-chain operation,
sorted/duplicate/empty/oversized/zero/excluded allocations, pinned assets,
fresh funding despite donations/earlier pots, insolvency, code changes and
reentrancy. Fuzzing uses 1,000 runs; the stateful invariant uses 128 runs of 64
calls and reconciles funded = paid + reserved = paid + escrow balance for the
synthetic exact-transfer asset, including all outstanding round entitlements.
Fixed fixture addresses and VM impersonation require no account generation,
private keys or signatures. Local mocks establish transfer/accounting behavior,
not independent public providers, real holder eligibility, production assets,
signer custody or publicly funded claims.

## Optional round and snapshot binding

New isolated escrow builds also expose `fundSnapshotRound`. This retains every
`fundRound` validation and exact-transfer/liability rule, and additionally requires:

- the supplied expected round equals `nextRound` at execution;
- a nonzero snapshot hash equals the EVM's `blockhash` at the supplied height,
  between 20 and 255 blocks behind the executing block;
- a fixed deadline has not passed and is no more than 120 seconds ahead of the
  executing block's timestamp.

Successful funding stores the reference in `roundSnapshots(id)` and emits
`SnapshotBound`; failed funding reverts that reference, transfers and rights
atomically. Exact successful calldata cannot fund another round because its
expected round has been consumed. Funding against a different round requires
newly reviewed bytes. This does not deduplicate intentionally rebuilt allocations
or stop a governor from using the preserved legacy `fundRound` method.

`buildCounterSnapshotFunding` calls the existing bounded two-client allocation
engine and encodes this optional method, with expiry fixed at the observed
block timestamp plus 120 seconds. It never extends that deadline on retry. Its
`roundAndSnapshotBound` field describes the encoded method, not a transaction
receipt, publication approval or permission to send. The original
`buildCounterAllocation` still emits the original `fundRound` bytes; its observed
round remains informational. Its new `blockTimestamp` field is additive.

The EVM checks a recent block reference, not historical balances or eligibility.
It cannot prove that a supplied timestamp equals that block's timestamp, that
allocations were derived from its balances, or that the funding has legitimate
fee provenance. The helper derives those fields from its bounded observations;
a governor can construct different bytes. Block references are local-chain
observations, not independent-provider consensus or finality. Deep reorgs,
provider/host/policy trust, token/proxy behavior and wallet review remain separate.
Requests outside the 20–255-block window fail rather than substituting a newer
snapshot; rebuild and review explicitly. New contract source/runtime hashes need
fresh exact-source deployment, audit and operational evidence. Old deployments
and historical reports do not acquire this method or its guarantees.

The zero-account local HTTP/ABI rehearsal now sends the actual optional encoded
bytes, checks the stored reference, and rejects wrong-round/hash/expired inputs
and replay even with sufficient allowance. Its legacy second-asset funding and
four-claim/failed-transfer recovery checks remain. Unit/fuzz cases cover window
and expiry boundaries, authorization, pause/chain restrictions and atomic failed
funding. These are component tests, not a public deployment, complete Counter,
independent holder index, approved eligibility/asset policy or financial authority.


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


## Operator snapshot-funding CLI (M06/P04)

This explicit read-only command runs the actual two-client snapshot allocation
engine and emits unsigned `fundSnapshotRound` review bytes. It does not fund,
approve, sign, submit or retry transactions. Default-disabled invocation:

```bash
FORTUNE_COUNTER_FUNDING_READ_ENABLED=true \
FORTUNE_COUNTER_READ_RPC_URL=https://reviewed-primary.example/rpc \
FORTUNE_COUNTER_SECONDARY_RPC_URL=https://reviewed-secondary.example/rpc \
node --import ./scripts/register-ts.mjs scripts/prepare-counter-funding.mjs /protected/counter-policy.json
```

Use the exact existing `CounterAllocationPolicy` keys: chainId97, escrow and
runtime hash, governor, guardian, launch token and runtime hash, payout asset and
runtime hash, sorted complete supplied accounts (1–128), positive decimal-string
minimumHolding and payoutBudget in base units. The existing engine validates
policy before RPC and enforces its unchanged20-second wall deadline,20-confirmed
common block,120-second freshness, role/runtime/paused/supply coverage and exact
pro-rata/dust checks. This is not an independent holder index or eligibility,
fee-funding, custody/capital-origin or finality approval.

The CLI reads an existing regular file using a bounded16KiB+1 descriptor read,
strict UTF-8/JSON and exact byte rechecks before/after awaits. Supply two distinct
HTTPS origins without userinfo/fragments; transport uses5-second requests, no
redirect/retry/credentials. One-shot output includes a policy byte checksum,
original snapshot/deadline and null currentAuthorization/false execution and
full-readiness flags. A checksum is not policy approval. It never refreshes expiry
or writes files. Host/files/providers remain trusted; rechecks do not protect
against a privileged host. Review privacy before exposing real wallet lists.
Errors disclose no file path or provider credentials. No public API, scheduler,
signer or real configuration is enabled.

Child CLI/HTTP/ABI tests cover exact bytes, disabled/malformed preflight without
RPC, incomplete coverage, private errors and changed-file rejection. The existing
zero-account compiled escrow rehearsal additionally runs this CLI through a
test-only two-HTTPS-origin→ONE-local-Anvil mapping, matches snapshot-funding bytes
and exercises existing funding/claims/failure tests. It is not independent public
providers, a public deployment or full M06 readiness. All earlier methods,
economics, frozen Standard/dependency baseline and release gates are preserved.

## Unsigned fixed-recipient claim review

`buildCounterClaimBatch` in `lib/counter-claims.ts` reads1–32 strictly increasing
round IDs for one fixed nonzero recipient. Its strict chain97 policy pins the
escrow, governor/guardian, launch token/runtime and exact1–10 sorted payout assets.
Every supplied asset must be used; launch token and escrow cannot be payout assets.
Two distinct supplied clients must agree at common min(head)−20 with head gap≤10,
matching block number/hash/timestamp, snapshot age≤120seconds at completion,
runtime hashes, roles and open state. All reads use that height, then reread chain
and block. A20-second wall deadline, safe monotonic clock and before/after RPC
fences stop late follow-on reads; in-flight requests are not cancelled.

For each round it checks positive funded/claimable units, remaining≤funded,
claimable≤remaining and the recorded allocation hash. For each payout asset it
checks the escrow's asset pin, the sum of SELECTED round remaining liabilities
≤ reported reserved, and reported balance≥reserved, with exact uint256 bounds.
It does not enumerate every round or independently reconstruct global liabilities;
`globalSolvencyVerified:false` is always returned. Runtime pins and matching RPC
answers are not issuer/proxy, capital-origin, holder-eligibility or independent
provider/finality proof. Height calls are not EIP-1898 hash calls or ABA protection.

The result preserves raw decimal units and block provenance and produces ONLY
unsigned existing `claimMany(ids, recipient)` bytes. No approvals, signing,
submission, storage, scheduler, UI/API/CLI service or real configuration is added.
The bytes are NOT snapshot/amount/expiry bound; consumed rights or changed state
can cause execution to fail, and no price/transfer/gas guarantee is made. Review
current state and exact recipients in the wallet before any independently
authorized action. No automatic rebuild, retry, partial batch or recipient change.
Current authorization is null; execution/full readiness flags stay false.

Tests cover policy/ABI, liabilities, consumed rights, disagreement, changed headers,
completion age, late fences and a real20-second hung-provider timeout. The existing
zero-account compiled Counter HTTP/ABI rehearsal now consumes the builder's bytes
for two assets, preserving the transfer-failure rollback/retry drill, and rejects
fresh review after the claims are consumed. Two clients of ONE synthetic local VM
are not independent public providers or public custody. Contracts/root pins,
economics and release gates are unchanged; full M06 readiness remains incomplete.
