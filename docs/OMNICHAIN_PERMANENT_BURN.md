# Direct permanent-burn receipt observation

This default-disabled operator reader connects the isolated OFT's actual
`burn(uint256)` path to receipt evidence for part of M08/P10. It does not change
contracts, Standard, economics, release gates, UI badges or public totals.

The reviewed policy contains `chainId` (97, 84532 or 11155111), `token`,
`runtimeHash`, `manifestHash`, `holder`, positive uint256 decimal-string `amount`
and `transactionHash`. Supplying pins is a trusted operator action, not proof of
independent review, a reconstructed manifest, identity ownership or approval.

Two distinct read clients must agree on a successful receipt at least twenty
blocks below their common head, with provider head gap at most ten. The reader
binds receipt/transaction/block/log hashes, numbers and indexes; the block's
transaction list must include the exact hash at that index. It checks chain,
exact destination/sender, zero native value and exact direct `burn(amount)` input,
token runtime and immutable deployment-chain/manifest at the receipt height.
The transaction must emit exactly two logs: the token's matching holder-to-zero
Transfer immediately followed by its matching PermanentBurn. Removed, foreign,
duplicate, malformed, missing, reordered or mismatched logs fail closed. A
transport debit/Transfer alone cannot satisfy this path. Batched/smart-wallet
calls and other contract generations are intentionally unsupported.

The block-end permanent-burn counter must cover the amount. It is labeled
`cumulativePermanentBurnAtBlock`, not a per-transaction state delta: other burns
may share the block. Receipt and block bindings are reread, and both providers'
normalized observations must agree. Historical receipt blocks are allowed; their
timestamps are reported and cannot be in the future. This is not a fresh-current
balance or complete-history claim. The twenty-second wall deadline, nondecreasing
host-clock check and before/after action fence prevent further reads after any
outcome, including delayed peer completions. In-flight calls are not cancelled.

The stable `evidenceId` is chain/token/transaction/burn-log-index. It permits
downstream deduplication but is not a durable consumed-record store. Repeating an
observation does not prove another burn, and consumers must never sum retries.
Reorg invalidation/quarantine, complete event ingestion, durable dedup and totals
remain separate work. No cumulative supply or badge service is created here.

`permanentBurnObserved:true` describes the matching RPC evidence only. The output
always retains false `buybackVerified`, `feeFundingVerified`,
`independentProvidersVerified`, `finalityVerified`, `globalSupplyReconciled` and
`executionAuthorized`. This proves neither a preceding purchase nor a particular
fee/revenue source. It cannot spend holder, creator or LP liabilities. Permanent
voluntary burns remain distinct from OFT transport debits and earned-platform
recirculation. There is no Fortune CA, percentage, valuation or profit claim.

## Operator command

```bash
node --import ./scripts/register-ts.mjs scripts/inspect-permanent-burn.mjs <policy.json>
```

Requires explicit `FORTUNE_PERMANENT_BURN_READ_ENABLED=true`, existing reviewed
policy (at most 8 KiB) and server-only `FORTUNE_BURN_READ_RPC_URL` /
`FORTUNE_BURN_SECONDARY_RPC_URL`. The URLs must use distinct HTTPS origins without
userinfo/fragments; requests have five-second timeouts, no retries or redirects.
Errors disclose no paths or provider URLs. No real policy/provider config is
enabled. Result addresses/hashes are identifiable metadata, not anonymous data.

## Verification and remaining gates

Web tests cover receipt/event/transaction/source-policy mismatches, retry identity,
timeout, failure fences and the actual disabled CLI. Provider fixtures do not
establish a live burn or independent consensus. The existing dual-local-EVM engine
runtime additionally executes the real compiled token's voluntary burn on its
chain-97 fixture, confirms twenty local blocks, invokes this reader through two
actual viem HTTP clients, repeats the read without creating another evidence ID,
and rejects a changed amount. Its retained `testnet-omnichain-route` report includes
that burn observation. Check exact-head CI before claiming retained passing evidence.

All writes in that rehearsal use zero-account local Anvil and VM impersonation;
no generated keys/accounts, signing or public broadcasts. The two burn clients
read one local fixture, not independent public providers. Endpoint mocks and
synthetic workers still do not verify cross-network delivery or worker security.

Trusted host/policy/clock/providers remain assumptions; code hashes do not certify
admin/proxy safety. Height-pinned reads with before/after hash checks are not
EIP-1898 hash calls, finality, consensus or ABA protection. No durable indexer,
recovery service, badge, buyback/fee settlement, public deployment, full testnet
readiness, audit or mainnet approval follows from this component.

## Separate inventory-vault receipts (M01/M08)

`inspectVaultPermanentBurn` is an additional read-only library entry point for
chain97 FortuneTestnetBurnVault receipts. Its reviewed policy uses the existing
token/runtime/manifest/amount/transaction pins plus vault address, vault runtime
hash and exact outer caller. Amounts are positive uint128 values. It accepts
only a zero-native-value direct outer `burn(uint128)` call to that vault and
exactly three bound adjacent logs: token Transfer(vault→zero), token PermanentBurn
and vault InventoryBurned(sequence,caller,amount,cumulative). Canonical topics,
amounts, log order and receipt/transaction/block identities are required.
The existing direct-burn API/CLI still accepts only direct token calls with two
logs; it never silently reinterprets a vault call. No new CLI/service/config is
activated by adding the library entry point.

At receipt height the observer checks both pinned runtimes, token identity,
vault token/runtimeHash/manifestHash, positive uint128 cap, open state, disabled
bridging and bounded totalBurned/burnCount. Event sequence/cumulative cannot
exceed the block-end vault counters. Token permanentlyBurned is also block-end
state. These counters are **not transaction deltas**; other transactions in the
block can change them. Same-block pause/config changes can conservatively reject
a genuine earlier burn. The observer neither reconstructs pre-state nor proves
fee origin, a preceding buyback, legitimate capital, issuer/proxy safety or full
supply accounting. Runtime pins are supplied trust policy, not audit approval.

Both paths use the same two-client receipt/header rereads, 20-confirmation/head
bounds, real20-second shared lifetime and failure/late-read fences. Safe nonnegative
integer host clocks are now required before RPC in that shared lifetime.
In-flight reads are not cancelled. Historical receipts remain allowed; no new
freshness or finality claim is added. Distinct clients do not prove independent
providers; height calls are not EIP-1898 hash calls or canonicality/ABA proof.

The result adds `vaultObservation` with caller, vault, sequence, event cumulative,
block-end vault counters and inventory log index. The token/log evidence ID stays
stable across repeated reads; consumers must deduplicate and must not sum counters
or repeated observations. There is still no consumed ledger, totals or badge
service. Fee funding, buyback, independent-provider/finality/global-supply and
execution flags always remain false. Launch-token fees only burn; pair rewards
and earned platform recirculation remain separate, and creator/holder/LP
liabilities are never strategy capital.

ABI/provider adversarial tests cover malformed nested logs, wrong caller/calldata,
pins/caps/counters, disagreement, changed rereads and invalid clocks. The existing
zero-account compiled OFT/vault rehearsal now invokes this actual observer for
both burns, repeats the first evidence ID and rejects wrong amounts/runtime and
direct-mode reinterpretation. Two clients of one synthetic local fixture are not
public providers, legitimate fee inventory, deployment, audit or complete agent/
omnichain readiness. No contract, dependency, real configuration or release gate
changes are implied.

## Opt-in local research capture

`captureVaultBurn({path,token,expectedHead,policy}, clients, {enabled:true})`
in `scripts/capture-vault-burn.mjs` connects the actual vault observer to an
**existing** protected project research notebook. It defaults to disabled and
adds no CLI, HTTP endpoint, scheduler, signer, public configuration or financial
store. The strict chain97 policy must name the notebook's token label and the
exact vault, caller, runtimes, manifest, positive uint128 amount and transaction.
That token label is not factory/creator authentication or project consent.

Before RPC it checks the existing notebook/schema/history, request policy,
expected head and available capacity. After the actual two-client observer
returns, it appends the observation and explicit limitations using the SAME
expected head. A concurrent writer is preserved and capture fails; it never
refreshes the head automatically. Safe monotonic host-clock checks span notebook
operations and the observer. The observer's existing20-second RPC lifetime is
unchanged; there is no new global filesystem/SQLite deadline.

A deterministic ID binds chain/token/vault/transaction within this notebook.
The normalized policy checksum also binds amount, caller and pins; it is not a
signature or approval. An exact retry with the ORIGINAL predecessor head returns
the original sequence/digest/recorded timestamp with `rpcReadPerformed:false`.
It performs no RPC, even after more than ten later notes, and does not renew the
stored observation time or revalidate its block. Changed policy or predecessor
rejects. A first capture reports `rpcReadPerformed:true`; this describes a read,
not canonicality or finality. Inspect history before retrying an uncertain commit.
There is no automatic correction, reset, pruning or reorg recovery.

The existing read-only MCP notebook tool/resource can read these notes under its
existing opt-in and shared quota. No new MCP tool or change to public canon is
added. Obtain permission before storing/sharing real observations with a chosen
client/model; transaction/wallet provenance is identifiable. Plaintext host
storage and operator notes remain untrusted: another local operator can insert
similar text, and a privileged host can rewrite the entire store. Hash links,
checksums and local deduplication do not authenticate source or ensure completeness.
Never sum counters or use these notes as consumed financial settlement, burn
totals, buyback/fee-funding evidence, badges, current authorization or authority.
Execution and full-readiness flags remain false; authorization remains null.

Tests use the actual observer/ABI and real temporary SQLite, including reopen,
old-history retries without RPC, policy conflicts, failed observations,
concurrent writes and actual stdio MCP tool/resource reads. The compiled OFT/vault
zero-account local rehearsal records both burns through this path and retries the
first without RPC. This is one synthetic fixture, not independent public
providers, public custody, fee provenance, live operations, audit approval or full
M01/M08/P10 readiness. Contracts, root pins, economics and release gates are unchanged.
