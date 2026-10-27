# Fortune: the home base for BNB Chain launches

Proposal for review, 2026-10-27. This document defines product direction and implementation slices; it does not activate a feature, approve a contract, or change release gates.

## Product direction

**Launch, trade, manage, and grow a token on BNB Chain from one place.**

Fortune should serve creators before launch, traders during discovery, and communities after graduation. A token launched elsewhere should still have a useful Fortune page. Start with named, supported venues and expand coverage explicitly; “all BNB launches” is the destination, not a present coverage claim.

Keep the approved white/red/gold lucky-cat identity, `fortunepad.fun`, and [@fortunepad](https://x.com/fortunepad). Retain a short default launch flow. Put advanced features inside the relevant project workspace rather than adding a top-level destination for every engine.

## Reference and evidence

[MEME OS docs](https://memeos.world/docs), read 2026-10-27, describe an integrated lifecycle with creator assistance, autonomous agents, launch rules, social fee routing, holder distributions, market making, and cross-chain launches. Its documented chain coverage already includes BNB. The useful reference is the shared workspace and execution receipts. Some services use operator-controlled wallets; a post-graduation rewards path is explicitly not verified end to end. Treat the docs as product claims, not independent audit evidence. Fortune should adapt the workflow without inheriting custody assumptions or fee percentages.

Brew remains the direct BNB competitor; LESGO remains the simple-launch and pair-asset-reward reference. This proposal supplements [PRODUCT.md](PRODUCT.md) and [BREW_REVIEW.md](BREW_REVIEW.md).

Repository baseline inspected: main `ade8c69fd92bd5d3cb5303314fe180c944e7b4eb`, [release handoff](RELEASE_HANDOFF.md), product/competitor documents, route implementations, open PRs, and recent CI. Open PR #54 owns launch-rules v2; #59 owns Brew reconciliation; #60 owns the README domain correction. This proposal adds a separate document and does not duplicate those changes.

## Where Fortune starts

| Area | Inspected implementation | Product gap |
| --- | --- | --- |
| Launch and trade | Standard testnet launch, curve trading, verified graduated Pancake V3 trading, retry and rescue paths | Integrate the lifecycle; mainnet still requires release evidence |
| Discovery | Explore, markets, pair catalog, creator pages, portfolios, local watchlists | Broader venue coverage, durable history and dependable search |
| Holder intelligence | Creator history/outflows and an exact holder-index implementation | Production storage, full-history provider, scheduling and reconciliation drills |
| Advanced launches | Isolated custom-pair/social-fee/basic-rule and stock-reward implementations; expanded rules in #54 | Separate testnet deployment, configuration, operational verification and audits |
| Creator operations | Existing launch, claims and creator surfaces | One workspace linking actionable tasks, receipts and configuration state |
| Community, analytics, automation | Forum explicitly unavailable; analytics exports; automation page describes protocol behavior | Real community services, indexed analytics and an execution ledger |
| Developer tools | Public versioned APIs, launch preview and transaction lookup | Consistent data provenance, integrations and optional read-only agent access |

These are source-level observations, not proof that every deployment dependency is configured. [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) and live readiness checks control availability.

## Launch catalog: the core product

Breadth of token launch models is a core product requirement. A dashboard supports that goal. The nine proposed entries below define Fortune's own catalog; they are proposals with different implementation states, not nine currently available engines.

| Proposed Fortune preset | Creator intent | Existing foundation and remaining work |
| --- | --- | --- |
| Standard | Launch a straightforward BNB-paired token | Existing Standard testnet flow; frozen mainnet candidate keeps its existing gates |
| Custom Pair | Price a token against an approved BSC asset | Isolated custom-pairs beta; deployment, compatibility, registry and asset-policy gates remain |
| Burn + Rewards | Burn token-side fees and distribute a distinct pair-asset allocation to holders | Isolated v2 prototype; hook, factory, indexer, lifecycle accounting and audit work remain |
| Basket Rewards | Pay holders in a chosen set of approved reward assets | Isolated stock-rewards foundation; do not imply arbitrary baskets, multi-pair liquidity or general asset support are implemented |
| Protected Launch | Set disclosed launch-period trading restrictions | Basic custom-pair rules foundation and expanded rules in #54; preserve expiry and disclose enforceability/limits |
| Social Fees | Route creator fees to verified social recipients or wallet splits | Isolated social-fee implementation; verification, recovery, claim and operational drills remain |
| AI Assisted | Run the project personally with an assistant for analysis and drafts | Proposed application layer; supported financial actions still require user review and signature |
| Autonomous Agent | Give the project a constrained operational agent and explicit treasury policy | New engine/runtime and permission design; no inherited approval from AI Assisted or Standard |
| Managed Liquidity | Operate an explicitly funded, bounded liquidity strategy | New financial engine with separate economics, execution, conflict and audit requirements; no artificial-volume objective |

These are proposed user-facing presets, not nine mandatory factories. Separate the choices into:

- **Launch mechanics:** compatible engine/version, curve or pool, pair asset, graduation and lifecycle.
- **Economic policy:** creator/social allocations, burn behavior and holder rewards.
- **Operating mode:** creator-operated, AI-assisted or constrained autonomous execution.

A preset is a reviewed combination of these choices. Start with an explicit compatibility allowlist. Do not show every combination as available merely because its components exist. For example, social routing in the custom-pairs beta does not establish a social-fee Standard deployment, and stock rewards do not establish Burn + Rewards compatibility.

The launch screen should begin with “What kind of token do you want to launch?” Each card explains its purpose, pair/reward assets, fees, signer model, restrictions, graduation behavior and availability. Selection leads to the relevant short form and a common review manifest. Unavailable presets explain the missing capability without offering an executable launch button.

The manifest identifies chain, exact contract/version, fixed settings and changeable settings, recipients, all authorities, fee bases, allocation destinations and post-graduation behavior. The wallet review must match the executable configuration. UI labels never stand in for onchain checks.

**Reference coverage:** Fortune's agent, AI-assisted, protected, social, rewards and managed-liquidity proposals address the corresponding product use cases. Bitcoin Runes would require real Bitcoin issuance/custody/bridging; a BTCB pair is not a Rune. Omnichain issuance requires cross-chain supply, messaging and recovery controls; BNB-first discovery is not that feature. Retain both as separate future research options, outside the first BNB release. Do not invent a superficial equivalent to fill a launch card.

## Five connected surfaces

1. **Discover.** New launches, graduation progress, verified pools, watchlists, creator history and address search. External venues get explicit source labels and coverage. Rankings distinguish organic activity from known automated activity; paid placement is labeled.
2. **Launch.** Name, ticker, artwork, description, eligible pair, optional first buy, review and wallet signature. Advanced engines explain fees, holder eligibility, authorities and graduation behavior before selection. Unsupported configurations remain unavailable.
3. **Token workspace.** A permanent home for trading, holder/creator facts, rules, fee and reward receipts, announcements, and lifecycle status. The same identity follows graduation. Missing history is labeled; it is never a zero-value success metric.
4. **Creator Studio.** A wallet's projects, launch drafts, fees owed/paid, community drafts, operational alerts and next actions. Show only actions the connected wallet can perform. External projects can verify control for editing their offchain profile without implying authority over their contracts.
5. **Developers.** Stable public APIs, indexed events, integration guides and eventually signed webhooks and a read-only MCP interface. Public data access never grants spending or signing authority.

## Delivery sequence and acceptance

### 1. Establish the launch catalog and unify existing capabilities

First implementation PR: a capability-driven launch selector that routes available presets into their existing flows, with explicit unavailable states for proposed engines and a shared configuration/review model. Preserve the current Standard path and keep all advanced configuration behind its existing gates. Follow with Creator Studio and shared project status over the existing creator, market, readiness and transaction APIs.

Use a typed capability description: engine/version, chain, deployment address when configured, release state, required dependencies, signer/authority model and evidence links. Suggested states are testnet available, unconfigured beta, under review, and planned. Mainnet availability must come from authoritative release/configuration checks. The presentation layer cannot override server or contract gates.

Acceptance:
- Every launch card maps to an exact supported configuration and lifecycle; unsupported combinations cannot reach a transaction request.
- The Standard flow remains reachable without enabling a new engine or changing its contracts.
- A creator can find a known testnet launch and reach its current trading and lifecycle actions from one workspace.
- Disconnected, wrong-chain, empty, partial-history and unavailable-provider states are explicit.
- Switching wallet/project cannot display or act on stale authorization or quotes.
- No estimated claim is presented as a settled payout; every confirmed action has its transaction receipt.
- Existing frontend identity and Standard contract/fingerprint remain unchanged; relevant web tests and the production build pass.

### 2. Make discovery and history dependable

Build a durable, reorg-aware index for launches, migrations, trades, fee events and transfers. Store chain ID, contract, block number/hash, event identity, finality and coverage. Backfill with checkpoints, idempotent writes and reconciliation against chain state. Monitor lag, holes, failed jobs and provider disagreement. Reuse the holder-index work rather than building a second competing balance source.

Add one external-venue adapter at a time, initially read-only. Verify factories and pools by address and chain; never merge tokens by ticker. External discovery does not confer Fortune approval, rewards eligibility, or trade support. Enable transactions only after the adapter's pool identity, token behavior, quotes and receipt handling are tested.

Acceptance: deterministic replay, duplicate-event and reorg tests; visible coverage/freshness; bounded API requests; no fabricated volume; failed backfills show degraded data. Publish the exact supported venues and history range.

### 3. Activate advanced engines independently

Continue custom pairs, social fees and launch rules in their existing workstreams. Review #54 before starting another rules implementation. Validate stock rewards separately from Burn + Rewards v2. Each engine needs its own contract scope, testnet drills, accounting tests, audit evidence, operational dependencies and release decision.

Acceptance: launch → trade → graduation → fee collection → claim/reward where applicable is demonstrated for that exact engine and deployment. A passing Standard test or another engine's audit cannot satisfy this gate. Asset compatibility and legal eligibility are separate decisions.

### 4. Add creator assistance and community

Start an assistant that explains project state with source links, prepares launch/profile copy, drafts announcements, and proposes supported actions. It may produce a transaction preview; the user reviews chain, target, asset, amount, approvals and minimum output and signs in their own wallet. Revalidate immediately before signing. Never request private keys.

Add opt-in alerts and creator announcements before a general forum. Require signed identity challenges with expiry/replay protection, role checks, moderation/reporting, rate limits and clear project impersonation handling. Chat integrations should open a Fortune review screen rather than accept deposits or wallet keys.

Acceptance: untrusted metadata or community text cannot issue assistant commands; drafts do not publish themselves; retries cannot duplicate submissions; alerts distinguish pending from confirmed events and let users unsubscribe.

### 5. Consider constrained automation after the core is proven

Separate operational jobs (indexing, alerts and receipt reconciliation) from financial execution. Any future spending agent requires a distinct approved design with narrow onchain permissions, asset/target allowlists, enforced budgets, revocation, monitoring and public execution history. Model prompts are not spending controls.

Legitimate liquidity management requires separate economic and conflict-of-interest review. Do not introduce self-trading, artificial-volume targets or guaranteed price-floor claims. Cross-chain issuance and bridges are outside the first BNB home-base release.

## Accounting and release invariants

- The frozen Standard mainnet candidate remains unchanged and WBNB-only. This roadmap does not add rewards to Standard.
- Where a future fee engine collects launch-token-side fees, those tokens can only be burned. They cannot fund swaps, payouts, maker inventory or protocol revenue.
- Pair-asset holder rewards are a separately accounted allocation with explicit liabilities and eligibility. Platform revenue recirculation can spend only earned protocol allocations, never launch liquidity or holder liabilities. An amount cannot appear in both allocations.
- Keep received, allocated, owed, attempted and settled amounts distinct. Retries must reconcile receipts before sending again. Buyback/burn is not a holder payout.
- Do not adopt another project's percentages or assume a Fortune platform token exists. No official Fortune CA is established by this proposal.
- Preserve fail-closed audit, legal/asset, governance, funding and production-readiness gates. Existing contracts keep their existing authorities; any new authority model needs its own review.

## Decisions and evidence needed from owners

The proposed first slice requires no new mainnet signing or funding. Production expansion does require owners to provision the chosen data store, full-history BSC provider, job runner and upload service through secret management; an RPC URL alone does not prove complete history. Operational owners must supply backfill/reconciliation and alert-delivery evidence.

For each mainnet engine, attach independent audit and remediation evidence, legal/asset decisions, approved governance/signers, a funded execution plan and the required release signatures. Never substitute placeholders for those artifacts. Use the existing handoff and release manifest as the source of exact gate requirements.

Track outcomes after instrumentation exists: successful creator completion, post-launch return usage, graduation success, indexing lag/coverage, and settled-versus-owed accounting. These measure whether Fortune is becoming a useful home base without using speculative token valuations as product evidence.
