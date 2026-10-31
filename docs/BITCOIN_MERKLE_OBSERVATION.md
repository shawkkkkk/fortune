# Offline Bitcoin header / transaction Merkle observation

`scripts/inspect-bitcoin-merkle.mjs` is disabled unless
`FORTUNE_BITCOIN_MERKLE_READ_ENABLED=true`. Run with the existing
`node --import ./scripts/register-ts.mjs` loader and one existing regular local
JSON file. Reads stop at 256 KiB plus one byte, require strict UTF-8, and emit
generic failures without paths or supplied contents. No network calls, file
writes, accounts, signing, broadcasts, service or financial activation are added.

The exact input fields are:

| Field | Required representation |
| --- | --- |
| `rawTransaction` | 0x-prefixed complete legacy or SegWit transaction bytes |
| `expectedTxid` | Lowercase 64-character display-order hash, without 0x |
| `headerHex` | 0x-prefixed exactly 80-byte header |
| `expectedBlockHash` | Lowercase 64-character display-order hash, without 0x |
| `transactionCount` | Claimed integer count, 1 through 1,000,000 |
| `transactionIndex` | Claimed zero-based integer position below that count |
| `siblings` | Display-order lowercase hashes, leaf upward, one per tree level |

The actual existing serialized-transaction parser checks the expected txid and
passes all serialized output scripts to the actual Runestone decoder. Its
application bounds and false verification flags remain unchanged. Double-SHA256
of the supplied header must match the supplied expected block hash. The Merkle
path uses internal byte order, left/right order from the index and the stripped
transaction txid, not wtxid. It must reach the root bytes in that same header.
Header version, previous hash, timestamp, compact target bits and nonce are
decoded only. Target validity, proof of work and network rules are not checked.

Sibling depth must exactly match the claimed count's tree height (at most 32
siblings; the count bound currently needs at most 20). At each odd width the
missing right sibling must equal the current hash. Equal real paired hashes
visible on the observed path reject. These checks are deliberately incomplete:
mutations inside an opaque sibling subtree cannot be detected from this path.
A header does not commit an unambiguous transaction count. For example, a path
for the first leaf can match both a three-leaf tree and its duplicated fourth
leaf variant; tests preserve this limitation rather than certify the count.

`headerHashMatches` and `merklePathMatchesSuppliedHeader` report byte relations to
caller-supplied data only. Anyone can construct a matching arbitrary header and
path. `claimedTransactionCount` and `claimedTransactionIndex` remain claims.
`headerTrusted`, `proofOfWorkVerified`, `canonicalChainVerified`,
`transactionCountVerified`, `wholeTreeMutationChecked`, `witnessCommitmentVerified`,
`transactionVerified`, `inclusionVerified`, `networkVerified`, `finalityVerified`,
`custodyVerified`, `bridgeBackingVerified`, `executionAuthorized` and
`fullBitcoinRunesReadiness` are always false. A matching txid path does not bind
SegWit witness bytes; two different witnesses can pass the same path. The nested
transaction's signatures/input values/Rune balances/issuance are not verified
and fees remain null. No chain height or confirmation count is invented.

The separately implemented algorithm and header layout were checked against
Bitcoin Core **v30.0** primary source:

| Source | Exact blob |
| --- | --- |
| [consensus/merkle.cpp](https://github.com/bitcoin/bitcoin/blob/v30.0/src/consensus/merkle.cpp) | `e274ed821a57162393bf82ef4f199bb69f00d5ac` |
| [consensus/merkle.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/consensus/merkle.h) | `c722cbe446f5bd4acb545366aba040dd187f9252` |
| [primitives/block.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/primitives/block.h) | `207d2b2980cfa9a8b384b465c5069dcb3937185b` |
| [primitives/block.cpp](https://github.com/bitcoin/bitcoin/blob/v30.0/src/primitives/block.cpp) | `27da161e1e5a134c49a5ecf9d1d25433d47b42a0` |
| [hash.h](https://github.com/bitcoin/bitcoin/blob/v30.0/src/hash.h) | `34486af64a1da0e4ee20714db0a92f4f310d5841` |

Core's full-tree mutation detection and witness-root handling are broader than
this single transaction-root path. Source inspection is not executed Bitcoin
Core differential conformance, independent audit, legal approval or consensus
validation. Tests cover historical genesis bytes, synthetic full-tree paths at
every position across odd/even widths, mutations/bounds, visible and hidden
duplication, witness changes and the actual child CLI. The historical vector is
not a fresh public Bitcoin-provider observation.

Trusted canonical headers, independent providers, proof of work/difficulty,
chain selection, confirmations/reorg recovery, valid input scripts/UTXOs,
witness commitments, Rune allocation/etching/mint rules, custody and two-way
bridge backing/recovery remain missing. This component does not complete M05 or
authorize a bridge. Previous readers, dependencies, frozen Standard contracts,
economics and all release/audit/legal/governance/provider/privacy/ops gates remain.
