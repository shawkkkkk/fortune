# Historical liquidity-custody deposit receipts (M07)

`inspectLiquidityCustodyDepositReceipt(twoClients, {policy, transactionHash})`
is an explicit read-only library API. It reuses the existing exact chain97
custody-policy validator before RPC and the actual position observation body at
the receipt height. Existing held-state and release readers remain unchanged.
There is no CLI, service, configuration, signing or automatic observation loop.

The successful direct governor call must send zero native value to the pinned
custody contract with exactly `deposit()` calldata. Transaction and receipt
hashes, block numbers/hashes, transaction indices and the block transaction list
must bind. Exactly three adjacent canonical logs are required: manager Approval
clearing the governor's token approval, manager Transfer from governor to custody,
then custody PositionDeposited naming that governor and NFT. Extra, missing,
removed, reordered, malformed, foreign or release-route logs reject. Smart-wallet
and batch outer calls are unsupported. Both heads must confirm the receipt by at
least20 blocks and differ by at most10 blocks.

At that exact receipt height, both clients must agree on the complete pinned
manager/factory/canonical pool/assets/fee/ticks/raw-liquidity position, custody
ownership and zero token approval. Custody runtime, all three immutable roles,
every stored policy field, `held=true`, `released=false` and boolean pause state
must match. Receipt and number/hash/timestamp/transaction-list bindings are
reread. The pause value is block-end state; a later pause in the same block is
allowed. A later same-block release or changed NFT approval/owner may reject an
otherwise earlier valid deposit. No pre-call state or transaction replay is
claimed. A direct unsolicited NFT transfer without recorded custody is rejected.

One real30-second lifetime and safe nonnegative monotonic host clock fence all
seven RPC methods before and after awaits, including the reused position body.
Success, failure and timeout close the fence; original method receivers remain
intact and late completions cannot start follow-on reads. In-flight requests
are not canceled. Trusted host/clock/RPC, event-loop scheduling, height-call ABA
and non-EIP-1898 limitations remain. The low-level composition helper alone is
not independently validated or timed; this API validates and fences its calls.

Historical receipts have no maximum-age requirement; future block times reject.
Current custody can already be released while the historical deposit observation
still reports recorded held state at its own height. `observedAtMs` is observation
time, not renewed receipt time, current ownership or current authorization.
Output includes raw units, null TVL/claimable fees, receipt-consistency checksum
and a stable chain/custody/transaction/deposit-log evidence ID. Consumers MUST
deduplicate that ID. Repeated reads must not be counted as additional deposits.
No consumed ledger, totals, badge, complete lifecycle or reorg recovery is added.
The checksum is local consistency, not authentication or an independent anchor.

`currentAuthorization` is null. Treasury control, project consent, legitimate
capital origin, replayed pre-deposit state, provider independence, finality,
execution and full managed-liquidity readiness remain false. Wallet-role/NFT
agreement is not key control, economic ownership, fee funding, realized profit,
custody safety or permission to manage funds. No fees are collected or converted;
launch-token-side fees remain burn-only. Creator/holder/LP liabilities and launch
reserves are never strategy capital. Standard, contracts, root pins, economics
and release gates remain unchanged.

## Component evidence and limits

Fixture tests exercise the actual position body and custody validator, direct
calldata, canonical logs, complete state/policy bindings, replay, paused block-end
state, route separation, changed receipts/headers, provider disagreement, invalid
and reversed clocks, receiver preservation, peer failure and a real30-second
timeout with fenced late completion. These clients supply synthetic observations;
they are not public-provider or real-custody evidence.

The existing compiled zero-account Pancake fork drill reads its actual deposit
receipt after the existing fixed-treasury release. This distinguishes historical
deposit state from current terminal state. It checks stable replay, wrong-governor
rejection, mutual deposit/release route rejection and unchanged current head,
latest/pending governor nonces, NFT owner and custody flags. No extra financial
transactions, mining or wall waits are added; the earlier deposit is covered by
the existing release rehearsal's bounded wall alignment. All old lifecycle and
release receipt assertions remain. Exact-head CI establishes whether this drill
passed; implementation or an unrelated suite alone is not passing evidence.

Pancake manager compatibility relies on canonical transfer approval-clearing
events, as observed in its public NonfungiblePositionManager source blob
`9db060216f073adfab52548c535b99d47d62faf0` recorded with the release reader.
Source review is not deployed-version or audit proof; the actual pinned local
fork receipt is separate compatibility evidence. Two clients of one zero-account
fixture are not independent public providers, public custody/reorg/finality,
legitimate funding, retained storage, legal/audit approval or full M07 readiness.
Management, multi-wallet constraints, inventory/cost/profit accounting, signer,
deployment, provider/asset/custody review, privacy, operations/failure/recovery
and independent review remain separate. Audit alone is not mainnet approval.

## Complete topic slots

The canonical comparison checks every expected topic index for its own present
value before normalization. Sparse arrays, inherited topic values, undefined
and null reject for both initial and repeated receipts. JavaScript array methods
can skip holes; ordinary JSON has no hole representation, so this is validation
of in-process client/adapter output, not evidence of a malformed public RPC
response or a financial exploit. Exact ordinary dense receipts, provenance,
dedup IDs, state/clock bounds and null/false authority remain unchanged.
