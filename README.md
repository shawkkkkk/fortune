# Fortune

**Launch against anything.**

Fortune is a BNB Smart Chain launch protocol built around a shared **multi-asset Basket Curve**. A launch can accept **1–5 approved BSC quote assets**, maintain **one canonical launch price**, route trading fees through an immutable **Fee Matrix**, and graduate reserves into multiple destination markets.

> **Status:** pre-audit testnet research software. Do not use with real funds.

## What is built

### Web product

- **Explore** — launch discovery with basket/reward/graduation metadata
- **Launch** — Basket Curve, **Stock Floor**, and experimental **Pre-IPO Perp** launch engines; fee routing, rewards, dev buy and immutable manifest preview
- **Assets** — transparent Fortune Asset Registry UI
- **Forum** — market-native discussion feed with attached launch cards
- **Analytics** — protocol, basket, graduation and fee-routing analytics surfaces
- **Automations** — holder rewards, buybacks, LP reinforcement, graduation queue, oracle health and public execution ledger
- **Portfolio** — holdings/reward/creator/referral dashboard shell
- **Token market pages** — canonical curve, quote-asset trade selector, basket view and manifest
- **Injected EVM wallet connect** — recognizes BSC mainnet/testnet
- **BSC discovery API** — imports up to 400 BSC token candidates from PancakeSwap's extended token list

Demo market/analytics values are deliberately marked as placeholders until onchain deployments and indexers exist.

### Contracts

- `FortuneToken` — fixed supply; no owner mint, blacklist or mutable token tax
- `FortuneMetadataRegistry` — optional revisioned display metadata with irreversible creator freeze
- `FortuneAssetRegistry` — explicit quote/reward/graduation capability registry
- `FortuneChainlinkOracle` — configurable USD feed adapter
- `FortuneFactory` — creates token + curve + immutable fee router and embeds a Launch Manifest hash
- `FortuneCurve` — experimental shared curve accepting 1–5 quote assets
- `FortuneStockFloorVault` — reserve-backed pro-rata redemption floor for stock-token launches
- `FortunePerpReferenceRegistry` — approved external-perp reference markets, oracle freshness and multiplier/depth limits
- `FortuneFeeRouter` — immutable per-launch absolute-bps Fee Matrix
- `FortuneAutomationRegistry` — purpose-scoped allowlist for automation adapters
- `FortuneAutomationVault` — restricted holder-reward / buyback / LP automation vault primitive
- `IGraduationAdapter` — isolated destination-market adapter interface
- `MockGraduationAdapter` — test-only graduation target
- BSC testnet mock oracle/quote assets + deployment script

CI builds the Next.js application and runs the Foundry test suite.

## Core idea

Traditional launchpads usually bind a launch to one quote token. Fortune introduces a **Basket Curve**:

1. Choose 1–5 registry-approved BSC assets.
2. All purchases advance one shared launch curve.
3. Quote assets are normalized through registry-approved price sources.
4. Reserves accumulate as a transparent basket.
5. Fees route through a launch-specific immutable Fee Matrix.
6. At the graduation threshold, reserves are handed to an approved destination adapter.

### Fixed vs demand-weighted graduation

**Fixed Basket** preserves the creator's manifest weights.

**Demand Weighted** derives graduation weights from the value of the reserves users actually contributed.

## Fortune Asset Registry

Discovery and permission are separate.

A token may appear in the BSC catalog without being approved for:

- quote markets;
- holder rewards;
- graduation liquidity.

Production approval should require exact contract verification, oracle coverage, liquidity review and transfer compatibility. Fee-on-transfer quote tokens are rejected by the current curve.

The UI categories include:

**Majors · BNB Chain · Stablecoins · xStocks · China Stocks · NASDAQ Penny Stocks · PreStocks · RWAs · DeFi · Memes · BSC 400 · Custom**

Only actual compatible BSC contracts can receive onchain capabilities. A ticker existing on another chain is not sufficient.

## xStocks / tokenized assets

Fortune's registry architecture is designed to support real BSC-deployed tokenized assets only after their exact contract, transfer model, oracle source and eligibility constraints are reviewed.

The Basket Curve reads reserve balances live instead of trusting a static internal reserve counter, allowing the accounting layer to tolerate rebasing-style reserve balance changes. This does **not** make every rebasing or restricted token automatically safe or eligible.

PreStocks are not enabled as BSC quote assets unless an official compatible BSC deployment exists.

## NASDAQ penny stocks

Fortune includes an any-ticker lookup for real NASDAQ stocks. The launch UI can:

1. verify that the ticker resolves as a NASDAQ-listed stock;
2. classify it as a penny stock when the observed last-sale price is below $5;
3. search recognized tokenized-stock providers for a BSC representation;
4. expose the real BSC token address when one exists.

A stock ticker is **not** itself an onchain asset. Fortune does not synthesize an unbacked token merely because a ticker exists.

Provider discovery currently supports:
- public xStocks metadata;
- Binance Web3 RWA search for Ondo and bStocks when server API credentials are configured.

Even a provider-returned token remains subject to the Fortune onchain Asset Registry, oracle, compatibility and eligibility gates.

## Fee Matrix

A launch may route the configured trade fee across:

- creator;
- holder-reward automation vault;
- buyback/burn automation vault;
- LP reinforcement vault;
- community treasury;
- Fortune protocol.

The prototype caps the total configured trade fee at 5%. The route is immutable for a launch.

If holders are meant to receive a different asset from the quote asset, conversion belongs in an approved automation adapter/vault rather than inside the core curve.

## Repository layout

```
app/                  Next.js application
components/           shared UI
data/                 UI registry/catalog seed data
lib/                  types and client utilities
contracts/            Foundry smart-contract workspace
docs/                 architecture, security, product and testnet docs
```

## Web development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Contracts

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge install foundry-rs/forge-std --no-commit
forge test -vvv
```

See `docs/TESTNET.md` for the isolated BSC testnet deployment flow.

## Networks

- BNB Smart Chain mainnet: chain ID **56**
- BNB Smart Chain testnet: chain ID **97**
- Development is testnet-first.

## Mainnet boundary

A production launch is intentionally **not** enabled by this repository yet.

Before mainnet:

1. independent smart-contract audit;
2. economic/integral curve specification and simulation;
3. MEV and cross-reserve arbitrage review;
4. oracle manipulation/staleness review;
5. audited PancakeSwap graduation adapter;
6. audited automation/swap vaults;
7. indexer + reproducible analytics;
8. legal/compliance review for tokenized securities/RWAs and regional restrictions.

See `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, and `docs/LAUNCH_ENGINES.md`.

## License

MIT
