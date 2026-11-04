# Historical liquidity-custody release receipts (M07)

`inspectLiquidityCustodyReleaseReceipt(twoClients, {policy, transactionHash})`
is an explicit read-only library API. `policy` is the existing exact chain97
`LPCustodyPolicy`; its unchanged validator is reused before RPC. There is no
CLI, service, signer, real configuration or automatic observation loop.

The successful direct zero-native governor call must be exactly
`releaseToTreasury()`, to the pinned custody contract. Both clients must agree
on transaction/receipt/block hashes, numbers and indices, block transaction-list
binding and three adjacent canonical logs: manager Approval clearing the custody
owner's NFT approval, manager Transfer of the exact position from custody to the
fixed treasury, then custody PositionReleased. Missing, extra, removed, foreign,
reordered or malformed logs reject. Smart-wallet/batch outer calls and deposit
receipts are unsupported. Reverted or unconfirmed transactions reject.

Both heads must have at least20 confirmations and differ by at most10 blocks.
The original position engine's observation body is reused at the RECEIPT height,
not a fabricated head or the current common snapshot. It verifies manager,
canonical factory/pool, assets, ticks, fee, exact raw liquidity, treasury owner
and zero NFT approval. Custody code, immutable roles, stored full position policy,
`held=false`, `released=true` and boolean pause state are checked at that same
height. Receipt and number/hash/timestamp/transaction-list bindings are reread.
Every required output agrees across both clients. Block-end state can reject an
otherwise earlier valid release if a later transaction changes ownership or
approval in that same block. Pause state is block-end, not replayed pre-call state.

One real30-second wall lifetime and safe nonnegative monotonic host clock fence
all seven RPC methods before/after awaits, including the reused position body.
Every outcome closes the fence; late results cannot start further reads.
Original method receivers remain intact. In-flight RPC is not canceled; trusted
host/clock/providers, event-loop scheduling and height-call/ABA limits remain.
The low-level exported composition helper is not independently validated or
wall-timed; the new API validates and fences it. Existing public readers retain
their original validation, outputs, clocks and behavior.

Historical receipts are supported with no maximum-age requirement; future blocks
reject. Output retains exact raw position units, null value/claimable fees,
receipt checksum and a stable chain/custody/transaction/release-log evidence ID.
Consumers MUST deduplicate that ID; repeated reads must not be summed. There is
no consumed ledger, total, badge, deposit-history reconstruction or reorg recovery.
The checksum is byte consistency, not authentication or an independent anchor.

`currentAuthorization` stays null. Treasury control, project consent, legitimate
capital origin, replayed pre-release state, independent providers, finality,
execution and full managed-liquidity readiness are always false. Matching NFT
transfers do not establish key control, economic ownership, custody safety,+funding origin, fee funding, realized profit or current entitlement. No fees are
collected/converted; launch-token-side fees remain burn-only. Creator/holder/LP
liabilities and launch reserves are never strategy capital. No contract, frozen
Standard, root dependency/economic policy or release gate changes.

## Component evidence and limits

Fixture tests exercise the actual shared position body and custody validator,
canonical events, direct call and all state/policy bindings, replay, provider
disagreement, changed receipts/headers, clock rollback, peer failures, original
receivers and a real30-second timeout with fenced late completion. The existing
compiled zero-account Pancake fork drill consumes its actual successful release
receipt, checks replay and wrong-treasury rejection, and verifies chain height,
latest/pending governor nonces, NFT owner and custody flags remain unchanged.
Its old calls/assertions/mining remain; a new test-only wall wait is at most60s
before the unchanged production clock checks. Exact-head CI determines whether
that rehearsal passed; source or a green unrelated suite alone is not evidence.

Pancake's public NonfungiblePositionManager `_approve` implementation was read
at source blob `9db060216f073adfab52548c535b99d47d62faf0` in
`pancakeswap/pancake-v3-contracts`,
`projects/v3-periphery/contracts/NonfungiblePositionManager.sol`. That source
observation is not proof of the deployed version or independent approval; the
actual pinned local-fork receipt is separate compatibility evidence.

Two clients of one local fixture are not independent providers, public custody,
public reorg/finality, legitimate funding, retained storage, recovery, legal or
audit approval. Full M07 still needs management/strategy execution, inventory/
cost/profit accounting, multi-wallet constraints, custody/provider/asset review,
signer/governance, deployment, privacy, operational/failure/recovery and independent
review evidence. Audit alone does not satisfy mainnet activation gates.
