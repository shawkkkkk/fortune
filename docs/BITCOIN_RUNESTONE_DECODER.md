# Offline Runestone output-script decoder (M05)

`lib/bitcoin-runestone.ts` interprets actual supplied Bitcoin output-script bytes.
It is separate from the existing Rune index observation adapter and makes no
network requests. Neither component establishes Bitcoin issuance or bridge
backing. No wallet, account, signature, transaction construction, broadcast,
custody, payment or financial engine is enabled.

## Input and interpretation

`inspectRunestoneScripts(outputScripts)` requires the ordered array of **all**
output scripts as even-length `0x` hex strings. It accepts at most 128 outputs,
64KiB aggregate script bytes and 8,192 decoded integers. Unsupported bounds or
malformed input throw; they are application limits, not protocol cenotaphs.
There is no inferred output count, transaction ID, network or index lookup.
The caller can omit/reorder/replace scripts, so completeness and transaction
binding are always unverified. In particular, output count affects pointers and
edict interpretation. Do not use an incomplete list for settlement decisions.

The first literal `OP_RETURN OP_PUSHNUM_13` output wins, even if its remaining
script is invalid. A data push containing13 is not that opcode prefix. Following
pushes (including OP_0 and PUSHDATA1/2/4, without a minimal-push requirement) are
concatenated before decoding. Non-push opcodes or truncated pushes produce the
corresponding cenotaph interpretation; later outputs cannot replace it.

Payload integers use exact unsigned128-bit LEB128 decoding, including valid
nonminimal encodings; overflow, overlong and unterminated values produce a varint
cenotaph. All protocol integers in output use decimal strings, never floating
point amounts. Tag queues, first-value consumption, etching/terms/turbo flags,
optional odd fields, leftover even fields, mint IDs, pointer bounds, checked
declared-supply arithmetic and delta edicts follow the pinned decoder below.
Edict output equal to the supplied output count is its distribution sentinel;
the decoder does not execute allocation or calculate UTXO balances. Unknown odd
fields are ignored; unconsumed even fields and flags produce cenotaphs. Flaw
precedence and retained mint/etching-rune labels are preserved. A `runestone`
artifact is a binary interpretation, **not** an accepted etching/mint/transfer.

## Pinned primary source

Implementation was checked against `ordinals/ord` commit
`b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414`, specifically:

- [Runestone decoder and tests](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/runestone.rs)
  (blob98022fb2a25d587a59a4a2ac40cd9de9bc5a6d0b), plus its `message.rs`,
  `tag.rs` and `flag.rs` modules.
- [Varint decoder and tests](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/varint.rs)
  (blobbddc45df849daef676a1bb6a54cf9bbd8dc39989).
- [RuneId](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/rune_id.rs),
  [Edict](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/edict.rs),
  [Etching](https://github.com/ordinals/ord/blob/b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414/crates/ordinals/src/etching.rs)
  and `flaw.rs` define numeric bounds, supply overflow and flaw names.

The source pin is a reproducible interpretation target, not proof of current
Bitcoin consensus, a deployed index version, independent audit or compatibility
with every future ord release. This is a separately implemented decoder, not a
vendored/executed Rust dependency or differential conformance certification.

## Explicit local operator CLI

The CLI is disabled by default and reads one existing regular local JSON file,
with an exact single `outputScripts` property. File reads allocate at most
192KiB+1 and reject larger files, invalid UTF-8, invalid JSON and unknown fields.
It creates no files or history and emits a generic failure without paths or
input contents. Trusted local configuration is not privileged-host protection.

```json
{"outputScripts":["0x6a5d0414011402","0x51"]}
```

```bash
FORTUNE_RUNESTONE_DECODE_ENABLED=true node --import ./scripts/register-ts.mjs scripts/inspect-runestone.mjs /path/to/output-scripts.json
```

Output is schema1, source `local-supplied-bitcoin-output-scripts`, exact decoder
pin, supplied output count, selected output index (or null), and `none`,
`runestone` or `cenotaph` artifact. `transactionVerified`,
`outputListCompletenessVerified`, `networkVerified`, `etchingAccepted`,
`mintAccepted`, `balancesVerified`, `finalityVerified`, `custodyVerified`,
`bridgeBackingVerified`, `executionAuthorized` and
`fullBitcoinRunesReadiness` are **always false**.

Missing components include serialized transaction parsing/txid and inclusion
proofs, independently checked Bitcoin chain/index context, commit/reveal/name
availability and unlock rules, etching acceptance, mint height/cap eligibility,
input UTXO Rune balances and allocation, reorg/finality, miner-fee quotes,
wallet/address integration, custody, bridge backing/supply reconciliation,
two-way release limits and recovery. No network or bridge activation follows.

## Verification scope

Tests use literal byte vectors adapted from pinned upstream cases, independent
test encoding, every u128 power of two and256 deterministic integer samples,
malformed pushes/varints, tag/flag/ID/output/supply boundaries and first-output
precedence. The actual child CLI reads temporary local files and exercises
default-disable, schema/size/UTF-8/private-error behavior. These are executable
component tests, not Rust differential execution, a real confirmed Bitcoin
transaction, public index/provider evidence, a live etching, custody/bridge
drill, full M05 readiness or audit approval. Existing Rune index behavior and
all release, asset, custody, governance and financial gates are unchanged.
