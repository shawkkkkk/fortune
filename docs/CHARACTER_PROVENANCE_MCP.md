# Optional character provenance recheck in local MCP

This connects the existing read-only provenance engine to the local stdio MCP.
It is a partial P02/P03 integration, not a hosted login, creator session or agent.
The existing historical character tool still reads history without RPC and never
becomes current canon. Public canon/snapshot and notebook behavior are preserved.

Default discovery remains two tools/resources. Historical character sharing alone
adds only the existing history reader. A separate explicit switch adds
`get_character_provenance` and `fortune://97/<fixed-token>/character-provenance`:

```text
FORTUNE_PROJECT_MCP_ENABLED=true
FORTUNE_PROJECT_TOKEN=<same lower-case chain-97 Standard token>
FORTUNE_PROJECT_CHARACTER_ENABLED=true
FORTUNE_PROJECT_CHARACTER_DB=/protected/canon.sqlite
FORTUNE_PROJECT_CHARACTER_POLICY=/protected/canon-policy.json
FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED=true
FORTUNE_CANON_READ_RPC_URL=https://<reviewed-read-provider-one>
FORTUNE_CANON_SECONDARY_RPC_URL=https://<reviewed-read-provider-two>
```

Run `node --import ./scripts/register-ts.mjs scripts/project-mcp.mjs`. There is
no HTTP listener or model invocation. Missing history sharing, invalid/missing
storage/policy or invalid RPC origins stop startup with a private-safe error.
Both origins must be HTTPS, distinct and without userinfo/fragments. Existing
protected read credentials may be selected by the operator; no credential is
provisioned, printed or returned to the MCP client. Requests have eight-second
transport limits, no redirects/retries and the engine's twenty-second total
observation limit. In-flight requests are not cancelled, but late completions
cannot start new engine RPC actions after failure/timeout.

The wrapper validates existing storage at startup without network reads or file
creation. It pins literal policy bytes and the fixed paths/token for this process.
Each call requires the same token/policy and invokes the actual engine described
in CHARACTER_PROVENANCE_RECHECK.md, then checks policy bytes again. Clients cannot
choose paths, projects, URLs, revisions or arguments. Policy replacement requires
explicit restart/review. Empty history fails before RPC, rather than initializing
or supplying a substitute record.

Tool/resource reads share the existing four-read-per-minute local quota with all
other readers, including failed reads. No background polling, cache, stored trust,
subscription, automatic fallback or write tool is added. Optional notebook/history
readers may coexist. This quota is process-local, not hosted durable rate limiting.

## Meaning and privacy

Successful output is the existing engine's revision/digest, historical and checked
block provenance, host observation time and observation flags. It omits character
text, raw signatures, database paths and provider URLs. Revision/digest/token and
block/time observations are nevertheless identifiable metadata, not anonymous data.
`currentAuthorization` is **always null** and `executionAuthorized` **always false**.
Expired import signatures are never renewed, and no success is persisted to history.
A failed recheck does not make later history reads current or trusted.

Enable only with permission to share these observations with the selected MCP
client and any connected model, as well as the existing separate permission to
share plaintext history. Local storage approval does not authorize public/model
provider disclosure. No real profile, store, provider configuration, MCP client,
model or hosted service was enabled by this change.

Two configured clients/origins are not proof of independent providers. Height
reads and before/after checks are not EIP-1898 hash-bound calls, finality, consensus
or protection against temporary inconsistent replies. Historical block hashes
are rechecked, not original historical factory calls. Host/files/policy/clock and
providers remain trusted. There is no current creator/IP/license/moderation,
publication, wallet or financial authority. Smart-account support, live creator
approval evidence, hosted identity/privacy/quotas and durable operations remain
separate prerequisites; this does not complete full agent/testnet readiness.

## Verification boundary

Five regression groups cover default absence/separate opt-in, shared quotas,
fixed project/path isolation, startup-pinned policy, missing storage, failed
rechecks with preserved historical unknown authorization, CLI privacy and invalid
origins. An actual stdio subprocess calls the real engine through viem HTTP/ABI
and real read-only SQLite. Two synthetic HTTPS origins are rewritten by a
**test-only preload** to one loopback HTTP fixture; production never imports that
preload. The block timestamp is shared across fixture responses to avoid inventing
inconsistent headers. MAIN SQLite bytes stay unchanged (not all filesystem metadata).

The history uses the prior arbitrary valid r/s/v tuple with fixture providers
assigned its recovered creator. No key, account or signing operation is used.
These are local integration fixtures, not real creator approval, successful public
RPC revalidation, independent-provider/finality, hosted service or model evidence.
