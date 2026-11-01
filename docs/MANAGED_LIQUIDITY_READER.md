# Testnet managed-liquidity position reader

This isolated read adapter observes one Pancake V3 NFT position on BSC Testnet.
It adds no custody, approvals, trade, collection, withdrawal or rebalancing path.
It is independent of the active co-pilot and receipt-worker branches and preserves
frozen Standard and its root dependencies. Full managed liquidity remains gated.

The reviewed policy supplies chain97, positionId, expected owner, fee and five
address/runtime-code-hash pins: manager, factory, canonical pool and ordered
pair tokens. Manager and factory addresses must match Fortune's existing BSC
Testnet Pancake venue. Pin provisioning is an operator review task, not an
address discovered from an untrusted NFT name or supplied by a model.

`inspectLiquidityPosition` takes two distinct trusted read clients. It selects
one common block twenty blocks behind the lower provider head, checks the chain
and block number/hash/timestamp on both, and pins every code/storage read to that block. It checks
manager/pool factory, canonical factory getPool, ordered pool/position tokens,
fee, tick bounds/spacing, ownership and position-specific approval consistency.
All returned fields must agree, and both clients recheck the snapshot number/hash/timestamp
and chain. An observation exceeding thirty seconds or a host-clock rollback is
rejected. A real thirty-second wall timer also rejects a hung client. After any
result, including one provider failing, delayed completions cannot start further
RPC actions. In-flight transport calls are not cancelled; CLI request timeouts
remain in force. No background observer or recovery service is started.
CLI RPC calls have five-second timeouts and no automatic retries.
Twenty blocks are a bounded observation offset, not an economic finality promise.
The two endpoints must be reviewed separately; different origins alone do not
prove independent provider operation.

```bash
FORTUNE_LP_READ_RPC_URL=https://<reviewed-provider-one> \
FORTUNE_LP_SECONDARY_RPC_URL=https://<reviewed-provider-two> \
node --import ./scripts/register-ts.mjs scripts/inspect-liquidity-position.mjs \
  /protected/reviewed-position.json
```

The manifest is bounded to16KiB. Both URLs must use distinct HTTPS origins;
protected credentials stay in server/CI configuration. The CLI emits a fixed
private-safe error and nonzero exit for failures. It writes no database or
configuration and prints only the position observation on success.

## What the fields mean

Liquidity is the venue's raw liquidity units, not a token amount, TVL, price,
return or profit. Fee-growth values are the last recorded accumulator values.
`lastComputedOwed0/1` are raw position owed fields; they can include principal
from liquidity reductions and omit fees not yet accrued into position storage.
They must never be labeled current claimable fees, protocol revenue or realized
profit. `claimableFees` and `totalValue` are explicitly null.

The NFT owner and position-specific approved address are facts at the observed
block, not a permanent lock or sole-control guarantee. Global ERC721 operator
approvals are not enumerable here; the report explicitly says they were not
enumerated. No custody eligibility, audit, release or execution approval follows
from an ownership match. Transferability, locker/governor powers, token behavior,
rewards liabilities and strategy capital remain separate review obligations.
No launch-token fee handling or holder allocation is changed.

## Reproducible verification

Fixture regressions check pinned reads, exact fields/unknown totals, owner,
pool, token, runtime, tick, integer, approval, chain, reorg and provider failures,
policy bounds, mutation isolation and CLI privacy. A real thirty-second hung-head
test and a failed-peer/late-completion regression cover lifecycle fencing. The
failed-peer regression reproduced a follow-on read before the fix. These are
provider fixtures, not public-provider liveness evidence.

The separate `Testnet LP Position Reader` workflow compiles the existing isolated
test workspace and runs `contracts-omnichain/scripts/lp-position-runtime.mjs`.
A zero-account Anvil fork creates synthetic assets and a real Pancake V3 NFT
position through the existing venue manager. The reader observes its liquidity,
then a local VM transfer makes the former owner policy fail. A newly reviewed
owner policy succeeds with unchanged liquidity. JSON/log evidence is retained.
Every writable client points only to the fresh loopback fixture, VM impersonation
uses no keys, and no public transaction is broadcast. Both readers share that
fixture; this is not independent public-provider or live deployment evidence.

ABI reference: PancakeSwap's primary NonfungiblePositionManager documentation,
https://developer.pancakeswap.finance/contracts/v3/nonfungiblepositionmanager
(accessed October27,2026). The local fork tests verify behavior against the actual
BSC Testnet venue rather than treating that documentation as deployment proof.


## Block-header consistency

LP observations now include an exact decimal-string `blockTimestamp`. Both read
clients must agree on number, hash and timestamp; each client must return that
same triple on its final checked-height read. Missing/malformed/negative/overflow
uint256 timestamps fail before position reads. Unsafe, negative or nonfinite
host clocks fail before RPC; existing monotonic checks and30-second wall timer
remain. Equal hashes cannot hide conflicting timestamps or changed recheck
numbers. Regressions failed the original reader before this change; MCP and
actual local HTTP/ABI/fork paths use the same engine.

Historical timestamps remain supported. This is consistency checking, not an
age bound, independent-provider proof, EIP-1898 hash-pinned RPC, canonicality or
finality/ABA protection. Raw liquidity/last-computed owed, null claimable/value,
false execution/readiness and existing venue/ownership/runtime pins remain.
No custody, LP mutation, financial authority, contract/dependency/configuration,
frozen Standard or release-gate changes follow. Full M07 remains unfinished.
