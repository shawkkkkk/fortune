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
