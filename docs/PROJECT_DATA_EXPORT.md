# Public project-data download (P23)

`GET /api/public/v1/tokens/<token>/project/export` downloads a JSON attachment
through the existing actual Standard chain97 project snapshot reader. All its
factory/token/creator/block binding and400/403/404/503 errors are preserved.
No separate provider, caller URL, wallet, write, authentication session or model
is added. Existing JSON snapshot responses are unchanged. See the public OpenAPI
entry and PROJECT_MCP.md for the underlying reader's scope.

The attachment filename uses only the validated lowercase token address, with
application/json, no-store and nosniff headers. It contains schema1,
kind fortune-project-data-export, payloadUtf8, SHA-256 and explicit authority
limitations. Decode the outer JSON, then hash the exact UTF-8 bytes of its
payloadUtf8 **string**, without parsing/reformatting that string first. This
avoids reliance on object-key order or a particular JSON serializer for checksum
verification. The string can then be parsed as JSON for inspection.

The payload is limited to16KiB and includes the fixed official source URL,
API timestamp, same-block market/provenance and static limitations. Addresses,
block references and exact decimal values are preserved. No creator name, symbol,
description, artwork, external links, character profile or unknown upstream
fields are exported. Market cap, volume, holder count, treasury and executable
quote remain null; retired curve reference prices remain null. Curve-accounted
USD is not cash, LP TVL, market valuation or distributable treasury capital.
The API timestamp is response age, not block freshness or finality. Download
requests can observe a different block than a preceding snapshot request.

SHA-256 identifies bytes only. Anyone can rewrite the payload and recompute it;
it is not a signature, source authentication, an independent record or audit.
sourceAuthenticated, independentRpcVerified, finalityVerified and
executionAuthorized are always false; currentAuthorization is null. The fixed
source URL is an attribution label, not proof that a downloaded file came from
Fortune. Old downloads never renew authorization or become current evidence.

Tests cover all phases, exact decimals, checksum reproducibility, prose omission,
unknowns and malformed/stale/foreign source bindings. The existing actual
production API/RPC/MCP runtime rehearsal now downloads the attachment, checks its
headers/digest/whitelist and invalid/unregistered-token errors, and records the
export's own block/hash/digest separately. That is component/API evidence, not
independent provider consensus, a complete event ledger or full P23 readiness.
API keys, durable quotas/plans, hosted auth, production indexing and incident
operations retain their separate gates. Existing frozen Standard, root pins,
economics, financial authority and all release gates remain unchanged.

## Inspect a downloaded attachment locally

The separately disabled `scripts/inspect-project-export.mjs` consumes one existing
regular local JSON file and an expected project token address:

```bash
FORTUNE_PROJECT_EXPORT_INSPECT_ENABLED=true node --import ./scripts/register-ts.mjs scripts/inspect-project-export.mjs /path/to/download.json 0x1111111111111111111111111111111111111111
```

The example address is a placeholder, not a Fortune CA. Use the exact project
address requested for the download. No URLs, network calls, file writes, keys,
signatures, wallet actions, posting, model calls or new public service are added.
The file reader stops at64KiB plus one byte and requires strict UTF-8 JSON;
errors are generic and disclose neither paths nor file contents. The inspector
requires the existing schema/version/kind/encoding/hash algorithm, a maximum16KiB
payload string with lossless UTF-8 representation, and an exact SHA-256 match.
Unknown envelope/payload/market keys reject. Fixed chain97/factory/expected token,
nonzero hash, uint64 block number, phase/status, Standard18-decimal uint256 values,
retired null price and unavailable analytics/treasury fields are checked.

Only whitelisted typed values and the inspector's own limitations are emitted.
Input integrity/limitations prose is never copied or followed; source URLs must
match the fixed project API label and are not fetched. An attacker can still
rewrite supported values and recompute the checksum. This is byte/schema
consistency, never source authentication or verification of those values.

Historical exports are allowed. `storedApiTimestamp` is preserved; inspection
never refreshes it. `apiResponseAgeMs` uses the local host clock and may be up to
five seconds negative for allowed clock skew. Invalid/negative/future timestamps
outside that skew reject. Neither response age nor a timestamp label proves
block freshness, canonicality, finality, source identity or historical completeness.
`sourceAuthenticated`, `independentRpcVerified`, `finalityVerified`,
`currentCanonicalityVerified`, `executionAuthorized` and `fullApiReadiness` remain
false; `currentAuthorization` remains null. No eligibility or financial decision
should be authorized from a checksum match. JSON parsing is not a consensus or
canonical JSON implementation. Existing exporter/endpoints remain unchanged.
