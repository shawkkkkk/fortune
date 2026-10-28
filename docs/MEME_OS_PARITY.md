# MEME OS feature coverage for Fortune

Owner-accepted product scope, October 27, 2026. This checklist supplements
[BNB_HOME_BASE_ROADMAP.md](BNB_HOME_BASE_ROADMAP.md) and is linked from the
[implementation ledger](TESTNET_IMPLEMENTATION.md). The goal is the complete
launch/run/grow ecosystem on Fortune, not just omnichain arbitrage, safety
helpers, a launch-mode catalog or eight buttons.

## Reference and interpretation

The owner supplied the full MEME OS documentation as
`Pasted text(20261028-021032).txt` (53,949 bytes), SHA-256
`6bdfb4cd6df1b270652a99ba72bb14c3b84bc19b05d7b3b305e00a8b2c09cfee`.
This records the exact supplied reference without publishing its full text or
using competitor addresses as Fortune configuration. Its product descriptions
are reference claims, not independently verified deployed behavior or audit
results. The attachment describes **eight** blocks, alongside platform tools.
Earlier counts and Fortune's ten existing presets do not change that distinction.

Current Fortune source reviewed at main
`df6bbac4e5203f7357fb106e2aea295b6cfbb9e7`, after #71–#78 merged. Those PRs
provide foundations; they do not complete any new full financial engine.
Source, fixture tests, local-fork evidence, public testnet deployment, operations
and audit approval are separate statuses. A passed component cannot mark the
whole block complete. Exact current evidence lives in the implementation ledger,
engine docs and release handoff; this document records coverage requirements.

Preserve Standard, Custom Pair, Burn + Rewards, Basket Rewards and every previous
Fortune capability. New operating modes are additive reviewed combinations,
not a replacement for the frozen Standard candidate. Keep the approved
white/red/gold lucky-cat UI, fortunepad.fun and @fortunepad. Brew remains the
direct BNB competitor; LESGO remains the simple-launch/pair-asset reward reference.

## Eight launch blocks

| ID / reference block | Fortune scope and subfeatures | Present foundation; completion still required |
| --- | --- | --- |
| M01 Minds | Per-project constrained treasury/agent; immutable disclosed fee destination; observe → claim → decide → execute → log; buyback, permanent burn, verified contributor/raid payouts or hold; action/day/exposure caps, gas/operating reserves, earned-fee activation threshold; project-owned social account and posting cadence; public decision summaries and receipts | Bounded testnet swap vault, quotes, receipt journal/queue/revalidation and native-gas book/reconciliation. Missing the complete per-project agent, fee claims, constrained action adapters, social integration, public log, signer-bound/global limits and live lifecycle drills. A prompt is not a spending control. |
| M02 Co-Pilot | Creator retains disclosed control and signs actions; source-grounded posts, images, campaign/7-day plans, raid copy, daily briefs and alerts; fee claim and explicit claim/buyback review; receipt-backed reinvestment badge | Disabled source-card selector/CLI exists. It does not draft content, know every project's live state, propose wallet-reviewed actions or provide the public assistant. Protected model/privacy/budget/quality review and public auth/quotas remain. |
| M03 Sentinel | Trading-open gate, max wallet, opening anti-snipe caps and windowed sell restrictions; immutable/disclosed rules, mint/admin powers, curve and graduation expiry; inspect rules before signing | Isolated custom-pair rules/builder. Exact deployed-generation enforcement, exemptions, expiry, adversarial trade/graduation drills and clear limits remain. Do not claim immunity from rugs, whales or losses. |
| M04 Social Escrow | Immutable routing to verified X/GitHub identities or wallet recipients; pooled handle earnings across launches; ownership sign-in, wallet binding, claim, renamed/lost-account recovery and post-graduation continuity; later social-platform adapters | Isolated social vault/proof service and split builder. Protected attestor/OAuth provisioning, identity/replay/recovery/claim drills, exact deployed fee lock and public claim UX remain. A supported handle string is not verified ownership. |
| M05 Bitcoin Runes | Actual Bitcoin etching plus a BNB trading representation; reserved/custom names, commit/reveal and collision fallback; live Bitcoin miner-fee quote; confirmations/finality; Bitcoin custody and two-way bridge; wallet/address support; amount/day limits, failed-release review, backing/supply split and proof table; identity/pair settings and creator, routed-recipient or holder fee modes | Separate integration/research workstream. BTCB pairing is not Rune issuance or custody backing. Bitcoin signer/custody/security model, indexer, supply/backing reconciliation, bridge adapters, name/fee/finality rules and real recovery drills are missing. Never imply a BTC-backed bridge from a UI or mock. |
| M06 Counter Protocol | Holder Reward, rotating payout basket, ecosystem Index and separate Crown Drop winner mode; pair asset distinct from payout assets; verified eligibility/snapshots, excluded wallets, thresholds, round progression, pending pots and unavailable routes; dedicated settlement accounting; creator/burn/gas allocations; claims before/after graduation; per-recipient receipts | Fixed stock-basket rewards and v2 prototypes are foundations only. A fixed 1–5-asset stock basket is not the reference's rotating 2–10-asset reward mode. Rotating settlement, ecosystem selection, winner rules, complete ledgers/routes and protected testnet lifecycle remain. Winner rewards require independent economic/legal review and must not also pay the same allocation to holders. |
| M07 3M Market Maker | Public dedicated treasury and 1–5 disclosed strategy wallets; legitimate inventory management, accumulation, dip/exit presets, laddering/average entry, trade spacing, slippage, stop/trailing exits, market-cap/exposure bounds, capital scaling, exit quotes and gas/treasury floors; migration pause/resume; standalone support for external launches; public trades/claims/transfers/settings | Pinned quote and LP-position readers, bounded swap vault and accounting components. No complete LP manager, multi-wallet strategy, signer binding, durable orchestration, full cost/inventory settlement or public route service. Disclose losses/conflicts; prevent self-trading, artificial-volume objectives and guaranteed price-floor claims. |
| M08 Omnichain | BNB-centered single checkout; verified payment; live multi-chain gas/conversion/messaging quote and expiry; separately accounted optional first buy; durable per-chain deploy/configure/peer/security/pool/fee-vault steps; LP custody; verified readiness barrier and asynchronous opening/recovery; resumable progress, refunds and replacements; bridge panel; per-chain addresses/data/fees/payouts and receipt-backed burns | Planner and isolated pinned testnet OFT exist; quotes/journal/vault/budget components are foundations. Full checkout/payment and deployment jobs, verified routes/security, venue/pool adapters, signer controls, fee/payout/refund ledgers and partial-chain/reorg/recovery drills remain. Solana and Robinhood are targets, not implemented support. |

## Project and platform ecosystem

Each row is part of the owner's feature-coverage goal. A partial foundation is
not a completed platform service. The IDs remain stable for future PR references.

| ID | Capability to deliver | Fortune evidence / acceptance boundary |
| --- | --- | --- |
| P01 | Wallet sign-in, concise conditional wizard, immutable mode/metadata/settings manifest and matching wallet review | Reuse current launch/draft/review flows; signed session challenges need nonce/expiry/replay protection. Unsupported combinations stay unavailable. |
| P02 | Project character canon: identity, look, voice, objective, backstory, identity prompt, hard limits and license | Build only from creator-saved facts/permissions; empty values remain empty. Public read access must not expose treasury authority. |
| P03 | Per-project read-only MCP: canon, market, treasury, research notebook and recent thoughts | Protocol initialization/discovery/calls, bounded arguments, consistent public data/provenance and injection tests. Existing REST APIs and a help-card selector are not an MCP server. No signing/transfer tools or secrets. |
| P04 | Developer quickstarts, live MCP playground and downloadable skills | Cover canon/model sheet, research scout, risk scorecard, app integration, music/video studio pipeline, lore, social voice and live dashboard. Access remains read-only; examples must run against supported Fortune data. |
| P05 | Stock-agent variant and GitHub project incubator | Opt-in eligible-asset path; repository scouting, maintainer identity and social-fee routing. No automatic launch/payout authority from repository text; securities/issuer eligibility remains separate. |
| P06 | Content Studio | Creator-approved posts, replies, images, briefs and campaigns grounded in project identity and verified current data; prompt-injection defenses, history and approval before publication. |
| P07 | Mind Live | Project avatar/voice, room chat, holder/whale badges and confirmed trade/burn callouts. Needs live-data pipeline, permissioned identity/media generation, moderation and operational proof; do not simulate a running service. |
| P08 | X-Ray / contract-and-claim intelligence | Contract/admin/proxy/blacklist controls, exact-address identity, website/docs/GitHub claims with citations; unproven ≠ false, missing red flags ≠ safe; conservative treatment of thin/new assets. No fabricated universal safety verdict. |
| P09 | Bundle analysis / Wallet Intelligence / Radar | Creator history, concentration, snapshot changes, new top holders and funding-cluster analysis, with exchange/bridge attribution limits. Existing Holder Shield is partial; durable full-history/reorg-aware data and uncertainty remain essential. |
| P10 | Trust score and verified reinvestment/burn badges | Published evidence/rules/version, eligible sources, unknown states and receipt-backed confirmed actions. Buyback allocation ≠ purchase ≠ burn, and a badge is not audit/insurance. |
| P11 | Dev Bonds | Independently specified collateral, lock/slash conditions, dispute/recovery, verified receipts and badge terms. No Fortune platform-token CA, collateral rate or insurance promise has been adopted. |
| P12 | Raid war room and Raid-to-Earn | Creator-approved pinned campaigns, independently checked clicks/work, anti-sybil/replay abuse controls, bounded payout liabilities and onchain receipts. No automatic social posting or payment merely from generated text. |
| P13 | Immortality / community takeover / Guardian | Community drafts and rally tools when a developer exits, with transparent identity/roles and moderation. A community claim cannot transfer contract ownership, custody or locked fee rights. |
| P14 | Discord launch wizard and tickets | Same reviewed engine/backend and creator-selected artwork; explicit costs, payment state and dev-buy delivery, durable receipt/ticket recovery, nonce-bound website claims. Use wallet review; no keys in tickets or chats. Bot account/payment model needs independent integration/security review. |
| P15 | Discord tracking, alerts, side-by-side comparisons and thesis reader; X report bot | Explicit account OAuth/permissions, real market data, source links, rate limits and confirmed/pending states; deploy/delivery/unsubscribe/incident drills. No platform access or message delivery assumed from code. |
| P16 | Sentinel Workshop / third-party rule packs | Reviewed compatible BNB rule modules, manifest, enforceability/royalty disclosure, submission/review process and allowlist. Never attach an unreviewed module; no retrofit of frozen Standard. |
| P17 | Vanity address generator, forge and address catalog | Design an EVM-compatible deterministic deployment/salt workflow with verifiable provenance and collision handling. Do not port Solana private-key imports, keypair sales or server key delivery. A new factory/address model needs separate review. |
| P18 | Arena / Oracle challenges | Append-only timestamped project research/predictions and published scoring against real observations; distinguish research from holdings and preserve corrections/history. No invented prices/performance or return guarantees. |
| P19 | Syndicate / agent-to-agent work | Scoped lore/art/research jobs, identity, result attribution, payment receipts, dispute/cancel controls and idempotent retry. Independent spending constraints; no arbitrary agent-to-agent treasury access. |
| P20 | Unified creator dashboard and project workspace | Overview, live charts/trades/supply, fees owed/paid, engine state, rules, treasuries, wallets, receipts, settings and alerts, before and after graduation. Existing token/creator pages are partial; scope freshness/coverage and authorization explicitly. |
| P21 | Community forum / announcements / chat | Verified project roles, identity challenges, moderation/reporting, quotas, wallet-switch isolation and draft approval; preserve existing product/community scope. |
| P22 | Discovery across supported external launches | Exact chain/address/venue adapters, named coverage, reliable search and source labels; support external-project workspaces without implying Fortune approval or launch ownership. |
| P23 | Public APIs, exports, keys, quotas, plans and integrations | Stable schemas, authentication where needed, bounded queries, provenance, privacy, durable quotas and real delivery evidence. Do not copy the reference's token-holding plan prices or assume a Fortune token exists. |
| P24 | User docs / FAQ / security and signer disclosures | Explain mode permanence, pair vs payout, eligibility, failed/missing payouts, graduation venues, bridge finality/backing, per-chain addresses/data and why a deployment is gated. Identify signer/custodian/admin powers per exact engine; never ask for seeds/private keys. |

## Omnichain and settlement detail that must not be lost

M08 includes all of the following, not only OFT deployment or arbitrage:

- A common review manifest, supported-chain/security allowlist, explicit global
  issuance cap and per-chain allocations; account for shared decimals, dust,
  in-flight transfers and permanent burns. Do not multiply global supply or FDV
  by chain count. Native pools, price units and liquidity custody need proof.
- Expiring network/conversion quotes, disclosed margin/refund policy and reserved
  creator/holder/payout/gas liabilities before launch capital can be spent.
  Confirm the actual checkout payment before any paid deployment work.
- Persist each step/configuration/transaction slot before execution; reconcile
  uncertain outcomes and replacement nonces before retry. Reconnect must neither
  charge twice nor duplicate a step. Serialize work for each funded signer.
- Peer/library/verifier/executor/authority checks on each supported route; delayed
  delivery, destination-gas, replay/spoof, partial deployment, opening and recovery
  drills. Expose asynchronous state rather than promising atomic global opening.
- User-signed bridging with source-native fee review and transfer tracking;
  per-chain addresses/pools/trades/holders, local and consistent aggregate data,
  fees collected/owed/paid, confirmed receipts and explicit missing-data reasons.
- Per-chain/asset payout ledgers, minimums, cost-aware batching/carry-forward,
  gas reserves and retry deduplication. Publish authority and fee policy before
  taking funds. Allocated burn budgets remain pending until real purchase/burn
  receipts confirm their separate operations.
- Price-gap strategy and optional strategy-token buybacks remain additive owner
  scope. They use distributable realized profit after full costs/loss carry,
  not creator/holder/liquidity liabilities, and never promise parity or profit.

M06 additionally needs exact per-round eligibility/account handling, exclusions,
asset selection/rotation, independently qualified ecosystem candidates excluding
the paying coin, ranking sources, minimum payable pot, carry-forward,
post-graduation fee collection and payout receipts. No recipient can receive
another allocation's funds. A round/winner timer does not guarantee immediate
payment, and unknown prices cannot establish eligibility.

## Adaptation and contradictions

Fortune implements the product use cases on BNB-compatible infrastructure while
preserving its approved architecture, economics and safety rules. This is not a
literal pump.fun, Meteora, Token-2022 or SOL deployment port.

- Competitor fee percentages, SOL budgets, thresholds, fixed supply, margins,
  payout cadence, chain security providers and addresses are comparisons, not
  Fortune defaults. Every Fortune engine needs its own explicit reviewed policy.
- The supplied Social Escrow block/economics table describes a recipient/platform
  split, while its later Social fees paragraph says all creator fees go to escrow
  with no cut. Do not silently choose one as Fortune's economics.
- The reference describes converting sell-side fees received in the launched
  token. Fortune's approved rule is different: launch-token-side fees only burn.
  Pair-asset holder rewards and earned platform recirculation remain distinct,
  non-overlapping allocations. Never sell fee tokens to fund either allocation.
- The reference's own text leaves a graduated Counter claim path unverified and
  lists some Discord engines, Solana-source bridges, omnichain Minds, broader
  pairs and deployment acceleration as coming next. Track these target features
  explicitly; do not call them independently proven competitor capabilities.
- A stock pair is not stock ownership/legal approval; a token balance threshold
  is not a paid-tier policy adopted by Fortune. A bond badge is not insurance.
- Claims of rug immunity, guaranteed floors, profit, complete attribution,
  instantaneous parity or uninterrupted operation are not Fortune acceptance
  criteria. Price-gap reduction is conditional on executable quotes and risks.

## Delivery discipline

The near-term queue must include product-facing breadth as well as infrastructure:
project identity/canon and read-only MCP; creator drafts/approval and unified
workspace; evidence-backed intelligence/alerts/community; completion of protected,
social and reward lifecycles; standalone/managed strategy; full omnichain checkout,
transport and per-chain accounting; and Bitcoin issuance/bridge integration.
Dev tools, media/live experiences, Discord, Workshop, vanity addresses, Arena and
Syndicate remain tracked deliverables rather than disappearing behind core work.

Deliver independent or explicitly stacked executable slices with tests and real
integration evidence where available; keep unsafe/unverified financial engines
unavailable. This new owner reference justifies updating coverage documentation,
not repeatedly producing roadmap-only PRs afterward. A feature is not complete
from a stub, mock, planner, menu or screenshot. Track exact scope, signer/custody,
source/version, relevant invariants, lifecycle/failure tests, retained testnet
receipts, operational prerequisites and review gates. Apply those gates separately
for each engine. None of this establishes deployment, audit or mainnet approval.
