# Fortune platform revenue recirculation

Status: proposed architecture, not implemented or enabled. Updated 2026-09-25 from the owner's LESGO / GO reference. This does not change the frozen Standard candidate, establish a Fortune token address or approve any revenue split.

## Product intent

Fortune's longer-term product has three distinct functions: launch tokens against reviewed BNB assets; pay eligible Burn + Rewards holders in the pair asset; optionally use an explicit share of earned protocol revenue to buy and burn an official Fortune token.

[LESGO's official docs](https://www.lesgo.fun/docs) describe GO as a Standard token and allocate 60% of platform revenue to GO buybacks/burns. Their pair-asset holder payouts belong to Burn + Rewards launches. This is a mechanism reference, not proof of sustainable revenue, token value, or Fortune's own economics. Do not infer GO-holder distributions from launch-holder rewards.

## Separate the money before routing it

| Source / bucket | Permitted destination in the proposed design | Accounting boundary |
| --- | --- | --- |
| Launch-token fee inventory | Irreversible burn of that launch token | No sale, treasury withdrawal or arbitrary swap path |
| Pair-asset holder allocation | That launch's holder accumulator | Remains a claim liability until paid; unavailable to platform buybacks |
| Pair-asset creator allocation | Immutable configured creator recipient, if applicable | Never counted as protocol revenue unless a separately valid immutable policy assigns it there |
| Earned pair-asset protocol allocation | Explicit protocol operating and recirculation allocations | The only default funding source for a platform-token buyback |
| Launch liquidity / reserves | The launch's curve or locked pool | Never treated as fee revenue or buyback capital |

For each pair asset, recognized fees must reconcile to creator allocation + holder allocation + protocol allocation + explicitly recorded rounding remainder. Protocol allocation must then reconcile to operating allocation + recirculation allocation. Keep amounts in native asset units; converting a dashboard to USD cannot move or create funds.

An illustrative 60% policy would mean 60% of the **protocol allocation**, not 60% of all volume, all pool fees, holder rewards or reserves. Fortune's rate remains undecided until operating costs, liquidity, simulations and legal review support a policy. Existing Standard fee rates and destinations remain unchanged.

If an official Fortune token is ever itself used as a pair asset, its protocol recirculation allocation requires an explicit burn-directly policy. A generic router must not sell it to create another buyback. Holder and creator liabilities in that asset remain separately accounted for.

## Execution and custody requirements

- Verify the official Fortune token through canonical factory/deployment evidence; a name, ticker or vanity suffix is insufficient.
- Keep each launch's holder funding isolated from platform recirculation. Governance, keepers and the router must have no path to spend holder liabilities or locked liquidity.
- Use bounded, allowlisted routes with exact input limits, minimum output, deadlines, price/depth checks and restricted approvals. Reject rebasing or fee-on-transfer routes unless independently proven compatible.
- Failed swaps retain their original asset in the correct bucket. Retries must not double-spend or relabel funds as burned. No trade is required when costs exceed the configured budget or liquidity is inadequate.
- Acquired platform tokens may only be irreversibly burned. Define whether the actual token reduces total supply or only makes balances permanently unspendable, and report those measures separately.
- Specify whether routing contracts are immutable and exactly which policy changes, if any, governance can make. Publish that authority; do not advertise a discretionary treasury as an immutable mechanism.

## Evidence before a public claim

Every fee credit, allocation, swap and burn needs a reproducible event record identifying chain, block/hash, transaction/log index, source launch, input/output assets and native-unit amounts. Required ledger views are protocol revenue earned, holder liabilities, operating allocation, recirculation pending, buyback spend, acquired tokens and irreversible burns. Avoid adding mixed assets without an identified price source and timestamp.

Volume and revenue are different measurements. Exclude self-referential ledger entries and duplicate logs; do not count a fee harvest as a new trade. Price and market capitalization are not guarantees or acceptance tests for the mechanism.

Before enabling this feature: implement an isolated vault/router integration, test conservation and adversarial routes, rehearse real BSC fork swaps and recovery, reconcile the indexer against actual balances, obtain independent audit/legal review, and complete a separate release gate. This feature must not inherit Standard or Burn + Rewards v2 approval automatically.

Until that evidence exists, public copy should say “platform revenue recirculation under evaluation.” No automatic buyback, payout, burn counter, official token CA or return claim is implied.
