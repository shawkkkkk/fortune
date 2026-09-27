# Stock pairing architecture

Fortune treats a stock ticker and an onchain stock token as two different objects.

## Direct-pair flow

```
NASDAQ ticker
  -> verify the real listed underlying
  -> read current last-sale price
  -> if < $5, classify under NASDAQ Penny Stocks
  -> search recognized BNB tokenized-stock providers
  -> resolve the exact BSC token contract / current xStocks wrapper
  -> check provider halt state + Fortune eligibility
  -> Fortune Asset Registry capability
  -> selectable as a quote asset
```

A ticker alone is never enough.

## Providers

Fortune's resolver is designed around actual BNB representations:

- xStocks public asset metadata; use the **current non-rebasing wrapper** for AMM/DeFi pairing.
- Ondo Global Markets tokenized stocks discovered through Binance Web3 RWA Data.
- bStocks discovered through Binance Web3 RWA Data.

Binance Web3 RWA Data credentials are optional server-side settings. Without them, xStocks discovery still works and the UI clearly reports when broader provider search is unavailable.

## NASDAQ Penny Stocks

The dedicated launch category accepts arbitrary ticker input.

The UI verifies:
- NASDAQ listing status;
- observed last-sale price;
- provider-backed BSC representation;
- stock-token market status.

The category uses a sub-$5 last-sale price as its UI definition of a penny stock. A stock above that threshold can still be available elsewhere in Fortune's stock-token catalog.

## Penny stocks tab

The pair picker (`/launch` and `/assets`) has a **Penny stocks** tab: companies whose tokenized share on BNB Smart Chain trades under $5, most traded first (`isPennyStock` in `lib/pair-reasons.ts`). Leveraged and inverse funds, ETFs and Ondo's managed portfolios are excluded. On 2026-09-27 that was 22 companies, including AMC Entertainment (Ondo), GoPro (bStocks), Hertz, Plug Power, Opendoor, BigBear.ai, NIO and Grab. They show why they are not launchable yet: they live on BNB Smart Chain mainnet, and tokenized securities are outside the mainnet v1 asset policy.

## Counterfeit stock tokens

`lib/stock-identity.ts` checks every token the pair inspector sees against the verified stock-token contracts in `data/pair-universe.json`:

| Result | When | Inspector |
| --- | --- | --- |
| Verified | The address is an issuer contract on BNB Smart Chain | `VERIFIED_STOCK_TOKEN` (info) |
| Imitation | Same symbol as a verified stock token (e.g. a second `GPROB`), stock-token wording (`xStock`, `bStock`, `Stock Token`, `(Ondo Tokenized)`, `Tokenized stock`), or a listed company's name together with its ticker | `IMITATES_STOCK_TOKEN` (block), naming the verified contract |
| Overlap | Only the company name, or a company ticker of three or more letters | `SHARES_STOCK_NAME` (warning) |

On any chain but BNB Smart Chain mainnet (including BSC Testnet) nothing can be a verified stock token, so anything posing as one is blocked. Across the 665 tokens in the pair universe the rules flag no crypto asset.

Why: in September 2026 a memecoin (JINQIAN) was paired on Robinhood Chain with a token presented as tokenized Farmmi that one wallet had minted in full and kept repricing; the real Nasdaq stock rose as much as 350% and fell back within hours. On Long.xyz, where memecoins may only pair with official Robinhood Stock Tokens, a memecoin paired with tokenized AMC drew a public objection from AMC's chief executive, who called the stock tokens a "pseudo-fake market" and threatened an SEC complaint. Fortune pairs only with real issuer tokens, labels them as price exposure rather than shares, and never lets a lookalike stand in for a stock.

## What Fortune does not do

Fortune does not create a BEP-20 with the same ticker as a public company and call it a tokenized stock.

If no recognized tokenized representation exists on BNB Chain, the stock can remain discoverable but it is **not directly pairable**.

A future issuer/tokenization-partner integration could turn an unrepresented ticker into an official stock token, but that is a separate regulated issuance workflow, not a launchpad shortcut.

## Market integrity

Production stock-token integrations should:
- stop or restrict new interactions during issuer/provider asset halts;
- preserve exact contract/provider provenance;
- expose token-to-share structure and attestations where available;
- use independent price feeds;
- enforce geographic/product eligibility;
- never describe a synthetic or same-ticker community token as the underlying equity.

## Pair universe

`/assets` and the launch form's pair picker list every BNB Smart Chain tokenized stock, fund, commodity and pre-IPO token Fortune can identify, next to the majors.

| Source | Provides |
| --- | --- |
| `data/pair-universe.json` | Contract identity. Addresses come from CoinGecko's platform map (bStocks, Ondo Global Markets, xStocks, tokenized gold, top BNB assets) or a named primary source (e.g. CoinMarketCap for Paimon's pPOLY), and are kept only when the contract answers onchain with a matching symbol and readable decimals. The same pass probes issuer controls: upgradeable proxy (EIP-1967 implementation or beacon slot), pause switch (`paused()`), share multiplier (`multiplier()`). |
| CoinGecko, DexScreener | Live price, 24h change, volume, market cap and logos, cached for five minutes. |
| Lighter | Pre-IPO perpetual marks (OpenAI, Anthropic), shown as price references. |
| Fortune Asset Registry | The only source of launchability. |

Refresh identity with `node scripts/refresh-pair-universe.mjs` (behind an HTTPS proxy, set `NODE_USE_ENV_PROXY=1`; it is not an npm script because `package.json` is part of the frozen mainnet fingerprint) and review the diff like any other address change. New listings get a first-seen date and a NEW badge for 21 days.

Every row carries a status and machine-readable reasons:

- `launchable`: in the active registry, oracle healthy, quote and graduation enabled, allowed by the release policy.
- `registered`: in the registry but failing one of those checks.
- `discovery`: `MAINNET_ONLY` (testnet site), `NOT_IN_ACTIVE_REGISTRY`, `RWA_OUT_OF_SCOPE_V1`, `REBASING_NEEDS_WRAPPER` (xStocks share multiplier), `STANDARD_MAINNET_WBNB_ONLY`.
- `reference`: `EXTERNAL_PERP_REFERENCE` or `NOT_ON_BNB_CHAIN`.

Stock rows show the US session (pre-market, open, after hours, closed) from `lib/market-hours.ts`, which embeds the NYSE holiday and early-close calendar through 2027. Extend it each year.

## Pre-IPO tokens

Pre-IPO tokens such as Paimon's pPOLY are issuer-structured SPV claims: indirect economic exposure with no shares, voting, dividend or information rights. OpenAI and Anthropic have said unapproved share transfers to SPVs are void and that tokens selling that exposure may have no value ([CoinDesk, 13 May 2026](https://www.coindesk.com/markets/2026/05/13/anthropic-openai-tokens-plunge-nearly-40-as-ai-firms-warn-spv-transfers-are-invalid)).

Fortune lists these tokens with those statements and never labels them as shares. Pairing one requires registry approval, an independent oracle and legal review of the issuer structure; they are outside mainnet v1.
