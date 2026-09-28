# Fortune product specification

## Positioning

**Fortune — Meme coins, paired with the BNB economy.**

The three promises are **no dumping**, **holders get paid**, and **pair with anything**. Each requires an actual onchain implementation and eligibility policy before it can be advertised as active. Standard is a frozen, WBNB-only mainnet candidate and has no holder rewards. Burn + Rewards v2, multiple pairs, and arbitrary BEP-20 support remain separately gated.

The product follows LESGO's short launch path and candid lifecycle/trust documentation while adapting the implementation to BNB Chain. Sender informs compatibility checks and direct holder claims; its no-migration pool design is a different architecture from Fortune's frozen Standard curve.

Brew is the direct BNB competitor. Use [BREW_REVIEW.md](BREW_REVIEW.md) for its feature comparison and the actual Fortune gaps. Direct pair-asset holder rewards are the v2 target; buyback-and-burn must never be labeled a wallet payout. Keep the interface simple as capabilities expand.

The owner's LESGO / GO reference also informs [platform revenue recirculation](PLATFORM_REVENUE.md). This is a separately gated proposal funded only from earned protocol allocations; it cannot spend holder liabilities or launch liquidity. No Fortune platform-token CA or recirculation percentage is established by the current release.

Fortune's longer-term research combines:

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
Name, ticker, square image, description and optional project links. File selection/preview and an optional authenticated IPFS upload integration are implemented in the creator-flow branch; hosting must be configured and verified before uploads work. Public URL/IPFS input remains available. Custom metadata JSON import copies supported fields into the frozen onchain record, not a metadata-URI override. See `CREATOR_FLOW.md` for exact behavior and activation prerequisites.

### 2. Launch type
Standard or Burn + Rewards. V2 stays disabled until its hook, accounting, fork tests, audit and release gate pass.

### 3. Pair asset
Select only from the live onchain approved registry. Mainnet v1 is pinned to WBNB. Expand to stablecoins, BTCB/ETH, BNB majors, DeFi, eligible RWAs and compatibility-checked BEP-20 assets in separate releases.

### 4. Optional first buy
Show the quote amount, approve if needed, simulate output and enforce a meaningful minimum. Disclose the first-five-second Launch Shield impact.

### 5. Review and launch
Show fixed token, description, links, pair, fee and liquidity terms before signature. Standard defaults to immutable display metadata. Put supply, price slope and graduation target in Advanced. Save/restore/delete browser-local drafts without persisting wallet authority or review consent; unuploaded files are not included.

## Trading

The market page is where holders trade, from the first block to PancakeSwap:

- **BNB in and out.** On a WBNB-paired launch, buys wrap only the BNB the trade needs and sales unwrap what they return. A buy that reaches the graduation target is filled up to the target and the refund comes back as BNB. Wrapping and unwrapping are separate wallet steps, so a failed unwrap never undoes a trade.
- **Quote first.** Every trade shows what you receive, the minimum at your slippage, the average price and its distance from spot, the trading fee, any Launch Shield tax and any graduation refund. The minimum is re-quoted right before signing.
- **Exact approvals.** Approvals cover the amount of the trade being signed, never an unlimited allowance.
- **Launch Shield in the open.** During the first five seconds the page counts the shield tax down to zero and requires an explicit "buy anyway" before a taxed buy; during the first fifteen seconds it shows how much of the 2% early wallet cap is left and blocks buys over it.
- **Exact results.** Fills, refunds, sale proceeds and rescue payouts are read from the transaction's own events, not inferred from balance changes, so a creator trading their own launch never sees creator fees reported as a refund.
- **After graduation.** The launch's permanently locked Pancake V3 pool trades on the same page, quoted by PancakeSwap's QuoterV2 and routed through its SwapRouter, with BNB in and out. A link opens the same pair on PancakeSwap.
- **Graduation that actually graduates.** The factory catches a failed migration so it stays retryable, which makes wallet gas estimates stop where the migration runs out of gas. The page simulates and sends an explicit per-pool gas limit (`lib/graduation-gas.ts`) and reports success only when `GraduationFinalized` is emitted.
- **Rescue.** If a launch reaches its target but cannot graduate for seven days, anyone can open rescue from the market page and every holder can redeem a pro-rata share of the reserve, paid out in BNB for WBNB reserves.

## Holder Shield

Token and market pages answer "who launched it and who holds it" with facts, not verdicts:

- **Creator check.** The creator's Fortune launch record, what they hold now and every transfer of the token out of their wallet since launch, with the covered block range stated when the log provider cannot reach back that far.
- **Holders.** The holder count, the top ten with their share of supply, tagged Creator or First 15 s, from Fortune's own holder index (`docs/HOLDER_INDEX.md`). Protocol addresses (the curve, official pools, Fortune vaults, burn addresses) are not holders and are left out.
- **The opening window.** How much the first 15 seconds of buyers took, how many wallets they used, the Launch Shield tax they paid, and how much they still hold.
- **Graduating soon.** Explore ranks active curves by how close they are to graduation.

When the index cannot vouch for a launch's numbers (it started after the launch, or its log history has a hole it cannot prove closed) the panel shows nothing or says the data is paused.

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
