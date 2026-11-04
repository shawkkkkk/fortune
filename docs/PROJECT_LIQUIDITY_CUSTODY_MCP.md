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
