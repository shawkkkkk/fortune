# Fortune architecture

## Product thesis

Fortune is BNB Chain-native infrastructure for launching a fixed-supply token into a configurable **Basket Curve**.

A launch may accept one to five registry-approved quote assets while maintaining one canonical sold counter and price. That avoids exposing five independent launch prices simply because five assets are accepted.

## Core path

```
Creator
  ↓
FortuneFactory
  ├─ FortuneToken (fixed supply + manifest hash)
  ├─ FortuneFeeRouter (immutable launch Fee Matrix)
  └─ FortuneCurve
       ├─ quote asset A reserve
       ├─ quote asset B reserve
       ├─ ...
       └─ one canonical curve
              ↓ threshold
       GraduationAdapter
              ↓
       destination pools (production adapter TBD)
```

## Fortune Asset Registry

The registry separates **discovery** from **permission**.

1. Discovery catalogs may include hundreds of BSC tokens.
2. An asset becomes quote/reward/graduation-capable only through the onchain registry.
3. Approval should require exact contract verification, oracle coverage, transfer compatibility and liquidity review.
4. Custom assets must never silently inherit "verified" status.

The web API `/api/registry/bsc` imports up to 400 discovery candidates from PancakeSwap's BNB token list. These are not automatically approved onchain.

## Basket Curve

Every accepted quote asset is converted to a common 1e18 USD accounting unit through the configured oracle layer. The curve uses one global `tokensSold` state.

The current Solidity implementation intentionally uses a simple marginal-price approximation for testnet research. Before mainnet, the pricing function needs:

- formal economic specification;
- integral buy/sell math;
- numerical simulations under volatile cross-asset prices;
- MEV and oracle manipulation analysis;
- reserve imbalance analysis;
- stress tests for multi-asset sells.

## Graduation

A curve closes once its reserve-value threshold is reached. Reserves and remaining launch tokens are handed to one protocol-approved `IGraduationAdapter`.

Two graduation modes are represented:

- **Fixed basket** — creator's manifest weights.
- **Demand weighted** — final reserve USD composition determines weights.

Production PancakeSwap integrations stay outside the core curve so the adapter can be reviewed and replaced independently for new pool versions.

## Fee Matrix

Each launch encodes absolute trade basis points for:

- creator;
- holder automation vault;
- buyback automation vault;
- LP reinforcement vault;
- community treasury;
- Fortune protocol.

The total is capped by the contract prototype at 5%. The split is immutable for that launch.

A "holder rewards in CAKE" launch does **not** make the core curve perform arbitrary swaps. Fees enter an automation vault; an approved swap/reward adapter can batch conversion and distribution. This keeps DEX routing risk outside the curve.

## Automations

Fortune treats operational automation as public protocol state:

- holder reward batches;
- buybacks/burns;
- LP reinforcement;
- graduation finalization;
- oracle freshness checks;
- failure/retry queue.

The UI has a dedicated Automations surface rather than hiding these actions in backend jobs.

### Automation vault primitive

`FortuneAutomationVault` declares one immutable purpose (holder rewards, buyback/burn or LP reinforcement), launch token and executor. The executor cannot choose an arbitrary destination: it may only invoke an adapter approved for that purpose by `FortuneAutomationRegistry`.

The vault intentionally has no generalized owner sweep. Production registry ownership should sit behind a multisig/timelock, and each adapter must validate its own execution data and slippage rules.

## Data and indexing

Onchain events are the source of truth for production analytics. A future indexer should consume:

- LaunchCreated
- Bought
- Sold
- FeeRouted
- GraduationReady
- Graduated
- registry configuration events
- automation execution events

The demo frontend currently uses mock values and labels them accordingly.
