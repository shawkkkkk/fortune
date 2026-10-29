# Paused omnichain route observation

This is a default-disabled operator read path for part of M08, over the isolated
`FortuneOmnichainToken`. It checks a **paused two-network configuration** against
a trusted reviewed policy. It does not configure, open or send on a route, accept
payment, allocate profit or satisfy a release gate. Standard and root pins are unchanged.

## Runtime checks

`lib/omnichain-route.ts` accepts two distinct testnet chain IDs from 97, 84532 and
11155111, separate positive uint32 endpoint IDs, a nonzero common manifest hash,
shared-decimal global cap, and two genesis allocations summing exactly to that cap.
Chain IDs and EIDs are separate inputs; no official endpoint/EID registry is bundled.
The policy needs reviewed deployed-runtime hashes for each token, endpoint,
send/receive library, executor and every selected DVN, plus owner/delegate addresses.
It cannot establish that a supplied policy was independently reviewed or signed.

Four distinct read clients are required, two per network. Each pair selects its
common minimum head minus twenty, with a head gap at most ten. All contract/code
reads use that height. Block number/hash/timestamp must match across each pair;
the timestamp must be no more than 120 seconds old and not in the future. Chain
and block are checked again at the end. The networks have separate snapshots,
not one atomic cross-chain state. Thirty seconds bounds the whole operation.
Both snapshots must still satisfy the 120-second age bound at the single reported
completion time. A snapshot that ages out during its own reads or while waiting
for the other network is rejected; no successful stale result is returned.
Before/after action guards reject host-clock rollback and prevent subsequent
reads after timeout, success or peer failure. In-flight transport calls are not cancelled.

At each end it checks token deployment chain, cap, initial allocation, manifest,
endpoint, owner, eighteen local/six shared decimals, conversion rate, disabled
transport, exactly one peer, and the reciprocal padded EVM token address. It
checks endpoint EID and delegate, explicitly selected registered send/receive
libraries, remote-EID library support, and no receive-library grace path.

The supported policy subset requires positive confirmations, one to eight sorted
required DVNs, up to eight sorted optional DVNs and a valid optional threshold.
Overlapping required/optional sets are rejected. Endpoint effective ULN bytes must
exactly match the policy, and library raw application ULN must be explicit too.
An empty optional set uses upstream's raw `255` NONE sentinel, not inherited `0`.
Both raw and effective executor/max-message-size must match. Config types 1/2 and
tuple layouts follow the existing lockfile's protocol/messagelib 3.0.168 interfaces.
This intentionally rejects inheritance even if today's defaults happen to match.

Output includes per-chain local supply/permanent burns and block provenance,
manifest and policy hash, with `configurationMatches:true` only after every check.
`executionAuthorized`, `securityReadiness`, `routeDeliveryVerified`,
`independentProvidersVerified` and `globalSupplyReconciled` are always false.
The policy hash identifies supplied bytes after cloning; it is not a signature,
onchain manifest reconstruction or independent timestamp. Output is identifiable
project metadata, not anonymous data. No observation is stored or reused as approval.

## Operator command

Run with the existing TypeScript loader and an existing reviewed JSON policy:

```bash
node --import ./scripts/register-ts.mjs scripts/inspect-omnichain-route.mjs <policy.json>
```

Explicit `FORTUNE_OMNICHAIN_ROUTE_READ_ENABLED=true` is required. The four server-only
read-provider variables are `FORTUNE_ROUTE_A_RPC_URL`, `FORTUNE_ROUTE_A_SECONDARY_RPC_URL`,
`FORTUNE_ROUTE_B_RPC_URL`, `FORTUNE_ROUTE_B_SECONDARY_RPC_URL`. The CLI requires four
different HTTPS origins, no URL userinfo/fragment, five-second requests, no retries
or redirects, a policy at most 32 KiB and no extra arguments. It prints a fixed
error without policy paths/provider URLs. Different origins or objects do not
prove independently operated providers. No real policy/provider config is enabled.

## Evidence and limits

Web regressions cover malformed policies, wrong peer/EID/authority/runtime/chain,
inherited/default configuration, changed/stale blocks, timestamp disagreement,
grace paths, deadlines and late completions. They use provider fixtures.

The engine runtime script deploys the actual compiled Fortune OFT to two separate
zero-account Anvil 1.7.1 instances with chain IDs 97 and 84532. It deploys the pinned
upstream EndpointV2Mock and published SendUln302/ReceiveUln302 artifacts, explicitly
configures them, and calls the real reader through four viem HTTP clients. Endpoint
IDs 40001/40002 are arbitrary fixture values. Synthetic worker runtime stands in
for DVNs/executor; it does not verify or deliver messages. It checks acceptance of
the paused configuration and rejection after actual local peer, executor and
raw-ULN inheritance changes. VM impersonation uses only loopback clients, no
generated accounts/keys/signatures or public broadcasts. The local VM uses Prague
for published upstream artifacts; Fortune's unchanged compiled bytecode targets Paris.
CI retains the report/log as `testnet-omnichain-route`; inspect exact-head results
before claiming a passing run. A configured workflow is not retained passing evidence.

Runtime hash/address matching does not establish correct worker behavior, independent
DVN organizations, proxy/admin safety, endpoint/library governance, send/receive
worker compatibility, finality, gas adequacy, enforced options or delivered routes.
The library/endpoint/worker authority graph is not exhaustively enumerated. Trusted
RPC providers/host/policy/clock remain assumptions. Height-pinned calls with before/
after checks are not EIP-1898 hash calls, consensus or ABA protection. Existing
ownership/delegate powers remain mutable. An observation can become stale immediately.

The reader neither enumerates all instances on a network nor proves global unique
issuance/backing. In-flight obligations, complete supply reconciliation, checkout,
signer serialization, durable deployments/refunds, pools/custody, fee/payout ledgers,
real delivery/failure/recovery drills, operations and independent reviews remain
missing. No public route, full testnet readiness, audit or mainnet approval follows.
