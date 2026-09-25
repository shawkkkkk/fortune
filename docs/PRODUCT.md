# Fortune product specification

## Positioning

**Fortune — Meme coins, paired with the BNB economy.**

The three promises are **no dumping**, **holders get paid**, and **pair with anything**. Each requires an actual onchain implementation and eligibility policy before it can be advertised as active. Standard is a frozen, WBNB-only mainnet candidate and has no holder rewards. Burn + Rewards v2, multiple pairs, and arbitrary BEP-20 support remain separately gated.

The product follows LESGO's short launch path and candid lifecycle/trust documentation while adapting the implementation to BNB Chain. Sender informs compatibility checks and direct holder claims; its no-migration pool design is a different architecture from Fortune's frozen Standard curve. Fortune's longer-term research combines:

1. one canonical Basket Curve;
2. 1–5 approved quote assets;
3. fixed or demand-weighted multi-pool graduation;
4. reward-in-approved-asset mechanics;
5. programmable but immutable Fee Matrix;
6. transparent Launch Manifest;
7. Forum + Analytics + Automations as protocol-native surfaces.

## Navigation

- **Home** — positioning and live release state
- **Explore** — onchain market discovery
- **Launch** — short creation flow
- **Burns / Rewards** — verifiable activity ledgers when v2 is proven
- **Stats / Docs / Status** — onchain facts, protocol terms and release gates
- **Search / token pages / profiles** — discover verified launches and creators

## Launch wizard

### 1. Token
Name, ticker and square image URI. Image hosting must exist before launch; a permanent upload service is not wired yet. Optional description and links are in Advanced.

### 2. Launch type
Standard or Burn + Rewards. V2 stays disabled until its hook, accounting, fork tests, audit and release gate pass.

### 3. Pair asset
Select only from the live onchain approved registry. Mainnet v1 is pinned to WBNB. Expand to stablecoins, BTCB/ETH, BNB majors, DeFi, eligible RWAs and compatibility-checked BEP-20 assets in separate releases.

### 4. Optional first buy
Show the quote amount, approve if needed, simulate output and enforce a meaningful minimum. Disclose the first-five-second Launch Shield impact.

### 5. Review and launch
Show fixed token, pair, fee and liquidity terms before signature. Standard defaults to immutable display metadata. Put supply, price slope, graduation target and optional links in Advanced.

## Current release boundary

The BSC testnet alpha is live. The Standard mainnet candidate is paused pending the independent audit, governance signatures, production infrastructure and legal/asset policy gates in `mainnet-release.json`. The isolated v2 reward token has no Infinity hook, factory, indexer, or deployment and must never inherit Standard approval.

## Registry categories

Majors · BNB Chain · Stablecoins · xStocks · PreStocks · RWAs · DeFi · Memes · BSC 400 · Custom

Only actual BSC-compatible contracts may be enabled. Categories may show unavailable assets for discovery, but they must not be selectable.

## Forum

Every token has a community surface. Posts can attach a live launch card and route users to its trade screen. Creator announcements are distinguishable from normal posts.

## Analytics

Core dashboards:
- volume and launches;
- graduation health;
- quote-asset mix;
- Basket reserve composition;
- holder rewards;
- creator fees;
- buybacks/burns;
- LP reinforcement;
- Fortune revenue;
- protocol health.

## Automations

Show:
- current automation state;
- last successful execution;
- queued work;
- assets/value in each vault;
- failure state;
- public execution ledger.

## Product boundary for v1

Do not add multichain support, leverage, lending or governance before the Basket Curve and graduation system are economically validated. Fortune should be excellent on BNB Chain first.
