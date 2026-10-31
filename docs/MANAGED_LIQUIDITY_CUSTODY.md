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
