# Creator flow — 2026-09-25 review branch

This is implementation documentation, not evidence that the branch is live or
that any mainnet gate has passed. It preserves the frozen Standard candidate.

## Available in this change

- Description, website, X and Telegram are visible under Token identity.
  GitHub, YouTube and DeBox are under More project links, not economic settings.
- Ticker capitalization is preserved. Validation uses Solidity UTF-8 byte limits
  (64 name, 16 ticker, 4096 description, 512 per URI), including Chinese/emoji.
  Invalid fields fail before a launch signature; descriptions are not truncated.
- PNG/JPEG/WebP file selection, drag/drop and a local preview; an optional
  authenticated IPFS upload integration, with URL/IPFS fallback.
- Custom metadata **import**, not a URI override: the browser reads bounded JSON
  over HTTPS/IPFS, previews it, and applies explicitly supported identity fields
  only. `image`, `external_url`, `extensions.twitter` and `extensions.telegram`
  aliases are supported. Economic fields and permissions are never imported.
  HTTPS hosts must allow CORS; arbitrary URLs are not fetched by the server.
- Save/restore/delete a browser-local, versioned draft scoped to chain and
  factory. Restore never recovers wallet authority, review approval, upload
  signature or pending-transaction state. The saved pair is rechecked against
  the live form snapshot. Unuploaded files are not saved. No cloud sync claim.
- Pair categories and Any token **inspection**. Selectability comes from the
  active onchain registry, oracle health and chain-56 WBNB restriction. Static
  catalog entries cannot grant eligibility. Discovery entries remain disabled.
- A Standard token's About this project section reads the actual metadata
  registry, verifies factory/creator binding at the catalog block, and exposes
  block evidence. Unsafe links are omitted; creator content is not an endorsement.

## The metadata distinction

FortuneFactory's frozen ABI has separate metadata fields and no `metadataURI`
parameter. Importing JSON copies its supported fields into the frozen onchain
record. The source JSON URI itself is **not** committed to the token. Changing
that JSON later does not update the copied fields. An image HTTP URL can still
serve changing content; an IPFS CID fixes bytes but requires continued pinning.

The public metadata envelope is `/api/public/v1/tokens/{token}/metadata` and
includes source registry, creator, revision/frozen state and block number/hash.
This does not claim automatic image support in every BEP-20 wallet or explorer.

## Connecting file uploads

Uploads are off by default. To enable the integration, the owner/operator must
configure these **server-only** variables in the deployment environment:

```
FORTUNE_UPLOADS_ENABLED=true
PINATA_JWT=<scoped file-pinning credential>
UPSTASH_REDIS_REST_URL=<database HTTPS endpoint>
UPSTASH_REDIS_REST_TOKEN=<write-capable database REST credential>
```

Never paste credentials into chat or use NEXT_PUBLIC for these variables.
No accounts or paid services were provisioned by this change.

Implementation uses the existing lockfile's Next.js-provided Sharp dependency;
no frozen dependency manifest is changed. Hosts must install native Sharp.

Protection and operational boundaries:

1. Same-origin multipart request; actual streamed body/file limits.
2. A five-minute EIP-191 signature binds origin, wallet, exact file SHA-256 and
   issuance time. No chain transaction/approval is signed. Current support is
   EOA message signing, not an EIP-1271 smart-wallet authentication promise.
3. Atomic Redis replay reservation and quotas: 10 attempts per wallet/hour and
   250 globally/day. Failures count, and resetting the process cannot reset
   quotas. Wallet limits alone are not Sybil resistance; the global ceiling
   bounds storage spending. Provider/Redis errors fail closed.
4. Full image decoding, square/pixel limit, rejection of animation/SVG, EXIF
   stripping and normalized WebP up to 1024 pixels. The original filename is
   never used as a storage path.
5. Pin at the fixed Pinata endpoint, validate returned CID, retrieve from its
   fixed public gateway and verify the normalized SHA-256 before returning a
   launchable URI. Nothing is stored as a data/blob URI in the contract.

Before enabling production uploads: set provider spending limits, establish
retention/backup pins and an abuse-reporting policy, configure perimeter request
limits, verify a real upload/retrieval, replay rejection, quota failure and
provider outage, then check that no credential is in browser traffic. Current
mocked integration tests do not substitute for this operator verification.

References: [Pinata file pinning](https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-file-to-ipfs),
[Upstash REST commands](https://upstash.com/docs/redis/features/restapi),
[Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/).

## Not enabled by this work

Dev Launch is a proposed separate fee model, not a functioning third engine.
Burn + Rewards v2 remains isolated research. Two-to-five-pool launching and
unrestricted arbitrary-token reserves remain outside Standard mainnet v1.
The research `/launches/preview` endpoint cannot authorize a transaction;
`prepare.ready` stays false. A static catalog is never launch permission.

## Next product advantages to prove

1. Pair evidence cards: exact issuer/address, transfer restrictions, oracle
   source/age, real graduation liquidity, and explicit rejection reasons.
2. Reward receipts and direct pair-asset claims even when keepers are offline.
   Token-side fee inventory must have a burn-only exit; protocol buybacks have
   a separate allocation and cannot consume holder liabilities or LP reserves.
3. A reviewed multi-pool launch plan with distinct pairs, integer weights
   totaling 10,000 bps, complete-plan gas/liquidity simulations, atomicity or a
   precisely specified partial-state recovery path, and a per-pool public ledger.
4. A separately versioned creator-fee engine with immutable fee destinations.
   LESGO's Raydium/Meteora mechanics and fee rates are not BSC implementations.

The owner's screenshots/documentation establish UX targets, not audited
competitor behavior or evidence of Fortune feature parity. No speculative
valuation, guaranteed returns, official Fortune CA or "rug-proof" claim.
