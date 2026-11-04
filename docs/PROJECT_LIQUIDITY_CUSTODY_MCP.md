# Read-only project custody MCP integration

This optional local tool/resource connects P03/M07 to the actual unchanged
`inspectLiquidityCustody` engine. It observes operator-pinned held state, roles
and position policy at the LP reader's common twenty-confirmed height. It does
not manage liquidity, reconstruct deposit/release receipts, authenticate a
creator or approve custody. The existing raw-position MCP reader stays separate.

## Explicit setup and disclosure

Keep disabled until the operator reviews the exact fixed project, NFT, custody,
roles, runtimes and disclosure to the chosen MCP client/model. These addresses
and their project association can identify parties. Obtain actual permission;
an environment flag records operator review, not creator consent inferred from
a setting. No real policy, account, credentials, model or service is enabled.

In addition to `FORTUNE_PROJECT_MCP_ENABLED=true` and fixed
`FORTUNE_PROJECT_TOKEN`, require both:

- `FORTUNE_PROJECT_LP_CUSTODY_READ_ENABLED=true`
- `FORTUNE_PROJECT_LP_CUSTODY_DISCLOSURE_REVIEWED=true`

`FORTUNE_PROJECT_LP_CUSTODY_POLICY` selects an existing protected JSON policy
with exactly the `LPCustodyPolicy` fields in MANAGED_LIQUIDITY_CUSTODY.md.
`positionId` must be a decimal string; exact roles, ticks, positive raw liquidity
and all six runtime pins must pass the engine's unchanged offline validator.
One position asset must equal the fixed project token. This label does not prove
factory registration, creator consent or legitimate capital.

Use the existing `FORTUNE_LP_READ_RPC_URL` and
`FORTUNE_LP_SECONDARY_RPC_URL`, with distinct reviewed HTTPS origins, no userinfo
or fragments. New transports retain five-second requests, retryCount0,
redirect:error and credentials:omit. Distinct origins are not independent
organizations. No caller can supply a path, position, wallet, URL or policy.

The library factory requires literal `enabled:true` and
`discloseCustody:true` before file/provider work. It reuses the bounded policy
descriptor reader: read-only/nonblocking open, regular FD,16KiB+1 allocation,
strict UTF8 JSON and finally-close. Regular symlinks remain supported. Exact
startup bytes are pinned before/after every awaited RPC and before output;
changes discard the result and require reviewed restart, never auto-refresh.

## MCP behavior and limits

`get_liquidity_custody` accepts no arguments. Its resource is
`fortune://97/<fixed-token>/liquidity-custody`. Defaults stay two tools/resources;
all existing optional readers plus custody yield seven. Server version0.7.0,
protocol2025-06-18. Every reader shares four reads/minute, including failures;
old framing, initialization, backpressure and private error handling remain.

The actual custody engine invokes the unchanged position engine, checks the
same-height custody runtime, immutable roles/policy, held:true, released:false,
boolean pause and zero approval. A paused held position can be observed; a
released or unrecorded position rejects. Raw liquidity and last-computed owed
fields remain separate from null `claimableFees` and `totalValue`.

Output contains policyHash, fixed project label and original engine observation.
Policy hashes are consistency checks, not authentication or approval. Wrapper
`projectCustodyVerified`, execution and full-readiness stay false, authorization
null; every underlying creator-consent/capital/provider/finality/authority flag
also stays false. Held state is a snapshot under trusted policy/RPCs, not current
custody, treasury control, a cash balance, distributable profit, fee funding or
permission to spend creator/holder/LP liabilities or launch reserves.

The original engine's real30-second lifetime, original receivers and failure
fences remain. An outer safe nonnegative monotonic clock includes policy pins
and prevents late follow-on filesystem/RPC reads after completion/failure. No
freshness/finality claim or trust renewal. In-flight RPC is not canceled;
event-loop scheduling can delay timeouts. There is no generic filesystem/startup/
stdout deadline, privileged-host path-swap protection, Windows FIFO or power-loss
certification. Trusted host/policy/clock/RPC and height-call/EIP1898/ABA limits in
MANAGED_LIQUIDITY_CUSTODY.md remain. Runtime hashes do not prove proxy/admin safety.

Actual child stdio→viem HTTP/ABI tests exercise both tool and resource, policy
preservation, gate/preflight/private errors, released-state rejection, coexistence,
shared quota, monotonic clocks and real timeout/late-peer fencing. Two synthetic
HTTPS origins route to one loopback fixture through an explicitly loaded test
preload. This is component integration, not independent public providers, a
hosted MCP client/model, real creator approval, public custody, audit or full
P03/M07 readiness. No contracts, frozen Standard/root dependencies, fees,
signer, service, ledger, recovery or release gates change.

## Compiled custody lifecycle rehearsal

The existing `contracts-omnichain/scripts/lp-position-runtime.mjs` now consumes
this actual stdio command at its existing twenty-confirmed held, paused and
released checkpoints. The rehearsal deploys the unchanged custody contract in
a zero-account local BSC Testnet fork, with synthetic assets and the actual
Pancake position manager/factory/pool. No new financial transaction, mining call
or clock override is added for the MCP reads.

At held and paused checkpoints, both the tool and resource must match a direct
unchanged custody-engine observation, including its nested position snapshot;
only each read's two host observation timestamps may differ. Exact SHA256 policy
bytes, project binding, null authorization, false execution/readiness and unknown
claimable fees/value are checked. At the already released checkpoint, the tool
must return its private read error and the resource its generic protocol error.
Each child also performs actual initialization and discovery. All old receipt,
custody release and ownership assertions still run.

Before/after checks compare the chain head, latest/pending governor, guardian
and treasury nonces, NFT owner/approval/full position tuple, and custody held,
released and pause flags. The temporary mode0600 policy remains byte-identical
and is deleted with the fixture. A new seventy-second child cleanup timer wraps
two sequential reads; neither original thirty-second engine lifetime nor the
existing five-minute workflow budget changes. It is not a service deadline.
Only new dependency paths are added to both LP workflow triggers; commands,
toolchain pins, permissions and failure gates stay unchanged.

The test-only preload maps two synthetic HTTPS origins onto the same local VM.
This integration can establish compiled-contract/RPC/stdio data agreement and
read-only state preservation for that exact source. It cannot establish two
independent providers, public custody/deployment, a hosted client/model,
creator consent, legitimate capital, finality, recovery, power-loss durability,
audit approval or full P03/M07 readiness. Old source evidence does not approve
changed source; consult the implementing PR's exact-head and separate-main runs.
