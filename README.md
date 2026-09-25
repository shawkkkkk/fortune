# Fortune

**Meme coins, paired with the BNB economy.**

Fortune is a BNB Smart Chain launchpad. The creator-facing path is **name → ticker → image → Standard or Burn + Rewards → reviewed pair asset → optional first buy → review → launch**. Curve and economic controls live behind Advanced. The Standard mainnet candidate is frozen to one pinned WBNB pair; broader asset support and Burn + Rewards v2 are separate research and release work.

> **Status:** public BSC Testnet alpha. Test assets only; the contracts remain pre-audit and mainnet is intentionally disabled. Do not use with real funds.

**Live public alpha:** https://fortune-rho-snowy.vercel.app/testnet  
**System status:** https://fortune-rho-snowy.vercel.app/status

The product direction is **no dumping, holders get paid, pair with anything**. These are goals for the separate Burn + Rewards v2 architecture, not active Standard payout claims. V2 must burn any launch-token-side fee and fund direct holder claims from the pair-asset side without selling the launch token. Its isolated reward-accounting prototype is in `contracts-v2/`; no Infinity hook or real-value deployment exists yet. `docs/BURN_REWARDS_V2.md` has the proof requirements.

## What is built

### Web product

- **Home, Explore, Search** — Fortune positioning and the most recent factory-backed launches
- **Launch** — short Standard form with reviewed pair, optional creator first buy, onchain preflight and a valueless testnet signing path; Burn + Rewards v2 is disabled
- **Burns, Rewards, Stats** — clear research status and exact factory launch counts; no fabricated payout or volume totals
- **Token pages and creator profiles** — latest-window direct onchain reads; full-history indexing pending
- **Assets and status** — onchain registry capabilities, explicit deployment and release gates
- **Testnet lab** — wallet faucet, Standard trade/graduation exercise and the older tax-token/Pancake V2 research controls
- **Forum and portfolio** — honest pending states until user activity and holdings are backed by real data
- **BSC discovery API** — separately identifies candidate assets; discovery does not authorize a pair

The current Explore, search, token, profile and Stats surfaces use direct onchain reads where available. Unsupported totals and charts remain unavailable rather than displaying invented figures. Older experimental pages and API endpoints remain research surfaces; check each endpoint's data-mode metadata before integrating.

### Contracts

- `FortuneToken` — fixed supply; no owner mint, blacklist or mutable token tax; every Fortune-created token is CREATE2-deployed with a `0xfe` vanity suffix
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
- `FortunePermanentLiquidityLocker` — irreversible custody for graduation LP-position NFTs with permissionless fee harvesting to a fixed recipient
- `IGraduationAdapter` — isolated destination-market adapter interface
- `MockGraduationAdapter` — test-only graduation target
- BSC testnet mock oracle/quote assets + deployment script

CI builds the Next.js application and runs the Foundry test suite.

## Public BSC Testnet alpha

The `/testnet` route is the public onchain alpha path. It lets a tester:

1. connect or switch an injected wallet to BSC Testnet (chain 97);
2. mint Fortune's valueless mock `fUSD` quote token;
3. create a real Fortune launch through the deployed testnet factory;
4. buy on the real Fortune Basket Curve;
5. permissionlessly finalize graduation into a real Pancake V3 testnet pool;
6. inspect the resulting token, curve, transactions and protocol contracts on BscScan.

The current public-alpha reference deployment is documented in `docs/PUBLIC_TESTNET.md`. The successful release drill ran 7,500 web requests with 100% request success while three additional real BSC Testnet graduation cycles executed, then re-verified the original graduation invariants.

The broader 10/25/50/100 concurrent-graduation ladder remains available as a later capacity exercise; it is not a prerequisite for opening the testnet alpha.

## Fortune vanity addresses

Every token created through `FortuneFactory` is deployed with CREATE2 and must end in the hex byte `fe`.

Example:

```
0x8B54...91fe
```

The factory searches deterministic CREATE2 salts during launch and rejects any deployment that does not satisfy the suffix. Because `fe` is one byte, a matching salt takes roughly 256 trials on average. A creator-specific launch nonce is included in the manifest so repeated launches with identical settings still receive different token addresses.

Address letter casing is only a display/checksum convention; Fortune renders the suffix as lowercase `fe`.

## Fortune Launch Shield

Every Fortune curve starts with protocol-level anti-sniper protection:

- 99% buy tax at launch, rapidly decaying to 0 after 5 seconds;
- 2% cumulative per-wallet buy cap during the first 15 seconds;
- no creator/private-wallet exemptions;
- temporary shield-tax proceeds route to liquidity reinforcement, not the creator;
- shield fees do not count as curve buy pressure.

See `docs/LAUNCH_SHIELD.md`.

## Reliability-first graduation

Fortune curves support **partial-fill final buys**: the purchase that reaches
the graduation target spends only what is needed and refunds the excess in the
same transaction.

Graduation then uses a full-plan preflight and atomic adapter call. Failed
graduations remain retryable. If a launch is still unable to graduate after
seven days, holders can activate a permissionless pro-rata reserve rescue rather
than remaining stuck indefinitely.

Fortune exposes explicit market phases: `CurveActive`,
`GraduationReady`, `PoolCreated`, and `Rescued`.

See `docs/RELIABILITY.md` and `docs/COMPETITOR_LESSONS.md`.

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

## Creator fee surrender

A creator with a configured creator fee can permanently surrender that entire fee share to the launch's purpose-locked holder-reward vault. This is one-way: it cannot raise fees, restore creator routing or alter any other launch route.

## Custom BSC pair checks

Fortune accepts arbitrary BSC contract addresses for compatibility inspection, but unlike a plain address-paste flow it does not equate "contract exists" with "safe reserve asset." The public checker reads contract code, decimals, metadata and current Fortune approval, while flagging transfer behavior, oracle, liquidity and graduation checks that still must pass.

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

## Launch Readiness

The launch page now fails closed behind a 14-point readiness gate. It combines local configuration checks, server-side launch preview, RPC/factory deployment health, permanent LP-lock readiness and graduation/Pancake infrastructure. The Launch button remains disabled until the visible gates pass; the Solidity factory then repeats launch preflight onchain immediately before deployment.

Production clients should use `createLaunchPrepared`: call `previewPreparedVanity` through `eth_call`, then submit the returned salt. This keeps the `0xfe` CREATE2 vanity search out of paid launch gas and makes launch gas much more predictable.

## Public API

Fortune now exposes a versioned developer surface at:

```
/api/public/v1
```

Public reads require no API key. The API separates discovery from launchability and launchability from runtime preflight.

Current endpoints include:
- `GET /meta`
- `GET /protocol`
- `GET /assets`
- `GET /pairs`
- `POST /launches/preview`
- `GET /tokens`
- `GET /tokens/{id}`
- `GET /launches`
- `GET /stats`
- `GET /automations`
- `GET /revenue`
- `GET /openapi`

A lightweight identity-only asset index is also available at `/api/public/total-assets`.

The launch preview API validates basket weights, quote capabilities, reward assets, fees and launch-engine constraints before any transaction is built. General-purpose API transaction preparation remains intentionally disabled. The dedicated `/testnet` alpha route performs wallet-signed transactions against the published BSC Testnet deployment; production/mainnet transaction preparation remains disabled.

See `docs/API.md` and the in-app `/developers` page.

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

## Official channels

- X: [@fortunepad](https://x.com/fortunepad)
- Public alpha: https://fortune-rho-snowy.vercel.app
- Intended domain: `fortunepad.fun` (DNS/HTTPS cutover remains pending)
- Current release handoff: [docs/RELEASE_HANDOFF.md](docs/RELEASE_HANDOFF.md)
