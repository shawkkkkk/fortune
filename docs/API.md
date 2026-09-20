# Fortune Public API

Base path:

```
/api/public/v1
```

The public API is designed around the failure modes that matter most to a
launchpad:

1. incorrect launch/pool configuration;
2. silent asset incompatibility;
3. ambiguous transaction retries;
4. API/provider outages during traffic spikes;
5. market data disagreeing with onchain state.

## Principles

### No API key for public reads

Discovery, market data, protocol configuration and launch preflight are public.

Private keys never belong in an API request.

### Chain state is authoritative

The production indexer is a performance layer, not the source of truth.

When API/indexer state and chain state disagree, clients should surface the
disagreement and fall back to verified onchain state.

### Preview -> preflight -> sign -> confirm

Fortune separates four stages:

1. **Preview** — normalize and validate a user's intended configuration.
2. **Runtime preflight** — verify current registry/oracle/pool conditions.
3. **Wallet signature** — the user signs locally.
4. **Confirmation** — resolve the transaction from chain state.

A timeout at stage 4 must never automatically create a second transaction.

### Static launchability is not runtime readiness

`GET /pairs` exposes:
- exact BSC contract;
- quote capability;
- reward capability;
- graduation capability;
- static launchability;
- machine-readable reason codes;
- checks still required at runtime.

A production prepare flow must re-check oracle freshness, token behavior and
graduation-adapter readiness at the target block.

### Stable error codes

Clients branch on:
- `invalid_request`
- `forbidden`
- `not_found`
- `conflict`
- `rate_limited`
- `dependency_unavailable`
- `protocol_not_configured`
- `preflight_failed`
- `internal`

Human messages may evolve; error codes should not.

### Cursor pagination

Collection endpoints use opaque cursors rather than page numbers so fast-moving
launch lists do not shift items between numbered pages as easily.

## Current endpoints

### GET /meta

Describes API and protocol capabilities.

### GET /protocol

Canonical client configuration:
- chain;
- factory deployment state;
- Fortune `fe` token suffix;
- Launch Shield parameters;
- fee limits;
- graduation guarantees.

Clients should read this instead of hardcoding launchpad switches.

### GET /assets

Asset Registry catalog.

Filters:
- `q`
- `category`
- `capability`
- `launchable`
- `cursor`
- `limit`

### GET /pairs

Quote-asset view of the registry.

Each row explicitly distinguishes static readiness from runtime checks.

### GET /stocks

Discovers BSC stock-token representations from supported provider metadata.

A returned `pairableCandidate` means the API resolved a real active BSC representation; it does **not** bypass Fortune Asset Registry, oracle, compatibility or product-eligibility gates.

### POST /launches/preview

Validates:
- token identity;
- 1–5 quote assets;
- exact 10,000-bps basket weights;
- primary quote membership;
- quote/graduation capabilities;
- total normal trade fee <= 5%;
- reward asset capability;
- launch-engine-specific constraints.

It also returns Fortune's immutable protocol terms:
- `0xfe` suffix;
- fixed supply / no post-launch mint;
- Launch Shield;
- atomic graduation;
- retryable graduation;
- chart anchor.

The returned `previewId` is an API configuration fingerprint and **not** the
onchain manifest hash.

### GET /transactions/{hash}

Resolves a transaction directly from the configured BSC RPC and returns one of:
- `not_found`
- `pending`
- `confirmed`
- `reverted`

The endpoint deliberately returns `safeToBlindlyResubmit: false` in every state. A not-found transaction still requires nonce/propagation recovery before another signed transaction is created.

### GET /tokens
### GET /tokens/{id}
### GET /launches
### GET /stats
### GET /automations
### GET /revenue

These currently expose clearly labelled demo data until the onchain indexer is
connected.

Production versions must derive claims from chain events.

## High-load design

Public reads should be served through CDN/cache whenever freshness permits.

The API layer must fan in calls to external providers rather than causing every
browser to independently query CoinGecko, Nasdaq, xStocks, Binance RWA or
Lighter.

Writes should be isolated from heavy analytics/forum traffic.

See `docs/RELIABILITY.md`.

## Pool and chart health

Production token responses should include explicit fields for:

- curve active;
- graduation ready;
- preflight failed;
- graduation retrying;
- pool created;
- liquidity verified;
- price continuity checked;
- indexer ready;
- trading live.

A pool address alone must never be sufficient for `trading_live`.

The chart uses the onchain graduation anchor to join curve and AMM phases.

## Fees

Fortune routes normal fees onchain as trades occur. It does not need a
platform-custodied creator-fee claim system for the standard creator route.

Purpose-locked automation vaults handle holder rewards, buybacks and liquidity
reinforcement. Their execution state should be observable through public API
endpoints.

Launch Shield tax is accounted separately from normal trading fees and should
never be reported as creator revenue or organic curve buy pressure.

## OpenAPI

```
GET /api/public/v1/openapi
```

The OpenAPI document is intentionally useful before the production indexer is
online; demo-backed endpoints identify their data mode in response metadata.
