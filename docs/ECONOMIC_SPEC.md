# Fortune Curve Economic Specification

This document describes the current standard Fortune Basket Curve for independent mainnet review. It is descriptive, not a claim that the parameter space is safe for real funds.

## Units

All launch-token amounts use 18 decimals.

Oracle-normalized value is represented as USD with 18 decimals.

For a launch:

- `P0` = `basePriceUsd1e18`;
- `k` = `slopeUsd1e18`;
- `x` = cumulative launch tokens sold, in 18-decimal token units;
- `G` = `graduationUsd1e18`.

The marginal price is:

```
P(x) = P0 + k * x / 1e18
```

All accepted quote assets share the same global `tokensSold`, so there is one canonical curve rather than a separate curve per reserve.

## Buy integral

For net normalized USD input `C`, Fortune solves the linear-curve integral rather than pricing the entire trade at the pre-trade spot price.

With current marginal price `P(x0)`:

```
P(x1)^2 = P(x0)^2 + 2 * k * C
```

and:

```
tokensOut = (P(x1) - P(x0)) * 1e18 / k
```

For `k = 0`, the curve is constant-price:

```
tokensOut = C * 1e18 / P0
```

Solidity integer square root and `mulDiv` rounding are part of the executable specification.

## Sell integral

Selling `Δx` tokens integrates the same linear curve in reverse.

```
usdGross = (P(x0) + P(x0 - Δx)) * Δx / (2 * 1e18)
```

The requested quote asset must be an accepted reserve and have enough protocol-accounted depth for the gross payout.

Protocol fee and any launch tax are deducted from the gross quote output.

## Reserve accounting

The generic Fortune curve supports multiple quote assets on research/testnet deployments. **Mainnet v1 does not:** on BSC chain ID 56 the factory rejects any launch whose quote-asset count is not exactly one. The initial production registry is separately constrained to one WBNB entry.

For generic deployments, each quote asset is normalized with the oracle configuration snapshotted by the curve at launch.

Important properties:

- one global `tokensSold`;
- per-asset protocol-accounted reserves;
- unsolicited token transfers do not increase accounted reserves or graduation progress;
- sells may select another accepted reserve if it has enough depth;
- a stale snapshotted oracle causes affected valuation/trading paths to fail closed.

Cross-reserve arbitrage is therefore dormant in mainnet v1. Re-enabling multi-reserve mainnet launches requires a separately reviewed factory release and a dedicated asynchronous-oracle/cross-reserve analysis.

## Fees and Launch Shield

The opening Launch Shield is buy-only:

- 99% opening buy tax;
- deterministic decay to zero after five seconds;
- 2% cumulative per-wallet token-purchase cap for the first 15 seconds;
- shield proceeds route to liquidity reinforcement.

After shield tax, protocol fees and launch tax are calculated independently. The curve accounts only net quote as reserve.

Mainnet v1 does not enable the tax-token architecture, but standard launches can still have the immutable Fortune fee matrix.

## Graduation

Graduation progress is based on protocol-accounted reserve USD, not raw token balances.

For a linear curve, the theoretical terminal marginal price for graduation target `G` is derived from:

```
P_g^2 = P0^2 + 2 * k * G
```

The factory estimates:

- tokens sold at graduation;
- the graduation anchor price;
- launch tokens required to pair the graduation reserve at the anchor;
- a 10% supply buffer above sold + LP inventory.

The final buy partially fills to the remaining graduation target and refunds excess input. Graduation then snapshots reserve composition and the anchor.

## Existing onchain bounds

`FortuneFactory.preflightLaunch` currently rejects:

- zero supply;
- zero base price;
- zero graduation target;
- base price, slope, or graduation target above `uint120.max`;
- terminal prices above `uint120.max`;
- parameter combinations that produce zero graduation output;
- total supply below the required sold + LP inventory plus 10% buffer.

These are arithmetic/supply-safety bounds. They are **not** a production economic policy.

## Mainnet parameter-policy blocker

Before `economicCurveSimulation` can be marked complete, an independent review should recommend production bounds or a narrower launch template for at least:

- base price;
- slope / terminal-price relationship;
- graduation target;
- total supply;
- allowed fee range;
- reserve count (hard-capped to one for mainnet v1);
- fixed versus adaptive graduation.

Those conclusions should be enforced onchain, not only in the frontend.

## Reproducible stress harness

Run:

```bash
node scripts/mainnet-economic-sim.mjs
```

The deterministic harness currently explores 50,000 broad parameter combinations and checks:

- buy/sell curve round trips cannot create normalized USD before fees;
- graduation inventory fits the factory's supply-buffer rule;
- non-zero graduation state is preserved.

The Foundry suite separately fuzzes live Solidity behavior, including same-reserve round trips, cross-reserve round trips, stale oracle failure, direct-donation/rebase accounting, and oversized final-buy partial fills.

Passing these tests is evidence for review. It is not by itself an independent economic or MEV approval.
