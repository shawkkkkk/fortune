# Brew / LESGO comparison and Fortune release decisions

Updated 2026-09-25 after the owner identified Brew as Fortune's direct BNB competitor and supplied its full docs. LESGO remains the primary reference for the simple launch flow and pair-asset reward model.

Sources: [Brew docs](https://brew.family/docs/) (owner-supplied text on this date; the public text crawler returned only the JavaScript shell) and [LESGO docs](https://www.lesgo.fun/docs) (retrieved on this date). Competitor descriptions below are documented behavior, not an independent audit or verification of deployed contracts. Competitor addresses are not Fortune deployment configuration.

## The distinction that matters

Brew describes holder rewards as using the creator's pair-asset fees to buy and burn the launched token. Holders receive no direct wallet payment under that route. Sending tokens to a burn address leaves Brew's reported total supply unchanged.

LESGO documents pair-asset payouts, a burn-only token-fee route, and a curve-to-locked-pool lifecycle. Its reward payouts rely on scheduled offchain processing. Fortune follows the short identity / type / pair / review interface, while v2 targets onchain reward accounting and a direct claim fallback. Solana settlement is not portable to BSC.

Fortune must keep three concepts separate in code, ledgers and copy:

- **Burn:** launch-token fees are irreversibly burned; never sold to fund rewards.
- **Holder rewards:** eligible holders accrue a claim in the actual pair asset.
- **Buyback and burn:** a separately specified use of pair assets to purchase and burn tokens. It is not a holder payout and is not silently substituted for one.

None of this makes Burn + Rewards v2 live. The current v2 token/accounting prototype has no integrated Infinity hook or market deployment.

## Direct pool versus graduation

Brew's direct V3 pool removes the curve-to-DEX migration operation. That is a real lifecycle simplification; describing Fortune as better does not remove the extra failure modes in its curve design. A direct pool still needs correctly initialized pricing, usable liquidity and secure custody from the first trade.

Fortune retains the owner's LESGO-style curve direction and the frozen Standard candidate. Graduation must demonstrate full-plan preflight, atomic execution, price continuity, permanent LP custody, permissionless retry and the seven-day reserve-rescue path. The UI must distinguish curve trading, graduation readiness, failed graduation and a verified live destination. A pool address alone does not prove a usable market.

An immediate-pool launch engine could be evaluated separately if there is a demonstrated product need; it is not a last-minute change to this release or an already supported mode. It would need its own pricing model, router path, fee custody, tests and audit scope.

Permanent LP locking prevents withdrawal through that locked position. It does not prevent every loss or scam: paired-asset controls, concentrated ownership, contract defects and trading conditions remain relevant. Fortune must not advertise “rug-proof,” guaranteed fairness, or universal superiority based only on a locker. LP fee collection and liquidity withdrawal are distinct powers and should be disclosed separately.

## Comparison with the current Fortune release

| Product behavior | Brew's supplied docs | Fortune today / release boundary |
| --- | --- | --- |
| Token creation | Identity, artwork, links, pair, fee recipient, optional first purchase | Simple Standard testnet flow exists; optional fields are in Advanced. Upload hosting is still missing; public image URLs/IPFS work. |
| Market lifecycle | Launch directly into Pancake V3 | Standard uses a curve, then Pancake V3 graduation and permanent LP custody. The candidate is frozen but not independently audited or approved for mainnet. |
| Pair selection | BNB, USDT, compatible address lookup | Registry-backed discovery and capability checks exist. First mainnet scope is WBNB only. A pasted address does not authorize custody. |
| Trading | Pair asset or BNB through an available route; quotes refreshed around approval | Curve trading exists. General BNB routing for arbitrary pairs and a complete post-graduation swap experience still need implementation and verification. |
| Holder economics | Optional creator-fee buyback/burn; no direct payout | Standard has no holder rewards. Direct pair-asset claims are an isolated v2 prototype, not a released feature. |
| Multiple pools | Two-pool V1; two-to-five pool V2 completed across transactions | Multi-reserve curves/graduation are research capabilities. First mainnet release permits one pair; no multipair parity claim. |
| Public data | Token pages, charts, trades, holders, analytics, explorer links | Token/profile pages and bounded onchain history exist. Full trade/holder ledgers, durable event indexing and complete analytics remain gaps. Unknown totals stay unavailable. |
| Fee claims | Pair-asset creator claims and permanent redirection option | Fee recipients and immutable destinations require disclosure for the exact deployed generation. Legacy tax or Fee Matrix research must not be presented as v2. |
| Contracts and trust | Published factory/locker/distributor addresses and risk terms | Public status/API expose Fortune's configured deployment and failed mainnet gates. No official mainnet CA has been published by this release. |

## Implementation order and acceptance criteria

### 1. Complete the safe Standard release

- Retain name → ticker → image → type → pair → optional first buy → review → launch; advanced economics stay collapsed.
- Show verified pair address, live fees, Launch Shield impact, minimum output and immutable metadata terms before signing.
- Confirm account, chain and current quote around approval; simulate; preserve submitted hashes and resolve uncertain outcomes before permitting a retry.
- Complete persistent metadata uploads with file limits, content checks and a retrievable immutable URI before launching a token.
- Implement event ingestion from the actual deployment block. Checkpoint block hashes, rewind on reorg, deduplicate logs, and reconcile indexed balances/fees against contract reads. Demonstrate restart and provider failover.
- Display trade, holder, fee and graduation data only when the corresponding ledger supports the claim. Expose last indexed block and degraded state.

The first three points have substantial testnet implementation and regression evidence. They do not substitute for the remaining release gates in `mainnet-release.json`.

### 2. Prove the v2 distinction independently

- Pin official Infinity interfaces and deploy an isolated hook/graduation test stack.
- Test both token orderings, buy/sell directions, exact input/output, rounding, price limits and adversarial callbacks on a live BSC fork.
- Prove launch-token fee inventory has only a burn path, with no arbitrary transfer, swap or privileged recovery route.
- Reconcile pair-asset funding, claims and remaining liabilities. Prevent a new holder from claiming past earnings; preserve earned balances through transfers and burns.
- Specify zero-eligible-holder routing, rounding remainder and immutable excluded addresses before integration. A keeper outage must not prevent a direct holder claim.
- Decide and document same-block/flash-loan reward eligibility; entitlement corrections alone do not prove resistance to temporary balance inflation.
- Independently audit the hook, token, accumulator, graduation and immutable configuration as one v2 scope before enabling it.

### 3. Expand pair and trading capabilities

- Add reviewed stablecoins and BNB majors individually, with oracle, transfer behavior and graduation-depth evidence.
- Add routed BNB payments only when the complete route is simulated, every extra fee is disclosed, quote deadlines/minimum output are enforced, and allowance/route changes cannot be hidden between signatures.
- Add eligible RWA wrappers and arbitrary BEP-20 discovery with exact-address checks and clear rejection reasons. An issuer's token name is not evidence of legitimacy or legal eligibility.
- Rehearse multipair gas bounds, complete-plan atomicity, price continuity and stuck-graduation recovery separately. Do not widen the frozen single-pair release to match a competitor's checklist.

## Public copy rules

Say “pair-asset rewards in development” until v2 is independently proven. Scope “no dumping” to Fortune's fee-processing invariant; it cannot mean that holders cannot sell or prices cannot fall. Explain whether a burn reduces total supply or only removes spendable supply, using the actual token implementation.

Brew's citizenship self-declaration is not Fortune's legal approval. Fortune's own eligibility and operating policy must come from its legal review. Do not copy restrictions or imply a checkbox satisfies that release gate.

The goal is a simpler interface with verifiable functionality and recovery. Adding categories or buttons does not establish feature parity.
