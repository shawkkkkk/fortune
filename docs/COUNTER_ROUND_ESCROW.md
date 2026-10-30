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
