# Operator character provenance recheck

This explicit read-only command connects the existing historical character
registry reader to two configured RPC clients. It is part of P02/P03's provenance
foundation, not a public login, creator session, publishing approval or full agent.
It leaves `currentAuthorization: null` and `executionAuthorized: false` even on
success. It never renews a signature's original five-minute import window.

Before network reads, the existing reader opens an existing protected registry
read-only, validates the local policy/project, digest, stored signature recovery
and historical evidence shape. Empty, missing or foreign history fails without
initializing files. The new command requires exactly two distinct read clients.
They must agree at a block 20 behind the lower head, with head gap at most ten
and block age at most 120 seconds. Chain97, reviewed factory code, launch index,
token and stored creator must match; contract/delegated creators remain unsupported.
The recorded historical block must not be newer than that checked block, and
both clients must still report its recorded hash. Current and historical block
hashes and chain IDs are reread. Both providers must report the same checked-block
timestamp as well as number/hash. Malformed or unavailable evidence fails closed.

After awaited reads, the local record and policy must still match the initial
snapshot. A concurrent new revision is preserved and makes the recheck fail.
The operation has a 20-second wall deadline, monotonic host-clock checks and no
internal retry. After any result, including an early provider failure, outstanding
reads cannot start another RPC action when they complete. In-flight requests are
not cancelled by the library; the CLI transport retains its request timeout.
Outstanding reads have no mutation capability. It never
writes registry versions, evidence, clock, a trust flag or quarantine state.

## Explicit invocation

Use a reviewed, protected existing store and policy as described in
CREATOR_CANON_REGISTRY.md. The CLI is disabled unless separately enabled:

```bash
FORTUNE_CHARACTER_RECHECK_ENABLED=true \
FORTUNE_CANON_READ_RPC_URL=https://<reviewed-provider-one> \
FORTUNE_CANON_SECONDARY_RPC_URL=https://<reviewed-provider-two> \
node --import ./scripts/register-ts.mjs scripts/revalidate-character-record-cli.mjs \
  /protected/canon.sqlite /protected/canon-policy.json <fixed-lowercase-project-token>
```

The CLI requires distinct reviewed HTTPS origins, eight-second per-request
timeouts and no transport retries or redirects. Different origins do not prove
independent providers. Errors are fixed/private-safe and exit nonzero; no provider
exceptions, credentials or filesystem paths are printed. Success includes project,
revision/digest, old and checked block provenance and a host observation time.
It omits profile text, raw signatures and local paths, but is not anonymous.

## Evidence and authority boundary

This is a point-in-time RPC re-observation, not a current authorization decision.
It checks historical block hash consistency; it does **not** replay the factory
calls at that historical block or renew the original signed wording. The original
local acceptance evidence remains trusted history. Height-based calls plus
before/after checks are not EIP-1898 hash-bound calls, independent consensus,
finality, a Merkle proof or protection against inconsistent/temporary ABA replies.

Protected host, files, directories, policy, clock and provider trust remain
operator prerequisites. A privileged host can rewrite/truncate/copy the whole
store; this does not add tamper-proof storage, backups, recovery or a supervisor.
Successful output grants no legal/IP/license/moderation approval, public/model
disclosure permission, wallet or financial authority. Existing Studio, public
canon/API and optional MCP history reader are unchanged and do not invoke it.
No real store, profile, provider configuration, account or service was enabled.

Nine focused test groups use the prior arbitrary r/s/v tuple and assigned
factory/provider fixtures, with real SQLite files and actual disabled CLI process.
They cover expired history, unchanged MAIN database bytes (not all filesystem
metadata), missing/empty/project preflight, disagreement/reorg/stale/code/creator/
token/delegation/chain/head failures, clock rollback, a genuinely hung-client
deadline, a new revision committed during reads, matching-hash/different-timestamp
provider replies, and a delayed client completing after the other client fails.
Actual viem HTTP clients also decode ABI responses from a local HTTP fixture
while checking both historical and current block heights against real SQLite.
These are not successful public RPC/creator-wallet/independent-provider evidence.
