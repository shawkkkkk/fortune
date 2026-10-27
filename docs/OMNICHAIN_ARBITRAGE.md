# Omnichain arbitrage and an optional strategy token

Fortune's additive scope includes a price-gap trading service for its omnichain ecosystem and an optional token whose disclosed buyback policy uses the strategy's realized profit. This is distinct from token transport, holder rewards and protocol-fee recirculation. It neither replaces Standard nor assumes a Fortune platform-token CA exists.

The owner's [ZeroGap reference](https://zerogap.live/), read 2026-10-27, describes detection, cross-chain trading and a 30% share of realized profit for buybacks. The retrieved page also displays a zero-address/launching-soon placeholder and unavailable statistics. Treat its live/deployment claims and the supplied addresses as unverified references. Fortune does not adopt that percentage as active economics.

## Implementation in this slice

`lib/arbitrage-policy.ts` models testnet quote spreads with adverse-fill bounds, gas, bridge, rebalancing and other costs. Quotes must cover one canonical token identity, identical token units and one accounting denomination. Stale/future quotes, unsupported networks, insufficient cash/inventory and insufficient net spread are rejected or blocked. These are modeled opportunities, not authenticated market data or executable authorizations.

Sequential buy → bridge → sell cannot lock a future sell quote. It stays blocked in this initial model. A future prefunded strategy may sell inventory already present on the expensive chain while buying on the cheaper chain, then rebalance. That reduces dependence on bridge arrival time but introduces inventory, timing, custody and adverse-fill risks. Neither approach guarantees identical prices, fast completion or profit.

The realized-profit reducer requires a reconciled cycle with no unmatched inventory and the same accounting denomination as its ledger policy. It subtracts purchase and all execution costs, carries losses forward, and recovers those losses before allocating any buyback budget. Duplicate cycles and receipt identities are rejected. The share is captured in the ledger policy rather than selected again for each cycle; the durable worker and onchain controls must protect that policy from mutation. It applies to distributable realized strategy profit, never trade volume or principal. Integer remainder stays in retained strategy profit. Budget/profit totals are cumulative allocations, not currently available cash; execution must separately reconcile spending and solvency.

These pure helpers do not verify chain receipts or persist a ledger. The future worker must authenticate each receipt and commit accounting/deduplication atomically in durable storage. A buyback allocation remains pending until the actual market purchase is confirmed; any subsequent burn needs its own receipt. Unsold tokens, transfers in flight, quote gains, funding deposits and unrealized inventory appreciation cannot be counted as realized profit.

## Remaining implementation and release gates

- Verified token/pool identities and executable, block-pinned venue quotes on each supported chain; trustworthy normalization into the accounting asset.
- Dedicated strategy capital and inventory, isolated from launch reserves, creator fees and holder liabilities. Launch-token-side fees remain permanent burns only.
- Enforced contract/target allowlists, trade/exposure budgets, slippage/minimum outputs, revocation, pause and governance controls. An AI prompt is not a spending limit.
- Durable worker/job leases and receipt reconciliation; route-specific finality, failed-leg unwind, bridge delay, reorg and insolvency drills.
- A public execution ledger identifying strategy wallets, quotes versus fills, all costs, losses, inventory, unsettled obligations and buyback/burn receipts. No artificial-volume objective or self-trading.
- Separate token/economic specification if the strategy is tokenized: exact rights/authorities, supply/chain allocations, capital ownership, costs and buyback beneficiary/rate. No existing token should silently inherit this policy.
- Independent contract/economic review, legal review, testnet route evidence and normal mainnet release gates before any real-money operation.

The tests in this PR establish arithmetic, eligibility and retry/deduplication behavior only. There is no live arbitrage bot, funded treasury, deployed strategy token or automatic buyback in this slice.
