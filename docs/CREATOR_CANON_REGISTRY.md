# Creator-authorized character registry (operator source)

This adds an explicit, default-disabled **local operator** path from a Studio
character draft to a durable, signed authorization observation. It covers part of
P01/P02/P06, not a public login, hosted canon service, complete agent or testnet
readiness. `/studio`, public metadata and MCP readers remain unchanged. No existing
project profile is imported, published or substituted automatically.

## What is accepted

One protected SQLite file binds one chain-97 Standard project to the exact public
Fortune factory, a reviewed factory runtime hash and a launch index (0–9999).
`CreatorCanonRegistry.initialize` exclusively creates that file, generating a
random **public registry ID**, not an account or secret. Open/import never creates
a missing file. No mainnet, tax/custom-pair factory or arbitrary chain is accepted.

`prepare` normalizes the ten existing Studio text fields and emits both the exact
update and EIP-712 typed data. All ten strings are in the signed message, including
empty fields; the wallet can display the wording rather than an opaque profile
hash. The domain binds `Fortune Project Character`, version 1, chain 97, the
factory address and unique registry ID. The message also binds the fixed official
origin, token, next revision, prior digest, issue time and exactly five-minute
expiry. The factory is a domain identifier; **the factory does not execute or
verify these offchain profile signatures**. Name/description fields are an
explicit character overlay, never a change to immutable onchain launch metadata.

`accept` reconstructs that typed data itself and recovers an EOA from a canonical
65-byte, low-s signature. It never accepts an imported signer/approval claim.
Two distinct supplied read clients must agree at one block 20 behind the lower
head; heads cannot differ by over ten blocks. Every code/factory/creator read is
pinned to that block. The factory code must match its reviewed hash, and its
`launches(index)` record must bind the exact token and recovered creator. Creator
accounts with runtime code (including delegation) are rejected; ERC-1271 and
counterfactual wallets are **unsupported**, with no EOA fallback. Chain and block
hash are checked again; stale block timestamps, changed hashes, wrong creator,
provider disagreement or unavailable data fail closed. The whole observation has
a 20-second deadline; the CLI uses eight-second requests with no retry/redirect.
Two clients are not proof of independent providers or finality.

After verification, a short `BEGIN IMMEDIATE` transaction rechecks current
revision/prior digest, host clock, expiry and observation age before inserting the
update, signature, digest and observation together. It updates the clock in the
same commit. Concurrent submissions of one revision cannot both win. The file
retains up to 1000 revisions with no overwrite, delete, reset or pruning API. A
failed import does not consume a revision. Different registries have different
domains, preventing simple cross-file signature replay. Copying an entire file
creates a fork of its history, **not** a safe second active service.

## Operator workflow

Use an access-controlled, trusted local POSIX directory and exact pinned source.
Review the factory runtime hash and launch index independently; a hash observed
from a provider is not an audit. Policy files are at most 16 KiB:

```json
{
  "chainId": 97,
  "factory": "0x70641975e43c5807621146874022fd9d1b735aa1",
  "factoryCodeHash": "<reviewed lowercase 0x bytes32 runtime hash>",
  "token": "<lowercase nonzero Standard testnet token>",
  "launchIndex": 0
}
```

Commands are disabled unless `FORTUNE_CREATOR_CANON_ENABLED=true`. Explicitly
initialize a **fresh** protected file, then prepare from a same-project JSON
export downloaded from Studio:

```bash
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs init /protected/canon.sqlite /protected/canon-policy.json
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs prepare /protected/canon.sqlite /protected/canon-policy.json /protected/studio-draft.json
```

`prepare` outputs `{update, typedData}`; it does not sign. A creator must separately
review all wording, domain and expiry in their own compatible wallet. Never supply
a private key to this tool. Retain the exact `update` plus the creator-supplied
`signature` in a bounded JSON envelope with exactly those two keys. Do not import
a whole `prepare` response, a transaction signature or a plain-message signature.

Set protected `FORTUNE_CANON_READ_RPC_URL` and `FORTUNE_CANON_SECONDARY_RPC_URL` to
reviewed distinct HTTPS origins (no URL userinfo/fragments). Then explicitly import:

```bash
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs accept /protected/canon.sqlite /protected/canon-policy.json /protected/signed-update.json
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs latest /protected/canon.sqlite /protected/canon-policy.json
```

Import returns only revision/digest/non-execution flag. `latest` explicitly exports
stored character text, signature and block provenance; do not run it into public
logs without permission. Prepare/latest open SQLite read-only. Errors are fixed,
nonzero and omit paths/provider details. Profiles/signatures are stored in plaintext.
Directories, clock, filesystem and database contents are trusted host inputs;
regular-file/single-link/inode checks are not an adversarial filesystem sandbox.
Initialization failures retain the file for operator inspection, not auto-deletion.
WAL/FULL and process-death tests are not power-loss certification or backups.

## Limits and remaining integration

An accepted record is a **historical RPC-backed creator-authorization observation**
at the recorded block, not a current login/session or current canonicality proof.
`latest` exposes `currentAuthorization: null` and `executionAuthorized: false`.
A later reorg/delegation change does not automatically revalidate or delete history.
No consumer may treat its existence as fresh identity, legal/IP ownership, verified
license, moderation approval, authority to publish, or authority over funds.
Character prompts remain untrusted text. Empty license statements remain empty.
The public registry metadata and MCP character fields are not updated by this book.

Remaining before a public creator workflow: actual creator-wallet review/import
interoperability, exact live factory/creator evidence, supported smart-account
verification, reorg-aware authorization status, authenticated Studio integration,
protected durable hosting/backups/restore, quotas, privacy/moderation/deletion policy
and read/publication permissions. An operational owner must review the storage and
provider configuration before any real profile is accepted. No hosted file or
service has been provisioned; no creator signature was requested or generated.

## Verification scope

Ten focused regressions cover exact text/domain/project/registry/revision/expiry
binding, replay, wrong chain/code/token/creator, unsupported contract creators,
changed/stale/disagreeing blocks, mutation during reads, CLI configuration, restart,
two actual worker processes racing a revision and process exit immediately before
or after SQLite COMMIT. Actual viem HTTP clients decode factory ABI responses from
a **local RPC fixture**. These are not independent-provider or public creator proof.
The signature fixture is an arbitrary valid r/s/v tuple; the fixture factory is
assigned its recovered address for the exact message. No private key, signer,
generated account, wallet call or chain broadcast is used by these new tests.

Local full web verification passed 303 tests with two existing Redis skips;
TypeScript, production build, runtime smoke and the frozen 63-file fingerprint
also passed. A separate local public-RPC negative probe read the real factory's
launch index 0, then rejected the arbitrary test signature and retained zero
versions. Policy discovery used block 139378221; the importer selected its own
later common block. This negative probe is not a retained CI drill or a real
creator's signed approval. No existing operator registry was changed.

Primary standards consulted October 28, 2026:
[EIP-712](https://eips.ethereum.org/EIPS/eip-712) (typed data does not itself supply
replay protection), and [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) (contract
validation is a distinct method, intentionally unsupported here). Root packages,
frozen Standard contracts/signature paths and all release gates remain unchanged.
