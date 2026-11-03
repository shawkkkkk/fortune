# Direct Counter payout receipt observation

`inspectCounterClaimReceipt` is an explicit read-only library for the isolated
chain97 Counter escrow's direct `claim(round,recipient)` call. It does not submit,
sign, prepare calldata for execution, consume a ledger or enable a service.
Existing claim preparation, contract and all older paths remain unchanged.

Supply an exact trusted policy: chain97, escrow/launch-token/payout-asset addresses
and runtime hashes, governor/guardian, explicit caller/recipient/round/amount and
transaction hash. Addresses/hashes are canonical lower-case; round/amount are
positive canonical uint256 decimal strings. Caller may be a relayer; the payout
must go to the recorded recipient, never the relayer merely because it submitted.
Policy labels and hashes are not reviewed asset/capital/creator authorization.

Two distinct supplied clients must agree at one receipt height, with at least20
confirmations under their common minimum head and head gap at most10. The reader
binds successful receipt/transaction/block hashes, indices and block transaction
list; exact direct zero-native-value calldata; receipt-height code, immutable
roles/launch-token/asset pin, round asset/funded/allocation hash and zero remaining
recipient entitlement. Block-end round remaining must not exceed funded minus
this selected payment; it is **not** a transaction delta or complete payout total.
Exactly one canonical asset Transfer escrow→recipient is followed immediately by
one canonical Claimed(round,recipient,asset,amount). Extra/removed/reordered or
foreign logs, batch/outer calls and noncanonical fields reject. Receipt/block/
chain rereads and peer equality are required before returning an observation.

The whole read has one rejecting20-second wall deadline, safe nonnegative
monotonic host-clock checks around every RPC and finally fencing on every outcome.
Original client method receivers are preserved. Late completions cannot initiate
follow-on reads, but in-flight calls are not canceled and event-loop scheduling
can delay timeout delivery. Historical receipts are supported with no current-age
claim; future receipt-block timestamps reject. Height-addressed calls and trusted
host/policy/clock/RPCs are not EIP1898 hash calls, independent-provider consensus,
finality or ABA/reorg recovery proof. Runtime pins do not prove issuer/proxy safety.

The stable chain/escrow/transaction/Claimed-log evidence ID is for downstream
**permanent deduplication**. Repeated reads must never be summed. There is no
consumed ledger, aggregate rewards, badge, current claim permission or proof of
pre/post balances, eligibility, complete holder coverage, fee/capital origin,
global solvency, custody legitimacy, delivery, legal approval or full M06 readiness.
Authorization is always null; provider/finality/eligibility/funding/capital/
balance/solvency/execution/full-readiness flags remain false. Other claim routes
need separate readers. Never use holder/creator/LP liabilities as strategy capital;
launch-token-side fees only burn and pair-asset rewards remain distinct.

Unit tests cover binding/state mutations, preflight, replay, peer/header/receipt
changes, clock rollback and real timeout/late-peer fencing. The existing compiled
zero-account local Counter lifecycle now calls this actual reader over HTTP/ABI,
checks delivered8 units, stable replay, wrong-amount rejection and batch exclusion,
while preserving prior funding/claim/rollback/retry assertions. Two clients of one
synthetic local VM are not independent providers, public custody, legitimate
capital, a public deployment or audit approval. No real policy/configuration,
contract, Standard/root pin, dependency, economics, authority or release gate is
changed; full M06 and release readiness remain unfinished.
