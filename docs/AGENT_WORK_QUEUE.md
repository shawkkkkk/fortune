# Agent work queue

This is an entrypoint for choosing implementation work, not a claim that every
row is still missing or that any whole engine is ready. Re-read actual main,
open PRs, [TESTNET_IMPLEMENTATION.md](TESTNET_IMPLEMENTATION.md) and each engine's
source/tests before claiming a slice. The authoritative complete target is
[MEME_OS_PARITY.md](MEME_OS_PARITY.md), stable M01-M08/P01-P24. Do not replace it
with this shorter queue or narrow the project to the most recently touched helper.

## Task contract

Each PR should answer:

- Which feature ID and specific missing behavior does this deliver?
- Which actual engine is called and what existing behavior is preserved?
- Which data, identity, permission, custody and provider assumptions remain?
- What fails closed, what persists before an awaited action, and what happens
  after restart, replay, partial failure, reorg or uncertain outcome?
- What exact-source positive and adversarial evidence establishes acceptance?
- Which public testnet, operational, independent-review and mainnet gates remain?

Prefer a complete small path through real components over another disconnected
builder. Do not quietly enable a service/model, use credentials, choose fee
percentages or change a frozen release baseline to finish a task.

## High-value implementation tracks

These are candidates to scope after current-source review, not reserved tasks.
Split work into independent PRs or name explicit dependencies.

| Track | Existing entrypoints | Useful next acceptance boundary |
| --- | --- | --- |
| Creator identity and tools (M02/P01/P02/P06) | [creator registry](../scripts/creator-canon-registry.mjs), [creator brief](CREATOR_CHARACTER_BRIEF.md), [Studio](CREATOR_STUDIO.md) | Connect a reviewed creator flow to actual authorization/storage with nonce, expiry, replay, wallet-switch and privacy controls. Historical profile consistency must not become a login or spending permission. Real creator approval/hosting remains separate evidence. |
| Treasury/strategy runtime (M01/M07) | [budget coordinator](../scripts/reconcile-budgeted-receipt.mjs), [budget reconciliation](BUDGET_RECEIPT_RECONCILIATION.md), [profit book](REPORTED_STRATEGY_PROFIT_BOOK.md) | Extend actual durable orchestration/inventory/cost reconciliation. Preserve hold-before-RPC and journal-before-charge ordering; prove restart/replay/uncertain outcomes without clearing holds or treating asserted profit as cash. Three stores are not atomic settlement. |
| Price-gap routes (M01/M07/M08) | [V3 observer](../lib/arbitrage-v3-route.ts), [strategy executor](STRATEGY_EXECUTOR.md), [arbitrage scope](OMNICHAIN_ARBITRAGE.md) | Integrate reviewed venue adapters and receipt reconciliation with matching asset units, real costs and constrained execution boundaries. A spread/quote candidate is not executed profit, funded inventory, a public route or parity. No buyback-rate adoption. |
| Omnichain lifecycle (M08) | [engine](OMNICHAIN_ENGINE.md), [route observation](OMNICHAIN_ROUTE_OBSERVATION.md) | Durable payment/deploy/configuration/pool/opening/refund/replacement state with per-chain receipts and explicit liabilities. Prove partial-chain, delayed delivery, reorg and recovery cases. Paused config agreement is not delivery or independent-provider proof. |
| Counter and receipt-backed trust (M06/P10) | [round escrow](COUNTER_ROUND_ESCROW.md), [claim receipts](COUNTER_CLAIM_RECEIPTS.md), [permanent burns](OMNICHAIN_PERMANENT_BURN.md) | Complete deduplicated per-asset settlement/history and reorg/conflict handling before totals or badges. Add independently qualified eligibility/rotation sources in separate slices. Purchase, allocation, burn and funding origin are distinct claims; winner economics/legal review remains separate. |
| Social/community authorization (M04/P12/P13/P14/P15/P21) | [social fees](SOCIAL_FEES.md), [creator flow](CREATOR_FLOW.md) | Actual bounded identity/claim/recovery or role/moderation integrations, then operational delivery evidence. No posting/payment authority from text or a handle alone. Do not choose a split from the contradictory reference or transfer custody because of a community claim. |
| Bitcoin Runes (M05) | [transaction inspection](BITCOIN_TRANSACTION_INSPECTION.md), [Runestone decoder](BITCOIN_RUNESTONE_DECODER.md), [index reader](BITCOIN_RUNE_INDEX.md) | Add real source-checked differential/chain evidence or bounded adapters, with exact amounts, naming/finality and failure semantics. Supplied bytes, a Merkle root or BTCB pairing do not establish Bitcoin issuance, spend validity, backing, custody or a bridge. |
| Trading rules and Workshop (M03/P16) | [launch rules](LAUNCH_RULES.md), [launch engines](LAUNCH_ENGINES.md) | Prove exact-generation rule enforcement, immutable settings/exemptions/expiry and adversarial trade/graduation behavior through the actual isolated engine. Disclose admin powers and unsupported combinations; do not retrofit frozen Standard or claim rug/whale immunity. |
| Testnet/mainnet qualification (P24/all affected engines) | [release checklist](AGENT_RELEASE_CHECKLIST.md), [release handoff](RELEASE_HANDOFF.md) | Reproduce actual lifecycles and failure/recovery evidence for exact source and scope, report gate status honestly and prepare independent-review materials. Do not activate or inherit Standard approval for another engine. |

## Full platform coverage remains required

Use the IDs in MEME_OS_PARITY.md; these groups preserve the broader backlog:

| IDs | Required product surface |
| --- | --- |
| P01-P06 | Wallet/wizard, character canon, read-only project MCP, developer quickstarts/playground/skills, stock-agent/GitHub incubator and creator-approved content/media Studio |
| P07-P10 | Live avatar/voice/chat, contract-and-claim X-Ray, wallet/bundle/radar intelligence, receipt-backed trust/reinvestment/burn evidence |
| P11-P16 | Dev Bonds, raids/rewards, community takeover/Guardian, Discord launch/tickets/tracking/alerts and reviewed trading-rule Workshop |
| P17-P19 | Existing EVM CREATE2 vanity workflow and catalog integration, research/prediction Arena, scoped Syndicate jobs/disputes/payment receipts |
| P20-P24 | Unified dashboards, forum/announcements/chat/moderation, external discovery, public APIs/exports/auth/durable quotas/plans and security/custody/user docs |

M01 Minds, M02 Co-Pilot, M03 Sentinel, M04 Social Escrow, M05 Bitcoin Runes,
M06 Counter, M07 managed liquidity and M08 omnichain each require their complete
runtime and acceptance evidence. Preserve Standard, Custom Pair, Burn + Rewards,
Basket Rewards and earlier product behavior. Do not duplicate Standard's
existing prepared CREATE2 salt search or add private-key imports/key sales.

## Avoid fake completion

A source component, UI preset, unsigned planner, fixture, two clients connected
to one VM, index label, checksum or capital label cannot establish full readiness.
Keep independent-provider/finality/current-authorization claims false or unknown
until the corresponding evidence exists. Agents must not manufacture public
route, signer, funding, legal, audit or recovery evidence to close a task.
