# Optional historical character records in local MCP

The existing local project MCP can now read the latest operator-selected character
record from the registry described in CREATOR_CANON_REGISTRY.md. This is a real
stdio → read-only SQLite integration, not public canon, a hosted endpoint or a
current creator session. Existing `get_project_canon` and `get_project_snapshot`
behavior is preserved; their character fields are never filled from this store.

Default discovery remains the existing two tools/resources. To explicitly share
one project's stored character text with an MCP client, set these additional
process variables alongside the existing project MCP configuration:

```text
FORTUNE_PROJECT_MCP_ENABLED=true
FORTUNE_PROJECT_TOKEN=<same chain-97 Standard project token>
FORTUNE_PROJECT_CHARACTER_ENABLED=true
FORTUNE_PROJECT_CHARACTER_DB=/protected/canon.sqlite
FORTUNE_PROJECT_CHARACTER_POLICY=/protected/canon-policy.json
```

Run the existing `node --import ./scripts/register-ts.mjs scripts/project-mcp.mjs`.
This adds `get_character_record` (empty arguments only) and the resource
`fortune://97/<token>/character-record`. The client cannot choose a file, policy,
project, revision or URL. Both share the existing four reads/minute quota with
canon/snapshot reads. Explicitly enabling invalid/missing configuration stops
startup; per-read errors are private-safe. No missing database is initialized.

**Privacy:** opt in only if authorized to disclose these plaintext character fields
to the selected MCP client and any model it connects to. A signature authorizing
local storage is not consent to public publication or a model-provider privacy
policy. Do not enable this merely because a registry file exists. No client/model,
credential, profile or hosted service is configured by this change.

Each call reopens existing storage read-only, validates the pinned project/policy,
checks the stored typed-data digest through the registry, and checks ECDSA recovery
against the recorded creator. Stored evidence shape/code-hash/clock bindings are
validated, and only explicit profile/provenance fields are returned. Raw signatures,
paths and arbitrary evidence properties are omitted. This catches inconsistent
records; it is **not** a tamper-proof database or independent verification of the
stored factory observation. Host/filesystem/database protections remain required.
Policy is pinned at startup; replacing it requires a deliberate process restart.

The result always labels `source: local-operator-character-history`,
`currentAuthorization: null`, `executionAuthorized: false`. An empty registry
returns `record: null`. A populated record includes exact text (including empty
license statements), revision, digest, recorded factory/creator/block/hash and
observation/acceptance times. `signatureConsistent: true` means offline signature
and stored-creator consistency only. Expiry was the import acceptance window;
returning old history does not renew that window or authorize a new action.

These reads do not contact RPC, revalidate canonicality, detect a later reorg or
account delegation, establish current creator/IP/license/moderation approval, merge
onchain metadata, publish content, or supply signing/spending tools. Prompt-like
text remains untrusted data. The public API and public MCP canon stay separate.
Authenticated hosted Studio integration, live creator-wallet evidence, current
revalidation, smart-account support, durable hosting/backups, quotas and privacy/
moderation/publication policy remain outstanding before public agent readiness.

Four new regressions cover opt-in discovery, preserved canon, shared quotas,
project/path isolation, signature/evidence mismatch, absent storage and actual
child-process stdio tool/resource reads from a real SQLite fixture without changing
its main-file bytes. The stored authorization was accepted using the prior
arbitrary-signature/provider fixtures, not a live creator's wallet. No keys,
accounts, paid inference or public transactions were created. Standard/root
packages and all release gates remain unchanged.

Local full verification passed 307 web tests with two existing Redis skips and a
production build. An isolated official MCP SDK 1.32.2 client initialized the actual
stdio subprocess, discovered three tools and read matching tool/resource records
from a real temporary SQLite file. That fixture uses no network or real creator
signature and is not hosted-service or named desktop-app verification.

A separately enabled `get_character_provenance` tool/resource can now invoke the
read-only RPC recheck engine; see CHARACTER_PROVENANCE_MCP.md. This does not change
this history tool's offline semantics, renew its signatures, merge current canon
or grant authority. The recheck requires its own disclosure/configuration opt-in.
