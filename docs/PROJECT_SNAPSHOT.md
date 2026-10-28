# Same-block project snapshot

This extends the read-only project MCP foundation with actual curve-state data.
`GET /api/public/v1/tokens/<token>/project` supports the reviewed BSC Testnet
Standard factory only. It reads the registered launch and token/curve fields at
one catalog block, then reads registry metadata at that exact block/hash. Existing
readers recheck chain identity and block hash. The endpoint validates the joined
token/factory/creator/block binding and never returns a partial substituted result.
Wrong/missing metadata, unsupported launch/network or RPC inconsistency fails.

The MCP subprocess now advertises `get_project_snapshot` and resource
`fortune://97/<token>/snapshot`, alongside the original canon tool/resource.
Existing setup in PROJECT_MCP.md is unchanged. Both use the same process-bound
token, shared four-read local quota, 32 KiB HTTP body limit
and fixed public Fortune origin. Snapshot reads have a 30 second total abort deadline;
original canon reads retain their 10 second deadline. Unknown arguments cannot switch projects or
provide URLs. API timestamps limit response age only, not block age/finality.
The MCP consumer validates API attestations, not independent client RPC evidence.

The new projection returns canon plus phase, curve, total supply (Standard's
18 decimals), curve reference price, curve-accounted reserve and graduation target.
Decimal strings remain exact; unsigned fixed18 values reject exponents, overflow
and excess precision. Token/factory/creator/block/hash must match metadata.
After graduation or rescue the curve reference price is **null**, even though the
old curve may retain a stored price. It is never presented as a current pool price
or executable quote. Curve reserve USD is contract/oracle accounting, not treasury
balance, cash payout or LP TVL. Unknown phases fail instead of defaulting to Curve.
No market cap, volume, holders, treasury, profit or trade quote is inferred.
Creator text remains untrusted. Character/license fields remain unspecified;
local Studio drafts cannot overwrite this API/registry provenance.

This is neither a complete analytics index nor an autonomous financial engine.
It does not add wallet authority, new contracts, signing, trading, publishing,
audits, legal approval or a mainnet capability. Provider/oracle health, finality,
independent-provider verification, complete analytics and release gates remain.

Tests cover common-block/identity mismatches, decimals/overflow, retired/unknown
phases, unavailable fields, fixed bounded HTTP transport, tool/resource discovery,
shared quotas and private-safe failures. Existing canon stdio/CLI regressions stay
in place. A local direct API read took 17.1 seconds and passed binding validation; the initial
10 second snapshot-client budget aborted before it completed. The new snapshot-only
budget is 30 seconds with no retry/substitution; canon bounds and release gates do
not change. Runtime integration uses the actual API and existing RPC readers; any
local injected transport is disclosed as a fixture, not a deployed provider.
Existing server RPC fallback behavior is unchanged; the no-retry setting above
describes the new HTTP consumer.

The retained local rehearsal passed at BSC Testnet block139360814/hash
`0x27d740f26aa0f41ef486d66dcd612bc766d75f1484f892f14cbcfe286e5219bd`:
actual local production API, real upstream RPC, MCP handler tool/resource reads,
same-block binding and hidden retired price. This uses a local HTTP-origin rewrite
fixture and in-process protocol handler, not a hosted MCP service or independent
public providers. CI runs the same rehearsal and retains its count/provenance JSON.
