# Isolated omnichain token engine

`contracts-omnichain/` contains an unaudited, testnet-only EVM token built on pinned LayerZero OFT 4.0.1 / OApp 0.4.1 and OpenZeppelin 5.4.0 source packages. It is independent of frozen Standard and the root dependency/release manifests. This is a local-test candidate, not a deployed bridge, five-chain launch or audit approval.

## Token behavior and authorities

- Constructor deployment is restricted to BSC Testnet (97), Base Sepolia (84532) and Ethereum Sepolia (11155111). Runtime token updates require the original deployment chain. No mainnet override is provided.
- An immutable manifest hash, declared global cap and local genesis allocation are recorded. Allocations must fit the cap and six shared decimals. The orchestrator must still prove all per-chain allocations sum to the global cap and that exactly one approved instance exists on each selected chain. An individual contract cannot attest global deployment consistency.
- The owner has no arbitrary mint function. Transport uses the inherited OFT source burn/destination credit path. Incoming credits cannot push local supply above the declared global cap. This does not protect against compromised messaging configuration across the whole mesh.
- Transport starts disabled. The owner may pause/resume it and configure EVM peers while paused; at least one peer is required before resuming. Local ERC-20 transfers remain possible while transport is paused.
- The owner and endpoint delegate retain the upstream administrative/messaging configuration powers. They are not revoked, immutable or equivalent to a verified multisig. Endpoint configuration, verifiers, confirmations, delegate changes, emergency response and governance must be reviewed before release.
- Source transfer amounts retain precision dust at the sender. This first slice supports EVM recipients and plain transfers only: no arbitrary composed calls, command payloads or LZ-token fee payments.
- Inbound delivery requires the configured endpoint and peer. The token additionally rejects reused GUIDs and source-peer-nonce identities. Failed credits roll back these markers so the original message can be retried. Nonces may arrive out of order; they may not be credited twice.
- Voluntary permanent burns have their own ledger/event. OFT debits are not counted as permanent burns. The token has no trading tax, rewards, creator fee or arbitrage executor. Combining those features requires separate integration review.

## Reproduce local tests

```bash
cd contracts-omnichain
npm ci --ignore-scripts
git clone https://github.com/foundry-rs/forge-std.git lib/forge-std
git -C lib/forge-std checkout 8bbcf6e3f8f62f419e5429a0bd89331c85c37824
npm test
node scripts/check-sizes.mjs
```

The workspace lockfile pins transitive packages and integrity hashes. Its separate toolchain uses Forge 1.7.1 and Solidity 0.8.30 with optimizer/via-IR and Paris bytecode target. Upstream test helpers hit a Solidity 0.8.24 via-IR stack failure; the isolated toolchain change does not alter Standard's compiler or build.

The local launcher calls the pinned native Forge binary and propagates its exit code. A negative launcher test ensures invalid Forge commands fail CI; the workspace does not rely on the npm package wrapper's exit-status handling.

Tests exercise actual OFT calls through local LayerZero endpoint/message-library fixtures: genesis allocation, pause/peer authority, sends, in-flight supply, delivery, retry, endpoint/application replay defenses, precision dust, permanent burns, minimum output, insufficient fees, malformed/unauthenticated payloads, cap enforcement and chain gating. The conservation case runs 1000 fuzz inputs. Mock endpoints and test message libraries do not verify a live DVN, finality policy or production network route.

## Still required before public testnet readiness

1. A deployment/factory manifest and resumable orchestration proving global allocations, unique chain instances, peer pairs and exact bytecode/configuration. Persist receipt checks and refund/recovery rules; do not accept payment on the strength of this token alone.
2. Verified endpoint/chain IDs, message libraries, DVNs/executors, confirmation policy and tested bidirectional routes for each selected network. Do not copy endpoint fixtures or infer support from a chain name.
3. Pool adapters, pricing/seed-funding economics, fee vaults, liquidity custody and coordinated opening/recovery drills. Add Solana and any further chains through separately tested adapters.
4. Protected owner-run deployments with faucet funds and retained send/delay/retry/reorg/pause evidence. The local test workflow uses no user credentials or network broadcasts.
5. Dedicated monitoring, global supply reconciliation including in-flight obligations, incident ownership and independent contract/economic/legal review before mainnet. No automated mainnet deploy/activation workflow is introduced here.
