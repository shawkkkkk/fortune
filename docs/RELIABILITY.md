# Fortune reliability

Fortune treats launch reliability as a protocol feature.

The two primary failure classes are:

1. **market/pool failures** — graduation fails, pool initialization is wrong, reserves are incompatible, or chart price jumps because the launch curve and AMM phases are stitched incorrectly;
2. **traffic failures** — the website becomes slow/unavailable during a high-interest launch.

## 1. Market and liquidity reliability

### Launch-wide preflight

`FortuneFactory.preflightLaunch` is the final contract-level gate before a launch can exist. It rejects a launch when:
- the protocol is paused;
- no executable graduation adapter is configured;
- quote assets are duplicated, disabled or missing graduation capability;
- an asset's oracle is stale, future-dated, zero-priced or reverting;
- a token's decimals changed after registry approval;
- basket weights do not total exactly 10,000 bps;
- the primary market is not in the basket;
- the configured fee routes are invalid;
- metadata/economic inputs exceed bounded ranges.

The same check is called inside `createLaunch`, so bypassing the website cannot bypass readiness validation.

### Preflight before funds move

Every production graduation adapter must implement `IGraduationPreflight`.

The curve snapshots:
- remaining launch-token inventory;
- each reserve asset;
- each reserve balance;
- graduation weights.

The adapter must validate the exact graduation plan **before any reserves leave the curve**.

Production preflight should reject:
- unsupported assets;
- duplicate destination pools;
- zero-depth weighted markets;
- stale oracle/reference data;
- impossible price initialization;
- unacceptable slippage;
- expired deadlines;
- venue/router misconfiguration;
- incompatible token behavior.

### Final-buy partial fills

The final curve purchase is clamped to the remaining graduation target. Fortune
charges only the quote amount actually used and returns excess input in the same
transaction. This prevents a small preceding transaction from making the final
buyer revert or overfunding the graduation reserve.

The contract's `previewBuy()` returns the exact current shield tax, normal fee,
quote spent, refund, normalized USD contribution and tokens out.

### Atomic graduation

Reserve transfers and adapter execution happen in one EVM transaction.

If the destination adapter reverts, the whole transaction rolls back. The curve retains its reserves and can be retried.

`FortuneFactory` records:
- attempt count;
- failure count;
- last attempt time;
- last failure code/hash;
- completion state.

This makes failed graduations visible rather than leaving a token silently broken.

### Exact curve integration

Fortune no longer treats a large buy as though every token in that transaction was purchased at the pre-trade spot price. The linear curve is integrated across the entire trade. Sells use the same area-under-the-curve accounting in reverse.

This removes a major source of artificial price jumps and prevents large transactions from underpaying relative to the displayed curve.

At graduation, Fortune calculates how many unsold launch tokens are actually required to pair the accumulated reserve basket at the stored graduation anchor price. Only that amount is sent to LP creation; excess unsold inventory is burned atomically. If graduation later reverts, the burn reverts too.

### Price continuity / charts

When a curve reaches its threshold, `FortuneCurve` stores and emits one immutable:

`graduationAnchorPriceUsd1e18`

The indexer should treat this as the boundary between:
- Phase A: Fortune curve trades;
- Phase B: destination AMM trades.

The production graduation adapter should initialize destination liquidity as close as technically possible to the anchor price.

The chart pipeline must:
1. normalize token/quote decimals;
2. order trades by block number + transaction index + log index;
3. use Fortune curve events before graduation;
4. use destination-pool swaps after graduation;
5. include the graduation anchor;
6. flag—not hide—material initial-price discontinuities;
7. never mix unrelated pools with different token contracts;
8. aggregate multi-pool price using a liquidity/depth-aware policy rather than blindly averaging tiny pools.

A weird chart is usually a data/integration bug, not something the UI should smooth away cosmetically.

### Failed-graduation rescue

If a launch reaches `GraduationReady` but cannot complete graduation for seven
days, rescue can be activated permissionlessly. Holders can return circulating
curve tokens for their pro-rata share of the quote reserves still held by the
curve.

This path cannot touch a successfully graduated pool and does not make external
fee/automation vaults withdrawable.

### Pancake V3 graduation guard

`FortunePancakeV3GraduationAdapter` is a configurable research adapter for the real graduation path. It hardcodes no external deployment addresses.

Its preflight checks:
- Fortune registry graduation capability and live asset health;
- supported fee tier / tick spacing;
- 1–5 reserve plan shape and exact weights;
- deadline bounds;
- permanent-locker readiness;
- existing-pool price deviation from the Fortune target price;
- nonzero launch-token allocation for every active pool.

Execution:
- creates/initializes missing pools only at the derived Fortune price;
- mints LP positions with a maximum residual/dust tolerance;
- moves each position NFT directly to the permanent locker;
- sends bounded unused token dust to the launch's liquidity-reinforcement vault;
- reverts the entire graduation if any pool cannot satisfy the plan.

### Pool health state

Production UI/indexer states should be explicit:

- Curve active
- Graduation ready
- Preflight failed
- Graduation retrying
- Pools created
- Liquidity verified
- Indexing
- Trading live
- Degraded

A token should not show **Trading live** just because a pool address exists.

## 2. High-traffic website reliability

### Keep read traffic cacheable

Public discovery/catalog endpoints should use CDN caching and stale-while-revalidate where freshness permits.

Do not make thousands of browsers independently hit:
- CoinGecko;
- Nasdaq;
- xStocks;
- Binance RWA;
- Lighter;
- RPC nodes.

Fortune's server/cache layer should fan-in those upstream requests.

### Separate reads from writes

A traffic spike on:
- Explore;
- Forum;
- charts;
- analytics

must not prevent users from:
- loading the launch/trade transaction form;
- reading onchain state;
- submitting a transaction through their wallet.

### Degraded mode

Optional providers failing must not crash the entire app.

Fortune includes:
- route loading UI;
- route error boundary;
- global crash fallback;
- fast `/api/health` endpoint.

The interface should continue with cached/onchain information and label stale data.

### Transactions are idempotency-sensitive

The frontend must never automatically resubmit a buy/launch transaction after:
- timeout;
- page refresh;
- RPC error;
- server error.

First recover the transaction hash/account nonce and check chain state.

### RPC redundancy

Server-side BSC reads use a provider failover list rather than one RPC URL. `/api/ready` checks the configured chain, healthy provider count and deployed factory bytecode without exposing provider URLs.

For BSC mainnet, production readiness requires at least two configured providers. Runtime can remain available with one healthy provider while reporting degraded redundancy.

### Multi-provider RPC

Production should use:
- at least two BSC RPC providers;
- health-based failover;
- separate read and transaction paths where practical;
- WebSocket/poll fallback;
- request coalescing for identical reads.

### Load testing

Run:

```bash
BASE_URL=https://preview.example \
CONCURRENCY=100 \
REQUESTS=2000 \
node scripts/load-test.mjs
```

The initial release gate should require:
- >= 99.5% HTTP success in the test;
- no blank-page failures;
- core static pages usable when optional upstream providers fail;
- transaction UI independent of analytics/forum availability.

Increase concurrency and duration before a promoted launch.

## Release gates

Fortune mainnet should not ship until:

### Protocol
- Foundry unit tests green;
- invariant/fuzz suite green;
- graduation failure/retry tests green;
- real PancakeSwap adapter tested on BSC testnet;
- price continuity tests green;
- independent audit complete.

### Web
- production build green;
- load test meets release SLO;
- external provider failure drills pass;
- RPC failover drill passes;
- error reporting/alerts configured;
- cached registry data remains available during provider outages.

### Operations
- graduation keeper redundancy;
- alert on graduation-ready markets not finalized within SLA;
- alert on repeated adapter failure;
- alert on stale price/oracle feeds;
- incident runbook and rollback plan.
