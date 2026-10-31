# Isolated testnet scoped-work escrow

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
