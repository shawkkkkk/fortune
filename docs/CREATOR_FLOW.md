# Creator flow — 2026-09-25 review branch

## Bounded shared creator/API body reads (P01/P06/P23)

readLimitedBytes now rejects stalled reads after one real ten-second lifetime,
checks safe nonnegative monotonic host time around every read and final assembly,
and permits at most4096nonfinal fragments including empty chunks. Existing byte
ceilings and declared-length rejection remain. Cancellation is best effort and
never awaited; a non-cooperating stream cannot delay rejection. Pending reads may
continue; ended fences prevent late returned bytes. Event-loop/host-clock trust
remains; this is not a process memory bound or a whole request/Sharp/upload deadline.

Actual consumers are upload ingress before wallet/quota/storage, browser metadata
response bodies and the public asset-check request body. Their authorization,
fixed storage providers, quota, parsing and RPC policies are unchanged. In
particular this does NOT bound the browser metadata fetch before its response,
JSON/form parsing or native Sharp; a valid slow/overfragmented body can now reject.
The upload still maps malformed bodies to400 and the asset checker to400.

Old-source six-group regression:1PASS5FAIL, including real stalled-read and
non-cooperating-cancel hangs, empty/tiny fragments, clock reversal/unsafe clocks,
and actual handleImageUpload ingress rejection with zero provider calls. Test-only
unused provider labels are not real credentials/configuration or creator approval.
Focused controls cover original byte limits and exactly4096valid fragments.
No keys/accounts/signatures/public broadcasts, service activation, economic or
frozen Standard/root dependency changes. Full features and readiness remain gated.

## Bounded image storage and retrieval (P01/P06/P23)

After unchanged enablement/origin/wallet authorization, quota reservation and
Sharp normalization, handleImageUpload now calls the extracted internal
pinAndVerifyTokenImage engine. Its two FIXED HTTPS providers, multipart filename/
WebP/CIDversion1,8192byte pin reply,2MiB retrieval limit and exact SHA256 comparison
are retained. Each stage now has one rejecting wall timer at its ORIGINAL20/10
second budget, safe nonnegative monotonic host-clock fences around fetch/every
read/projection,4096nonfinal chunks including EMPTY and nonawaited best-effort
abort/cancel. Pin JSON is strictUTF8; malformed/late/unsafe provider errors are
private503. No new caller URLs, redirect/retry policy, credentials or enablement.

A pin POST may complete after timeout and quota may already be consumed. Failure
is NOT rollback/nonpublication proof. Inspect existing provider/proof state before
explicit retry; no blind duplicate pin, quota reset/release or renewed wallet
approval. Native Sharp/request-body reading and the whole upload are NOT covered
by a certified overall deadline. Inflight operations/event-loop/host-clock trust
remain. Old wallet verification and quota engine bodies are byte-preserved.

The EXACT old storage body was first extracted without behavior changes for
local comparison (not an old public API/authentication proof):1PASS4FAIL in5groups,
including actual20/10second abort-ignoring fetch/read regressions and strictUTF8/
fragment/private-error rejection. Final6new groups exercise actual storage code,
original byte caps, clock reversal, late-stage fencing and actual Sharp→multipart
POST→localHTTP retrieval/digest. Transport fixtures send no credentials locally;
no accounts/keys/signatures, real provider, paid pinning or real profile were used.
These tests do not establish creator approval, live Redis/IPFS hosting, recovery,
auth sessions, independent providers, fullP01/P06/P23 or audit readiness. Frozen
Standard/root dependencies and all financial/mainnet/privacy gates are unchanged.

## Bounded creator-upload quota reservation (P01/P06/P23)

The ACTUAL authenticated image-upload path now bounds reserveUpload's existing
Redis POST and body decoding with one rejecting five-second wall timer and
safe nonnegative monotonic host-clock checks before/after fetch, every stream
read and result projection. Responses are capped at4096 declared/actual bytes,
4096 nonfinal fragments including empty ones, and strictUTF8 JSON. Hung fetch,
read or cancellation cannot keep the caller pending; abort/cancel are best effort
and not awaited. Inflight operations may still complete, and event-loop/host-clock
trust remains. This is per-reservation, not a whole-upload/native-Sharp deadline.

Original Lua, proof dedup, wallet-hour/global-day keys,10/250 limits and600/3600/
86400 expiries are unchanged. Allowed/replay409/limited429 semantics remain;
invalid/late/unsafe responses return private503. No retry, quota reset or release.
A timeout/error DOES NOT prove Redis did not commit. Inspect existing proof/quota
state before explicit retry; do not blindly replay a write or renew authorization.
Wallet proof, file normalization, pin/retrieval and enablement gates are unchanged.
No credentials, keys, signing, paid provider call, public configuration or service
enablement was used. Tests call the ACTUAL reservation engine: ignored abort,
hung body/noncooperating cancel, byte/fragment/UTF8 bounds, unsafe/reversed clocks,
old result/key controls and a credential-free localHTTP EVAL roundtrip.
Four groups failed old source (first5group run); final6groups cover the fix.
Fixtures are not liveRedis/pinning/creator approval/hosting/auth-session/recovery
or fullP01/P06/P23 readiness. Frozen Standard/root pins and all gates remain.

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

## Verification boundaries

`tests/e2e/creator-flow.mjs` exercises the production app in isolated Chromium
profiles at desktop and mobile widths. The CI browser runner is installed
outside the frozen package manifests. It verifies visible fields, case-preserving
draft restore/delete, review invalidation, non-persistence of local files,
upload-disabled behavior, explicit metadata import, rejected pair handling,
UTF-8 limits, horizontal layout and unhandled browser errors. Screenshots are
retained as CI artifacts for seven days.

These UI tests use clearly scoped localhost asset/metadata fixtures and submit
no wallet transactions or real uploads. They do not prove chain compatibility,
real Pinata/Redis operation, an audit, or mainnet readiness. The separate
contract suite and live fork rehearsal remain necessary.

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

## Share-card artwork read lifetime

The existing trusted-IPFS-gateway raster reader now returns its null/monogram
fallback at a real three-second deadline, including noncooperating fetch/body
reads. Before/after read fences prevent late responses from accessing the body,
late chunks from starting further reads, and completed reads from returning after
expiry. Unsafe, negative or backwards host clocks also fall back. All outcomes
clear the timer and request abort/cancellation without awaiting cancellation;
in-flight transport may continue and host event-loop scheduling limits timers.

The fixed gateway, refusal of arbitrary creator HTTP hosts/redirects, PNG/JPEG
MIME and signature checks, 1.5 MB byte limit and 4,096-chunk bound remain. These
checks are not full image-codec validation or a gateway availability guarantee.
Tests include an actual loopback HTTP byte read plus simulated/noncooperating
transports; they do not certify the public gateway. No upload hosting, credentials,
model/media generation, public publishing or financial authority is enabled.
