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
