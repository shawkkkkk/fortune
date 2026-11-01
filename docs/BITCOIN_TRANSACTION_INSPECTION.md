# Offline Bitcoin transaction / Runestone integration

The default-disabled `scripts/inspect-bitcoin-transaction.mjs` reads one existing
regular local JSON file with exactly `rawTransaction` (0x hex) and `expectedTxid`
(lowercase 64-character display-order hex, without0x). Enable only with
`FORTUNE_BITCOIN_TRANSACTION_READ_ENABLED=true` and run with the existing
`node --import ./scripts/register-ts.mjs` loader. File reads are bounded at256KiB
plus one byte, strict UTF-8 JSON; failures emit no paths or supplied contents.
No files, network calls, wallet, signing or broadcasts are added.

The actual parser consumes version, ordered inputs/outputs, optional SegWit
witness and lock time. It rejects trailing/truncated bytes, nonminimal CompactSize,
unknown witness flags and superfluous all-empty witness stacks. Supported bounds
are100,000 serialized bytes,1–128 inputs/outputs,10,000-byte input/output scripts,
1,024 witness items per input, and100,000 bytes per item (also bounded by remaining
transaction bytes). The existing Runestone byte/integer limits also apply. These are application limits, not complete Bitcoin consensus
rules. Negative/output-total-above21million-BTC values reject; output amounts are
exact decimal satoshi strings. No input UTXO values or miner fees are guessed.

Double-SHA256 computes display-order txid from stripped serialization and wtxid
from all supplied bytes. The expected txid must match. Witness mutation can
preserve txid while changing wtxid. That match binds only the supplied bytes:
anyone can supply arbitrary matching bytes/hash. Neither hash proves a genuine,
signed, mined, current or valid transaction. Version/lock time are decoded, not
evaluated for validity or spendability.

All output scripts go directly, in serialized order, to the existing Runestone
engine; no caller-supplied output count/list can replace them. The additive
`serializedTxidMatches` and `outputScriptsBoundToSuppliedBytes` are true only
on success. Existing nested decoder provenance flags remain false; it is still
an offline interpretation, not external verification. `transactionVerified`,
network/inclusion/finality/input-values/signatures/Rune-balances verification,
etching/mint acceptance, custody/bridge backing, execution and full Bitcoin Runes
readiness are always false. `feesSats` is null. No input script/witness contents
are emitted. Declared output total is not verified capital or Rune supply.

Serialization was checked against Bitcoin Core v30.0
[src/primitives/transaction.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/primitives/transaction.h)
(blob295bce61b93c77d025a8f4c2631131b8ddbb3a8a), plus [canonical CompactSize](https://github.com/bitcoin/bitcoin/blob/v30.0/src/serialize.h)
(blobe88a25fa114c68a8c1cba8f73fab6bbaf7d0bd0d), and the
[Bitcoin transaction reference](https://developer.bitcoin.org/reference/transactions.html).
This is a separately implemented bounded parser, not executed Bitcoin Core
conformance, script validation, policy approval or a consensus implementation.

Tests include a known genesis transaction/txid, synthetic unsigned legacy and
SegWit bytes, expected-ID mismatch, witness mutation, every byte truncation,
CompactSize and value/count limits, false authority flags and actual child CLI.
The genesis vector is historical byte evidence; no live chain inclusion or Rune
transaction was verified. Bitcoin UTXO/Rune allocation, commit/reveal/name unlock,
independent chain/index context, confirmations/reorgs, custody and two-way bridge
backing/recovery remain missing. Existing script-list and index adapters are
preserved. Frozen Standard, dependencies, financial allocations and all release
and audit/legal/governance/provider/custody gates remain unchanged.

## Supplied parent-output accounting (M05)

An optional third key, `previousTransactions`, invokes the actual transaction
parser for each supplied parent and resolves the child parser's additive
`inputOutpoints` (display-order txid and uint32 outputIndex). Also require
`FORTUNE_BITCOIN_PREVOUT_READ_ENABLED=true`; the original two-key mode/output
and its existing gate remain supported. Each parent has exactly `rawTransaction`
and `expectedTxid`; the list has 1–128 unique, required parents, with at most
200,256 aggregate raw hex characters including prefixes. Existing per-parser,
Runestone and 256KiB file bounds still apply. No caller-supplied input value is
accepted. Duplicate child outpoints, missing/out-of-range outputs, extra/duplicate
parents, mismatched hashes, null/special outpoints, input totals above MAX_MONEY
and negative implied fees reject. Multiple distinct outputs from one parent are
counted separately exactly once. Parent ordering does not change the result.

The result contains the original transaction/Runestone observation plus
`suppliedPrevoutAccounting`: ordered input values, parent count, exact decimal
input/output totals and `impliedFeeSats`. This is arithmetic over supplied bytes,
not a live fee quote or verified miner payment. Top-level and nested `feesSats`
remain null, and inputValuesVerified/transactionVerified and all chain, custody,
bridge and execution flags stay false. Supplied parents need not be valid, mined,
unspent or mature; the engine has no UTXO set, spend height, script checks,
independent provider or network context. A changed SegWit parent witness can keep
the same txid/outpoints/amounts. No parent script or witness prose is emitted.

The boundary was checked against Bitcoin Core v30.0
[Consensus::CheckTxInputs](https://github.com/bitcoin/bitcoin/blob/v30.0/src/consensus/tx_verify.cpp):
Core additionally requires available unspent inputs and checks coinbase maturity;
its fee is value-in minus value-out after money-range checks. This component
performs only the supplied-byte arithmetic subset, not executed Core differential
validation. Synthetic legacy/SegWit, all 64 parent output positions, missing/
duplicate/extra parents, repeated inputs, overflow/negative fees and actual child
CLI tests cover the component. They are not public Bitcoin, Rune issuance,
UTXO/custody/backing or full M05 readiness evidence. No signing, transaction
construction, broadcasts, service, dependency or release-gate changes.

## Nonregular local input preflight

The transaction, Runestone-script and Merkle-observation CLIs open with read-only
`O_NONBLOCK` flags before their existing descriptor-based regular-file checks.
On the Linux runtime, a writerless FIFO (including a symlink to one) now reaches
that check and rejects instead of hanging inside the open call. Byte/UTF-8/schema
limits, feature gates, generic errors, parsing and false authority are unchanged.
Normal regular-file and regular-file symlink behavior is preserved. This is not
a general filesystem I/O deadline, privileged-host path-swap defense or proof
that every filesystem/platform honors nonblocking flags. Node documents the flag
as nonblocking when possible; Windows does not expose it. Linux FIFO tests are
explicitly skipped on Windows. Existing regular-file CLI tests remain required.

## Serialized weight and supplied-byte rate arithmetic

The actual bounded transaction parser now adds `serializationSize`:
`baseBytes` is the byte length of its stripped txid serialization;
`witnessRelatedBytes` is total bytes minus base bytes, including marker/flag,
per-input stack counts and item-length prefixes, not just witness payload.
`weightUnits = 3 * baseBytes + byteLength`; `virtualBytes` is the ceiling of
weight divided by four. These are exact bounded integer counts over supplied
bytes. Existing `byteLength`, txid/wtxid, output order, Runestone interpretation,
rejection rules and 100,000-byte application bound remain unchanged.

This follows [BIP141 transaction size calculations](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki)
and Bitcoin Core v30.0 primary source read:

| Source | Git blob |
| --- | --- |
| [consensus/validation.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/consensus/validation.h), `GetTransactionWeight` | `2b2dd4bb6865f500242b0390d7a98a403e963cdf` |
| [consensus/consensus.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/consensus/consensus.h), scale factor four | `71b5fe2468d97eba3d8d83ad15acad6018ab856c` |
| [policy/policy.cpp](https://github.com/bitcoin/bitcoin/blob/v30.0/src/policy/policy.cpp), sigop-adjusted sizing distinction | `3da6cb7489b1731ee51d6afe1b272b24c9e9e313` |

Core's policy function also accounts for sigop cost and a bytes-per-sigop policy.
This inspector does not evaluate scripts/sigops or mempool policy:
`sigopAdjustedVirtualBytes` remains null. Serialized size is not a transaction
validity, block-fit, standardness, package/relay acceptance or confirmation claim.
The formulas were reviewed against source; no executed Core differential or live
Bitcoin provider evidence is claimed. The BIP source Git blob is
`442d9dd8bfc9816414ebc129dacd7e462f5d8c8a`.

Supplied-parent mode integrates that actual child size into
`suppliedPrevoutAccounting.impliedFeeRatePerSerializedVbyte` as the unreduced
exact rational `{ numeratorSats, denominatorVbytes }`, both decimal strings.
The numerator is the existing unverified input-minus-output arithmetic; the
positive denominator is the child's serialized virtual bytes. There is no
floating-point division, fee rounding, target rate, recommended payment or live
fee estimate. Even zero fees are retained as zero over the actual size. Different
witness lengths can preserve txid and supplied amounts while changing weight and
the denominator. Parent witness sizes do not become child size or implied fees.
Top-level/nested `feesSats` and `feeRateSatsPerVbyte` remain null;
`mempoolPolicyVerified` in supplied-parent mode remains false. All earlier
UTXO/signature/chain/Rune/custody/bridge/execution/readiness limitations remain.

Tests cover genesis sizing, literal legacy/mixed-witness counts, all four ceiling
residues, 252/253 and 65,535/65,536 CompactSize item-length boundaries, changed
witness length with unchanged txid, exact 100,000-byte acceptance/overflow
rejection, exact non-integral/zero supplied-byte rates and actual gated child
CLI modes. No keys, signing, construction for broadcast, external fee service,
public transaction, configuration/dependency or release-gate changes are added.
