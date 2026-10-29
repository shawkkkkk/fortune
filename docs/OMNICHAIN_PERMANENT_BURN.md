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
