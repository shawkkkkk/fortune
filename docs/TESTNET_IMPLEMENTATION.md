# Testnet implementation ledger

This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is recorded in merged PR #61. Preserve the frozen Standard candidate.

## Complete feature coverage

The owner's full MEME OS reference is mapped in [MEME_OS_PARITY.md](MEME_OS_PARITY.md):
eight launch blocks plus project/platform features P01–P24. That coverage is the
product target; recent arbitrage/receipt/budget work is only one subset. Preserve
all existing Fortune presets/capabilities. Documentation records scope, not parity
completion, deployment or approval.

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
| AI Assisted | Disabled operator-only source-card co-pilot and gateway adapter | Project-aware content drafts, public auth/quotas, protected model/privacy/spend/quality review, explicit wallet-reviewed action integration and injection tests |
| Autonomous Agent | Isolated testnet single-pair swap vault with contract-enforced caps/floors/expiry/revocation and local venue-fork/RPC-to-journal tests | Agent runtime, reviewed manifests, signer-bound/native/global limits, protected operator custody, durable orchestration and public testnet failure/recovery drills; SQLite native-gas books/holds are not wallet enforcement |
| Managed Liquidity | Read-only V3 quotes and pinned LP NFT inspector, profit-policy helpers, receipt journal and bounded testnet swap primitive | LP-management adapters, complete cycle/cost/inventory settlement, live deployment evidence, global limits, loss/conflict disclosures and economic tests |
| Omnichain | Supply planner, pinned isolated testnet OFT token engine, message/replay fixtures, read-only quotes and receipt journal | Exact network/security manifests, deployment/pool integration, durable job/payment/refund orchestration, real route and partial-deployment/recovery drills |

No amount of passing planner or UI tests substitutes for the missing engine implementations above. Solana and Robinhood Chain are not implemented by the EVM testnet planner. New engines cannot inherit another engine's audit or deploy authority.

The receipt journal is documented in `ARBITRAGE_RECEIPT_JOURNAL.md`. It verifies and persists individual fill observations, with retry deduplication and persistent quarantine. It does not allocate realized profit, convert native gas costs into settlement assets, close cross-chain inventory or authorize spending. Its adversarial provider tests use fixtures; SQLite restart/concurrency tests use real local files and worker processes. The bounded-vault change also adds real RPC receipt/journal integration against a local Anvil fork, with two clients of that same fixture rather than independent public providers. No live arbitrage or complete durable settlement is claimed.

`STRATEGY_EXECUTOR.md` describes the bounded testnet swap vault, fixed governor/guardian/treasury powers, expiring owner-reviewed price floors and exact test scope. Local Pancake V3 fork swaps are not a publicly deployed vault or a cross-chain arbitrage service. The public catalog remains gated; this source primitive does not make the full agent or managed-liquidity modes testnet-ready.

Recent merged #71–#78 add source-card assistance, queued actual local-fork receipts,
read-only health, revalidation/quarantine, retained local rollback drills, a pinned
LP-position reader and native-gas books/reconciliation with fenced holds. These
are component foundations. Budget schema2 rejects schema1 without explicit offline
migration (NATIVE_GAS_BUDGET_MIGRATION.md); crashed holds still have no reviewed
recovery tool. The complete project-facing modes,
public services, constrained signer integration and global settlement are not
made ready by those merges. See CREATOR_COPILOT.md, MANAGED_LIQUIDITY_READER.md,
STRATEGY_NATIVE_GAS_BUDGET.md and BUDGET_RECEIPT_RECONCILIATION.md.

## Owner-operated dependencies

`CHARACTER_RECORD_MCP.md` connects the local stdio server to an explicitly selected
read-only character registry through a separate optional tool/resource. It checks
stored signature consistency and labels historical provenance/current authorization
unknown. It never fills public canon fields or grants publication authority.
Actual child stdio/SQLite fixture tests pass; live creator approval, current RPC
revalidation, hosted identity/privacy/quotas and public agent readiness remain open.

`CREATOR_CANON_REGISTRY.md` adds default-disabled operator-only EIP-712 character
imports and append-only SQLite version history for one reviewed Standard testnet
project. Two clients check pinned factory/creator/block bindings; replay and racing
revisions fail closed. It supports EOAs only and records historical authorization,
not current login, onchain metadata changes, public canon or publication authority.
Tests use signature/provider fixtures and actual files/processes/HTTP, not a real
creator's approval. Public Studio/MCP integration, smart-account support, live
creator evidence, revalidation and durable hosted operations remain outstanding.

`PROJECT_SNAPSHOT.md` adds a same-block Standard testnet metadata/curve API and
the MCP get_project_snapshot tool/resource. It binds creator/factory/token/block,
preserves exact supply and curve-accounting strings and hides retired curve prices.
It does not infer volume/holders/treasury/market cap or supply a trade quote, and
API attestations are not independent client RPC/finality or financial authority.

`CREATOR_STUDIO.md` adds `/studio`: browser-local character drafts, bounded
project-scoped JSON roundtrips and deterministic announcement wording with review
before download. It is not creator authentication, onchain canon, AI generation or
social publishing, and does not populate the MCP reader's missing character fields.

`PROJECT_MCP.md` adds the first project-facing canon/MCP developer slice:
an explicitly enabled local stdio server with real initialization/discovery/calls,
one process-bound Standard testnet token and a public-metadata projection. Empty
character/license fields remain null. This reads Fortune API attestations, not
independent RPC evidence, and has no treasury/wallet/write tools. Local HTTP/stdio
fixtures do not establish external-client interoperability or full agent readiness.
Creator-authenticated character editing, broader tools and hosted auth/quotas remain.

Use protected service/CI configuration for RPC, durable storage, holder cron, uploads and attestor provisioning. Do not share private keys in chat. Existing owner workflows need faucet tBNB and their explicit confirmation inputs, as documented in RELEASE_HANDOFF.md. Local fixtures are not provider, incident-alert or live cross-chain evidence.

Audit readiness additionally requires reproducible pinned builds, scoped contract inventory, lifecycle/invariant/fork evidence and retained deployment artifacts for each engine. Mainnet also needs independent audit remediation, legal/asset review, governance acceptance/signatures, funding, production operations and activation evidence. An audit alone does not establish mainnet readiness.
