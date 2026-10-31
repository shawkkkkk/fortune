# Project LP-position MCP reader

This is an optional local read adapter for P03/M07, not a treasury manager,
fee collector, custody approval or public service. It calls the existing
`inspectLiquidityPosition` engine; see MANAGED_LIQUIDITY_READER.md for its exact
runtime/venue/owner/approval checks and limitations. The engine's logic is
unchanged; its existing validator is exported for offline adapter preflight.

## Explicit operator setup

Keep disabled until the operator reviews the exact project, position, owner,
runtime policy and disclosure to the chosen MCP client/model. Addresses and their
project association are potentially identifying metadata. No real policy,
provider credential, profile, model or running service is configured by this PR.

In addition to the existing `FORTUNE_PROJECT_MCP_ENABLED=true` and fixed
`FORTUNE_PROJECT_TOKEN`, explicitly set `FORTUNE_PROJECT_LP_READ_ENABLED=true`.
Set `FORTUNE_PROJECT_LP_POLICY` to an existing protected JSON policy file.
Set `FORTUNE_LP_READ_RPC_URL` and `FORTUNE_LP_SECONDARY_RPC_URL` through protected
operator configuration. They must be distinct HTTPS origins, without userinfo
or fragments. Transports use five-second request timeouts, no application retry
and no redirects. Two origins do not prove independent providers.

The policy uses exactly the existing reader's fields: chainId97, manager,
factory, pool, token0, token1, fee, positionId and owner. Each pin contains only
address/codeHash. The decimal positionId must be a string. The adapter validates
this bounded literal schema and the engine's canonical venue/runtime policy
without RPC at startup. One position asset must equal the fixed project token.
Missing, malformed, oversized or foreign policies fail without creating files.

The policy file must be a regular file, at most 16KiB, with strict UTF-8 JSON.
Reads allocate at most 16KiB+1 even if the file grows after stat. Exact startup
bytes are checked before and after each engine read. Whitespace/key-order changes
also require an explicit reviewed restart. This is trusted-host configuration,
not privileged-host tamper resistance, immutable storage or filesystem ABA proof.

## Tool and resource

The optional tool is `get_liquidity_position`, with no arguments. Its resource
is `fortune://97/<fixed-token>/liquidity-position`. Default discovery remains
two tools/resources. With all existing optional readers plus this one there are
six; the protocol version remains2025-06-18 and server version is0.6.0.
All readers, including failed observations, share four reads per minute. Frame,
message, initialization and backpressure limits remain unchanged. Callers cannot
select paths, wallets, positions, tokens, providers or policies.

Output includes the operator-selected project label, SHA-256 of policy bytes
and the existing whitelisted position observation. Policy hashes establish
configuration identity, not review approval. It retains raw liquidity units and
`lastComputedOwed0/1`; these are not current claimable fees. `claimableFees` and
`totalValue` remain null; global operator approvals remain unenumerated.

`projectCustodyVerified`, `independentProvidersVerified`,
`fullManagedLiquidityReadiness` and `executionAuthorized` are always false;
`currentAuthorization` is null. A project asset/address match does not establish
Fortune factory registration, creator consent, legitimate capital, treasury
ownership or control of a contract owner. Held funds are not distributable
profit and cannot replace creator/holder/liquidity liabilities or launch reserves.

The unchanged reader uses two supplied clients, a lower-head-minus20 height,
runtime/position checks, block-hash rechecks and a real30-second read lifetime.
It does not establish source freshness, independent consensus, EIP-1898 hash-bound
calls, finality, proxy/admin safety or a fully managed liquidity lifecycle.
Inflight calls are not cancelled. No allowance, signature, transfer, fee claim,
LP mutation, public API, scheduler or financial authority is added.

## Verification boundary

Tests cover optional discovery/coexistence/shared quota, literal bounded
preflight, project binding, before/after policy changes and private-safe errors.
A real child stdio process calls viem HTTP/ABI against a loopback fixture for
both tool and resource. A test-only preload rewrites two synthetic HTTPS origins
to that single fixture; production never imports it. This is runtime integration
evidence, not two independent providers, a real project's approval, public NFT
custody, a hosted MCP client or model, or full P03/M07 readiness. Existing local
Pancake-fork LP-reader tests remain separately scoped evidence.
