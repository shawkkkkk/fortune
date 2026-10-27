# Testnet implementation ledger

This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is proposed in PR #61. Preserve the frozen Standard candidate.

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
| Protected Launch | Custom-pair rules; expanded rules in PR #54 | Review #54 independently; deploy supported rules, test trade rejection, expiry and graduation |
| Social Fees | Custom-pair routing, social vault and proof service | Operator-provisioned attestor, exact identity/claim/recovery drills and configured vault |
| Basket Rewards | Isolated Stock Rewards contracts/builder | Protected deployment/drill, payout reconciliation and real multi-asset claims; arbitrary reward baskets need additional adapters |
| Burn + Rewards | Isolated token/accounting prototype | Infinity hook, factory, trade/graduation integration, indexer, settlement and audit scope |
| AI Assisted | Product specification | Read-only source-grounded assistant, content drafts, explicit wallet-reviewed action integration and injection tests |
| Autonomous Agent | Product specification | Isolated executor, enforced permissions/budgets, revocation, custody design, receipts, failure/recovery drills |
| Managed Liquidity | Product specification | Strategy/venue adapters, capital accounting, bounded execution, loss/conflict disclosures and economic tests |
| Omnichain | Supply planner, bounded preview API and accounting helpers | Pinned transport/token engine, authenticated message/replay tests, exact network/security configs, pool adapters, durable job/payment/refund orchestration, route and partial-deployment drills |

No amount of passing planner or UI tests substitutes for the missing engine implementations above. Solana and Robinhood Chain are not implemented by the EVM testnet planner. New engines cannot inherit another engine's audit or deploy authority.

## Owner-operated dependencies

Use protected service/CI configuration for RPC, durable storage, holder cron, uploads and attestor provisioning. Do not share private keys in chat. Existing owner workflows need faucet tBNB and their explicit confirmation inputs, as documented in RELEASE_HANDOFF.md. Local fixtures are not provider, incident-alert or live cross-chain evidence.

Audit readiness additionally requires reproducible pinned builds, scoped contract inventory, lifecycle/invariant/fork evidence and retained deployment artifacts for each engine. Mainnet also needs independent audit remediation, legal/asset review, governance acceptance/signatures, funding, production operations and activation evidence. An audit alone does not establish mainnet readiness.
