# Fortune

**Launch against anything.**

Fortune is a BNB Smart Chain launch protocol built around a single shared multi-asset bonding curve. A launch can accept **1–5 approved BSC quote assets**, keep **one canonical price**, route fees through a configurable fee matrix, and graduate into multiple liquidity markets.

> **Status:** pre-audit testnet software. Do not use with real funds.

## Core idea

Traditional launchpads bind a launch to one quote token. Fortune introduces a **Basket Curve**:

- choose 1–5 approved BSC quote assets;
- purchases across every quote asset move one shared curve;
- quote assets are normalized through registry-approved price oracles;
- reserves accumulate as a transparent basket;
- a launch stores an immutable **Launch Manifest** hash;
- at the graduation threshold, the launch hands reserves to a graduation adapter for deployment into destination pools.

## Product

- **Explore** — new, hot, graduating, graduated, reward and multi-pool launches
- **Launch** — token details, Basket Curve assets, weights, fee routing, reward settings, developer buy and manifest preview
- **Forum** — token-native social feed with launch attachments
- **Analytics** — volume, launches, graduations, quote-asset mix, protocol reserves and fee routing
- **Portfolio** — holdings, launches, rewards and creator revenue
- **Fortune Asset Registry** — BNB-native assets, majors, stablecoins, DeFi, RWAs and BNB-deployed tokenized equities

## Important asset policy

Fortune is BSC-first. Assets are pairable only when an actual compatible BSC contract is registered. A brand/ticker existing on another chain is not enough.

As of September 2026, xStocks has BNB Chain deployments. PreStocks' own product page describes its products as live on Solana, so PreStocks are **not enabled as BSC quote assets** unless/until official BSC contracts exist.

## Repository layout

```
app/                  Next.js application
components/           shared UI
data/                 registry/catalog seed data
lib/                  chain, launch and formatting utilities
contracts/            Foundry smart-contract workspace
docs/                 architecture, security and product specification
```

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Contracts

Install Foundry, then:

```bash
cd contracts
forge install
forge test
```

## Networks

- BNB Smart Chain mainnet: chain ID **56**
- BNB Smart Chain testnet: chain ID **97**
- Development defaults to testnet.

## Safety

Fortune's smart contracts are prototypes and have not been audited. The UI deliberately labels unsupported, non-BSC and unverified assets. Production deployment should require independent smart-contract audits, economic review, oracle review, legal/compliance review for tokenized securities/RWAs, and explicit approval of production PancakeSwap adapters.

## License

MIT
