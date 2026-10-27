# Testnet implementation ledger

This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is recorded in merged PR #61. Preserve the frozen Standard candidate.

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
| AI Assisted | Product specification | Read-only source-grounded assistant, content drafts, explicit wallet-reviewed action integration and injection tests |
| Autonomous Agent | Isolated testnet single-pair swap vault with contract-enforced caps/floors/expiry/revocation and local venue-fork/RPC-to-journal tests | Agent runtime, reviewed manifests, native/global limits, protected operator custody, durable orchestration and public testnet failure/recovery drills |
| Managed Liquidity | Read-only V3 quotes, profit-policy helpers, receipt journal and bounded testnet swap primitive | LP-management adapters, complete cycle/cost/inventory settlement, live deployment evidence, global limits, loss/conflict disclosures and economic tests |
| Omnichain | Supply planner, pinned isolated testnet OFT token engine, message/replay fixtures, read-only quotes and receipt journal | Exact network/security manifests, deployment/pool integration, durable job/payment/refund orchestration, real route and partial-deployment/recovery drills |

No amount of passing planner or UI tests substitutes for the missing engine implementations above. Solana and Robinhood Chain are not implemented by the EVM testnet planner. New engines cannot inherit another engine's audit or deploy authority.

The receipt journal is documented in `ARBITRAGE_RECEIPT_JOURNAL.md`. It verifies and persists individual fill observations, with retry deduplication and persistent quarantine. It does not allocate realized profit, convert native gas costs into settlement assets, close cross-chain inventory or authorize spending. Its adversarial provider tests use fixtures; SQLite restart/concurrency tests use real local files and worker processes. The bounded-vault change also adds real RPC receipt/journal integration against a local Anvil fork, with two clients of that same fixture rather than independent public providers. No live arbitrage or complete durable settlement is claimed.

`STRATEGY_EXECUTOR.md` describes the bounded testnet swap vault, fixed governor/guardian/treasury powers, expiring owner-reviewed price floors and exact test scope. Local Pancake V3 fork swaps are not a publicly deployed vault or a cross-chain arbitrage service. The public catalog remains gated; this source primitive does not make the full agent or managed-liquidity modes testnet-ready.

## Owner-operated dependencies

Use protected service/CI configuration for RPC, durable storage, holder cron, uploads and attestor provisioning. Do not share private keys in chat. Existing owner workflows need faucet tBNB and their explicit confirmation inputs, as documented in RELEASE_HANDOFF.md. Local fixtures are not provider, incident-alert or live cross-chain evidence.

Audit readiness additionally requires reproducible pinned builds, scoped contract inventory, lifecycle/invariant/fork evidence and retained deployment artifacts for each engine. Mainnet also needs independent audit remediation, legal/asset review, governance acceptance/signatures, funding, production operations and activation evidence. An audit alone does not establish mainnet readiness.
