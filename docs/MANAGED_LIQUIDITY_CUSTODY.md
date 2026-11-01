# Isolated testnet single-position custody

`FortuneTestnetPositionCustody` is an unaudited chain97-only M07 component.
It is separate from frozen Standard, the swap vault and holder/reward escrows.
No public deployment, signer, strategy service, fee processing or mainnet approval
is established. Existing dependency/compiler pins are unchanged.

The constructor locks a governor, a distinct guardian, a fixed treasury and one
position policy. Policy has no setter: position ID, manager/factory/pool and two
sorted assets with runtime hashes, fee tier, exact tick range and exact positive
raw liquidity. Infrastructure/asset targets must be distinct and cannot be role
addresses. Construction checks the manager's factory, canonical factory pool,
pool identity, position fields and governor ownership.

The contract starts paused. Only the governor can open deposits after rechecking
the pinned position; the guardian can pause but cannot open or move the NFT.
One explicit governor deposit transfers the configured NFT from the governor,
checks exact owner and zero token approval after transfer, and records custody.
The contract exposes no NFT approval, fee collect, increase/decrease liquidity,
swap, arbitrary call, delegatecall or ERC20/native withdrawal method.

Only the governor can release while paused, only to the constructor's fixed
treasury. Release checks pins/route/position/owner/zero approval before and after
transfer. Exact raw liquidity must remain unchanged; failed, no-op or mutating
transfers revert custody state atomically. Release is terminal: no redeposit or
second release. Both transfers and pause changes are nonReentrant and chain97
checked. Read-only policy/state and deposit/release events expose the boundary.

This uses ERC721 `transferFrom`, not safe-receiver callbacks. The governor must
review that the fixed treasury can actually control the received NFT; contract
recipient compatibility and key custody are not proven. Unsolicited NFTs/direct
transfers and native/ERC20 assets have no recovery path. The contract does not
implement a safe-NFT receiver or accept arbitrary position deposits. Do not send
assets outside the explicit deposit path. Changed code, liquidity or incompatible
manager behavior can strand the tracked NFT; there is no admin bypass or generic
recovery drain. Runtime hashes do not prove honest proxy implementations, issuer
safety or immutable venue administration.

Governor ownership and observed NFT custody do not prove legitimate capital
origin. Funding must be independently reviewed as operator-owned capital, never
creator/holder/LP liabilities or launch reserves. No fee amounts are collected,
sold, distributed or labeled as revenue; launch-token-side fees remain burn-only
under a separately reviewed future processor. Principal ownership is not a price
floor, solvency guarantee, insurance, or proof of complete inventory/profit/cost
settlement. No asset price, TVL or claimable fee amount is inferred.

The existing local zero-account Pancake V3 fork rehearsal now mints a real venue
position against synthetic assets, deploys this component, explicitly approves
and deposits the NFT, and calls the actual pinned LP reader for contract custody.
The former governor owner-policy is rejected. An active release rejects; after
pause the fixed-treasury release succeeds, duplicate release rejects, and the
reader observes unchanged liquidity at the treasury. Unit/fuzz tests cover
roles/pause/chain, failed/no-op/inexact transfers, changed route/code/liquidity,
reentry, configuration and expected-liquidity mismatch. Two read clients use ONE
local fixture; no keys, generated accounts or public broadcasts are needed.

Source/tests/local fork evidence are separate statuses. Inspect exact-head CI,
retained reports and source before treating a rehearsal as passed. This is one
custody primitive, not a full LP manager, multi-wallet strategy, pool migration,
fee processor, public custody service or complete M07 testnet readiness. Public
activation still needs exact-source deployment, capital/custody/asset/venue review,
signer/governance, independent audit/legal, provider/finality, failure/recovery,
privacy and operations evidence. Other engines cannot inherit its evidence.

## Read-only held-state integration

`inspectLiquidityCustody` is an explicit library API for a supplied chain97
custody/runtime/role/position policy. It calls the unchanged
`inspectLiquidityPosition` engine with the custody address as owner, then reads
that exact block's custody runtime, all three roles, stored policy and lifecycle
flags through the same two clients. Both must report `held=true`,
`released=false`, boolean pause state, zero token approval, exact ticks and exact
positive raw liquidity. Every stored route address/runtime hash and position
field must match the supplied policy. Equal pause state and number/hash/timestamp
headers must agree; custody headers and chain identity are reread afterward.
A physically held NFT without the contract's recorded held state is rejected.
The reader supports held positions while open or paused. It rejects the initial
not-deposited state and released positions; it does not reconstruct deposit or
release receipts, or certify the full lifecycle history.

The outer operation has one real 30-second wall deadline, including the nested
LP reader, a safe nonnegative monotonic host clock and before/after RPC fences.
Success, failure and timeout all close the fence, preserving original client
method receivers and preventing late follow-on reads. Inflight requests are not
cancelled; event-loop scheduling and trusted host/clock remain limitations. The
existing LP reader selects the common minimum head minus twenty. Historical
snapshots remain supported: there is no new snapshot-age or head-gap bound, no
EIP-1898 hash calls, canonical-chain/finality/ABA proof or independent-provider
verification. A changed release/pause/owner after the selected height is not
current state. `observedAtMs` records observation time, not block freshness.

Output includes the actual LP observation, stored held/pause state and reviewed
role addresses. Raw liquidity is not value; TVL and claimable fees remain null.
`currentAuthorization` is null; project consent, legitimate capital origin,
provider independence, finality, execution and full managed-liquidity readiness
remain explicitly false. A pinned runtime is not proof of safe proxies or venue
administration. No project/factory consent, treasury control, funding origin,
complete inventory, solvency, economic allocation or management permission is
inferred. Never use creator/holder/LP liabilities or launch reserves as strategy
capital. Launch-token-side fees remain burn-only; no fees are processed here.
There is no CLI, HTTP/MCP exposure, stored trust, scheduler, signer or live
configuration added. Privacy review is still needed before storing/sharing real
wallet provenance. No prior deployment or audit evidence approves new source.

The existing zero-account Pancake fork rehearsal now calls this actual reader
against the compiled custody contract and real manager NFT: held/open and
held/paused succeed, wrong fixed treasury rejects, and the reader rejects after
the paused fixed-treasury release. Synthetic ABI fixtures cover every policy
field, mismatched state/runtime/approval/liquidity/header, provider disagreement,
clock rollback, receiver binding, peer failure and a real thirty-second hung
custody read with fenced late completion. Two clients of ONE local fixture are
not independent public providers, public deployment, legitimate-capital evidence
or complete M07 readiness. Exact-source CI and retained runtime reports remain
separate from public custody, audit and mainnet gates.
