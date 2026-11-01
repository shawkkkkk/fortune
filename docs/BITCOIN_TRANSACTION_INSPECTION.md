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
