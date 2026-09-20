# Tokenized-asset eligibility

Fortune's technical Asset Registry must not be treated as legal eligibility.

## Two gates

### 1. Technical capability

An asset may receive technical capabilities only after review of:

- exact BSC contract;
- token standard / transfer model;
- decimals and balance behavior;
- oracle coverage and freshness;
- liquidity;
- fee-on-transfer / blacklist / rebasing behavior;
- destination-pool compatibility.

### 2. Product eligibility

A technically compatible tokenized security or RWA may still be unavailable for a user, region, launch type or reward program because of issuer terms or applicable law.

The web application therefore needs an eligibility service/policy layer before any production tokenized-equity or pre-IPO integration.

## xStocks

xStocks publishes public asset metadata and chain-specific deployments. EVM xStocks use ERC-20-compatible rebasing behavior. Fortune's live-reserve accounting is designed with this balance behavior in mind, but no xStock receives onchain Fortune capabilities automatically.

Before enabling an xStock:

1. resolve the official BSC deployment from the issuer's public API;
2. verify current trading/availability state;
3. select an appropriate market/oracle source;
4. review issuer terms and relevant regional restrictions;
5. decide whether the rebasing token or an issuer-supported wrapper is more appropriate for LP use.

## PreStocks

As of the current product documentation, PreStocks identifies its products as live on Solana. Fortune does not synthesize BSC versions and does not permit a Solana PreStock ticker to masquerade as a BSC quote asset.

If official BSC deployments are introduced later, they go through both gates above.

## UI requirements

Production Fortune should distinguish:

- **Canonical / verified contract**
- **Fortune technically approved**
- **Available to this user**
- **Unavailable / restricted**
- **Custom / unverified**

A "verified" badge must never imply investment quality, regulatory approval, safety from loss or issuer endorsement of Fortune.


## U.S. listed stocks and microcaps

Fortune may discover a real exchange-listed ticker without treating that ticker as an onchain asset.

For direct pairing, the launch must resolve to an actual BSC tokenized-security contract from a recognized provider and pass the technical + product-eligibility gates above. Fortune does not create synthetic "ticker copies" to fill catalog gaps.

The NASDAQ Microcaps interface is therefore a resolver:

```
NASDAQ ticker
  -> verify underlying
  -> discover BSC tokenized representations
  -> verify provider / structure / oracle / status
  -> Fortune Asset Registry
  -> pairable
```

Low market capitalization or a sub-$5 share price never relaxes these controls. Market halts and provider restrictions should disable new Fortune interactions for the affected stock token.
