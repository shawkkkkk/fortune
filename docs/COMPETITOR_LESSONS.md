# Competitive protocol lessons: LESGO, Sender, Pons and Brew

This document records architecture lessons used to shape Fortune. It is not a claim of affiliation with any other product.

**Release boundary (2026-09-25):** descriptions of multi-reserve curves, Fee Matrix destinations, Stock Floor, automations and broad asset support below describe research architecture or targets. The frozen Standard mainnet candidate is single-pair/WBNB-only and remains blocked. Burn + Rewards v2 is an isolated prototype. See [the current Brew comparison](BREW_REVIEW.md) for implemented features, gaps and acceptance criteria; architectural discussion must not be quoted as a live-feature claim.

## Primary reference: LESGO

[LESGO's docs](https://www.lesgo.fun/docs) make the product legible: a small identity/type/pair/review launch form, an explicit curve-to-locked-pool path, pair-asset rewards, public burns/payouts and a plain list of operator trust assumptions. Fortune adopts that interface order and disclosure style on BNB Chain. It does not copy Solana Token-2022, Raydium or Meteora settlement. LESGO's rewards use scheduled offchain snapshots/payouts; Fortune v2 instead researches onchain corrections with a direct claim fallback. That is a different trust and gas tradeoff and still needs proof.

## Secondary reference: Sender

[Sender's docs](https://sender.family/docs) show how to state fixed fee destinations, owner powers, compatibility-tested custom assets and creator opening purchases. Its holder route pays in the paired asset and offers direct claims. Its Ethereum Uniswap v4 pool starts trading without a separate curve or migration, while Fortune's frozen Standard candidate graduates from a curve to Pancake V3. Sender's disclosures are a useful model for distinguishing tested properties from audits and commercial promises. Fortune's v2 Infinity hook remains research; it must prove both swap directions and token-side burn-only routing before activation.

## Why compare generations, not feature lists

Pons v1, Pons v2 and Brew make materially different choices about when
liquidity exists.

- Pons v1 launches directly into a pool and keeps trading in that same pool.
- Brew launches directly into PancakeSwap V3 pools.
- Pons v2 moved launches onto a bonding curve first and creates the AMM pool
  only at graduation.

That evolution is useful because it exposes the tradeoff Fortune needs to solve:
a direct pool has a simple lifecycle, but its initial liquidity/price is exposed
immediately; a curve provides a controlled launch phase, but graduation must be
engineered so it never strands funds or produces a broken chart.

Fortune therefore keeps the **curve-first** model while importing the best
reliability properties of direct-pool launchpads.

## Lessons from Pons v1

### Keep

**Non-custodial transactions.** Users sign every launch and trade locally.

**Permanent liquidity locking.** A creator should not have a withdrawal path
to graduation liquidity.

**Self-describing launches.** Integrators should be able to establish that a
token came from the canonical factory without trusting the Fortune website.

**Onchain source of truth.** Indexers are accelerators, not authorities.

**Simple explicit trading concepts.** Price, slippage, liquidity and launch
state should be separately inspectable.

### Do not copy

**Creator-only opening access.** Pons v1 gave the creator's initial buy special
opening-block treatment. Fortune Launch Shield has no creator/private-wallet
exemption.

**Single-pair-only architecture.** Fortune supports one canonical curve across
1–5 approved reserve assets and can graduate into 1–5 markets.

**Pool-at-birth as the only launch model.** Fortune uses a curve so initial
market formation is deterministic and does not depend on a thin newborn AMM.

## Lessons from Pons v2

Pons v2's biggest architectural change was moving from a pool-at-birth design
to a curve-first launch.

### Partial final fills

A final buyer should never fail merely because another transaction left a tiny
amount before graduation.

Fortune now exposes `previewBuy()` and clamps the final buy to the remaining
graduation target. The buyer is charged only for the portion used and receives
the rest of the quote asset back in the same transaction.

This is especially important for multi-asset Fortune curves because several
different quote assets can race toward one shared target.

### Explicit phases

Do not infer market state from balances.

FortuneCurve exposes:

1. `CurveActive`
2. `GraduationReady`
3. `PoolCreated`
4. `Rescued`

The web app/indexer should route and label the market from authoritative state,
not from whether a pool address happens to exist.

### Graduation preflight + rescue

Fortune goes beyond "try to make a pool."

Before reserves move, the approved graduation adapter validates the entire
graduation snapshot. Execution is atomic. If any of the configured 1–5 pools
fails inside the transaction, all transfers and pool operations roll back.

If graduation remains impossible for seven days, anyone can activate a
permissionless rescue. Circulating curve tokens then become a pro-rata claim on
the quote reserves still held by the curve. This avoids indefinite limbo while
preventing an operator from interfering with a normal graduation immediately.

### Approved custom pairs

A token merely existing on BSC is not enough. Quote, reward and graduation
capabilities remain separate Fortune Registry grants.

Fortune additionally pins the decimals observed when an asset is registered.
If a token later reports different decimals, security-critical USD accounting
reverts instead of silently changing launch economics.

### Anti-sniper design

Fortune keeps the useful part of a fast-decaying opening tax but removes the
privileged exemption model.

Current Fortune Launch Shield:
- 99% buy tax at launch;
- rapidly decays to 0 after 5 seconds;
- buy-only;
- 2% cumulative early-wallet cap for 15 seconds;
- no creator or team-wallet exemption;
- shield proceeds route to liquidity reinforcement.

### Deterministic addresses

Fortune uses CREATE2 for every launch token and mines the salt until its address
ends in `0xfe`. The suffix is branding, while canonical factory provenance is
the actual verification signal.

## Lessons from Brew on BNB Chain

Brew is particularly relevant because it shares Fortune's target chain and
PancakeSwap destination.

### Use PancakeSwap-native infrastructure

Fortune should integrate against the official BNB Chain PancakeSwap deployment
rather than hide venue assumptions behind a generic DEX abstraction.

The production adapter still stays behind a narrow interface so a bad or
outdated venue integration cannot contaminate the curve contract.

### Any BSC token needs compatibility gates

Brew correctly distinguishes "paste any BSC address" from "actually compatible
with a launch pool."

Fortune makes this more explicit with:
- exact canonical contract address;
- decimals pinning;
- quote capability;
- reward capability;
- graduation capability;
- oracle freshness;
- transfer-behavior compatibility;
- provider/issuer status for stock tokens;
- runtime graduation preflight.

Native rebasing stock tokens should not be inserted directly into an AMM when
their provider supplies a non-rebasing DeFi wrapper.

### Multi-pool completion must not be ambiguous

Brew's multi-pair architecture can record plans for 2–5 pools with incremental
completion across transactions.

Fortune takes a stricter market-integrity stance: a configured graduation is one
plan. Funds remain on the curve until the adapter preflights the complete plan,
and the adapter call is atomic. A successful Fortune graduation means the
configured graduation operation completed; a failure leaves the curve
retryable instead of reporting a partially live launch as fully graduated.

If gas limits ever force a staged production implementation, Fortune should
pre-create/validate inert pool destinations first and must not mark the launch
`PoolCreated` or `TradingLive` until the entire required set has passed
liquidity verification.

### Holder rewards should be real rewards, not merely a label

Brew's documented holder-reward route uses creator fees for buyback-and-burn.

Fortune keeps **Holder Rewards** and **Buyback & Burn** as distinct Fee Matrix
destinations. A launch can explicitly pay claimable holder rewards in an
approved asset, route funds to buybacks, or split between them.

### Chart/indexing degradation is a product failure

Brew warns that charts/analytics can be delayed or incomplete. Fortune assumes
this will happen and designs around it:
- chain state remains authoritative;
- public reads are CDN cached;
- optional providers can fail without killing trading;
- graduation emits a canonical price anchor;
- token pages expose explicit indexing/pool-health state;
- transaction recovery checks BSC RPC before any retry.

## Fortune's resulting launch path

```
Create
  -> Fortune token (fixed supply, canonical factory, 0xfe)
  -> CurveActive
  -> Launch Shield opening window
  -> 1-5 approved quote assets feed one canonical curve
  -> partial-fill/refund on the final buy
  -> GraduationReady + immutable price anchor
  -> full graduation-plan preflight
  -> atomic PancakeSwap graduation
       -> success: PoolCreated / verify liquidity / index / TradingLive
       -> failure: reserves remain on curve / retry
       -> still impossible after 7 days: permissionless Rescue
```

The product should never collapse all of these into a generic "launched" badge.

## Release principle

A feature seen on a competitor is not automatically a Fortune feature.

Fortune should adopt it only when it improves one of:
- launch fairness;
- pool reliability;
- price/chart correctness;
- non-custodial safety;
- recoverability;
- API/indexer determinism;
- BNB-native asset breadth;
- transparent creator/holder economics.

The intended differentiators are simple creation, direct pair-asset holder claims,
burn-only launch-token fee handling, compatibility-checked BNB assets and
recoverable graduation. Each must be proven within its own release scope.
Multi-reserve curves, multi-market graduation and stock-focused features remain
separate expansion work; their presence in a design document is not readiness evidence.
