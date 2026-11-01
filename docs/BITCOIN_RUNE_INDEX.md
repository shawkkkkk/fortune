# Read-only Bitcoin Rune index observation (M05)

This is a separately disabled operator integration, not Fortune Rune issuance,
Bitcoin wallet/custody, transaction validation, bridge backing or a launch mode.
No financial engine is activated. BTCB pairs remain unrelated to Rune backing.

The adapter reads one Rune ID (`block:transaction-index`) from the fixed HTTPS
`ordinals.com/rune/<ID>` JSON API. Its configured network label is Bitcoin
mainnet; the response does not independently establish that network, index tip,
block hash, confirmations or freshness. All related verification flags are false.
It does not use an EVM chain ID, caller URL, arbitrary project, redirects, retry,
credentials, wallet, key, signing, broadcast, fee estimation or paid service.

## Upstream contract

Reviewed upstream ord commit `b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414`:

- [API handbook](https://docs.ordinals.com/guides/api.html), Rune JSON endpoint.
- [Server handler](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/src/subcommand/server.rs), Rune-ID lookup and JSON response.
- [Response template](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/src/templates/rune.rs).
- [Index entry types](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/src/index/entry.rs), [Rune ID](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/rune_id.rs) and [divisibility bound](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/etching.rs).

These references pin the reviewed schema; they do not prove the remote service
runs this commit or certify its index. Schema drift fails closed. The API's
special Rune `1:0` may label the etching with an all-zero transaction hash;
this remains a label, never verified transaction inclusion.

## Bounds and interpretation

Only canonical u64-block/u32-index IDs are accepted (`0` block requires `0`
index). Entry block and response ID must match the requested ID. Numeric JSON
source lexemes are converted directly to BigInt before projection, avoiding
IEEE-754 precision loss for u128 counts/terms. JSON numeric-source context is
required (tested on Node24.22.1); unsupported runtimes reject rather than fall
back to rounded numbers. Signed, fractional, exponent, overflowing or quoted
numeric quantities reject. Output integers are exact decimal strings. Name
encoding is bounded to u128, divisibility to38, and terms to typed optional pairs.
Symbol/name are untrusted labels, not instructions. Unknown fields are omitted;
no links, parent content or creator text are fetched.

One shared real ten-second rejecting wall timer and monotonic safe nonnegative
host clock fence each fetch/chunk await and completion. Declared and actual
body sizes are limited to32KiB; MIME, strict UTF-8/JSON and schema must pass.
Every outcome requests abort/cancellation without awaiting stuck cancellation;
late responses cannot start body reads and late chunks cannot start further
reads or return data. In-flight work may continue; host event-loop scheduling
limits timers. No claim of independently fresh or canonical source data follows.

Premine, mints, burned and terms are raw index reports. No supply total, supply
conservation, balance, backing, market price, holder count or mint permission is
inferred. The index's mintable boolean is explicitly `indexReportedMintable`,
not a transaction quote, eligibility verdict or execution approval. Local
observation time is not an index-tip or historical-block freshness certificate.

## Operator use

```
FORTUNE_RUNE_INDEX_READ_ENABLED=true node --import ./scripts/register-ts.mjs scripts/inspect-rune-index.mjs 1:0
```

Default-disabled and invalid input exit nonzero before any request. Exactly one
read is attempted; failures print a generic message, without provider payloads.
There is no persistent config, file store, public API, UI, MCP/model disclosure,
indexing service or automatic scheduler. Do not enable real data sharing with a
model or public service without the separate privacy/auth/quotas review.

Tests exercise exact large numeric tokens, malformed bindings/types/limits,
request guards, mock and real timer failures, late completion fences and an
actual child CLI → fixed-path adapter → loopback HTTP fixture. One local fixture
is not an independently operated Bitcoin node/indexer or live-service evidence.
Public availability, source identity/version, independent provider reconciliation,
Bitcoin transaction/header/Runestone verification, reorg/finality handling,
name/fee/commit/reveal rules, real etching, signer/custody, bridge liabilities,
asset/legal/governance/security/recovery/operations and audit remain separate.
Nothing here completes M05 or authorizes deployment, custody, bridge or mainnet.

## Stream allocation bound

The actual index reader retains at most 4,096 non-final response chunks,
including empty chunks, and rejects before retaining chunk 4,097 or projecting
its JSON. This independently bounds array entries alongside the existing
32 KiB declared/actual byte limit. Transport fragmentation can therefore make
an otherwise small, valid response unavailable. This does not bound upstream
buffering, total process memory or event-loop latency. The fixed origin, request
guards, exact integer parsing, ten-second wall deadline, monotonic clock, late
work fences and best-effort non-awaited cancellation remain unchanged.

Empty/tiny over-fragmented regressions accepted on unchanged source, then reject
with cleanup after the bound. Exactly 4,096 non-final chunks remain supported;
existing actual child-CLI/loopback HTTP tests still exercise the adapter. These
are local transport tests, not a successful public index observation or Bitcoin
network, issuance, custody, bridge or full M05 readiness evidence.
