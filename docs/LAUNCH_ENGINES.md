# Fortune launch engines

Fortune supports multiple launch engines because a BEP-20 quote asset, a tokenized stock reserve and an external perpetual are not the same financial primitive.

## 1. Basket Curve

The standard Fortune launch.

- 1–5 approved BSC quote assets
- one canonical sold counter / curve
- fixed or demand-weighted graduation
- immutable Fee Matrix
- standard Fortune automation vaults

## 2. Stock Floor

A Stock Floor launch is built around one genuine BSC tokenized-stock representation.

### Goal

A portion of the stock-token reserve is separated into a protected floor vault rather than being entirely consumed by ordinary liquidity deployment.

The prototype `FortuneStockFloorVault` provides a real pro-rata redemption mechanism:

```
stock-token reserve held by floor vault
---------------------------------------
launch-token supply outside floor vault
= reserve units available per launch token
```

When redemption is activated, a holder can send launch tokens into the floor vault and receive the corresponding pro-rata amount of the tokenized stock.

This means "floor" refers to an actual reserve/redemption mechanic. It does **not** mean Fortune guarantees a USD price, because the stock token itself moves in value and can carry provider/market risk.

### Production requirements

Before a Stock Floor launch can use real assets:

- exact provider-backed BSC stock-token contract;
- independent oracle;
- transfer/restriction compatibility;
- reserve segregation;
- audited activation/graduation flow;
- provider halt handling;
- user/product eligibility controls;
- clear redemption disclosures.

Fortune must not describe this feature as a mechanism for moving or manipulating the underlying public stock.

## 3. Pre-IPO Perp Pair

Pre-IPO perpetuals are external derivatives, not BSC reserve tokens.

Fortune therefore models a Pre-IPO Perp Pair as:

```
Lighter public market
  -> mark / index reference
  -> approved BNB-chain reference oracle
  -> Fortune settlement pool in USDT/USDC
  -> optional hedging adapter
```

The launch UI currently discovers Lighter market metadata from its public `orderBookDetails` API. The external market itself never becomes a fake BEP-20.

### Reference registry

`FortunePerpReferenceRegistry` stores:

- market key;
- approved BNB-chain oracle;
- maximum oracle age;
- maximum reference multiplier;
- experimental low-depth setting;
- venue and symbol;
- active state.

The prototype supports a multiplier cap of up to 3x, but this is configuration infrastructure—not a production leverage product.

### Why settlement is separate

A Lighter perpetual position lives in Lighter's system and carries:

- margin risk;
- liquidation risk;
- funding;
- mark/index divergence;
- venue availability risk.

It cannot simply be sent to a BSC AMM as the quote token.

A production Fortune implementation needs a separately audited hedging/settlement adapter and an independent way to bring the reference price onto BNB Chain.

### Experimental low-depth pools

Lower virtual depth can make an early market usable with less deployed capital, but it also increases slippage and price sensitivity. Production settings should therefore include:

- hard notional caps;
- maximum trade size;
- oracle deviation checks;
- circuit breakers;
- maximum slippage;
- funding/hedge health checks;
- automatic disablement when the external market is halted or stale.

## Shared principle

Every engine is represented explicitly in the Launch Manifest.

The interface must never make these three structures look identical:

- actual reserve asset;
- redeemable stock-token reserve;
- synthetic/perp price reference.
