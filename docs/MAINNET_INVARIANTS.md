# Fortune Mainnet v1 Security Invariants

This is the canonical checklist for independent review of Fortune's first BSC mainnet release. Auditors should mark each invariant as confirmed, violated, or requiring an explicit assumption.

## Supply and launch creation

- **I-01 Fixed supply:** a Fortune launch token has no post-creation mint path.
- **I-02 Atomic creation:** failed creator-first-buy transactions do not leave a paid partial launch.
- **I-03 Manifest commitment:** immutable launch economics correspond to the committed launch manifest.
- **I-04 Prepared vanity integrity:** a prepared CREATE2 salt cannot deploy a different launch configuration than the previewed configuration.
- **I-05 Mainnet quote restriction:** on chain 56, exactly one quote is accepted and both quote and primary quote must be WBNB.
- **I-06 Mainnet reserve ceiling:** on chain 56, graduation target is at most $10,000 normalized USD.
- **I-07 Launch pause:** no launch may be created while the factory is paused.

## Curve accounting

- **I-08 Canonical sold state:** all standard buys/sells update one canonical tokens-sold state.
- **I-09 Integral symmetry:** absent fees, rounding and oracle movement, the buy and reverse-sell integrals cannot create quote value.
- **I-10 Accounted reserves:** direct ERC-20 donations do not increase accounted reserve value or graduation progress.
- **I-11 Standard-token rejection:** creator-first-buy detects non-standard quote transfer accounting.
- **I-12 Stale-price fail closed:** an affected quote cannot be valued/traded once its snapshotted oracle exceeds max age.
- **I-13 Final-fill bound:** the graduation-triggering purchase only consumes the quote required to reach the target and returns excess input.
- **I-14 Rescue conservation:** reserve rescue distributes only the documented pro-rata accounted reserve and cannot exceed available reserve.

## Fees and automation

- **I-15 Fee ceiling:** immutable configured trade fees cannot exceed the protocol maximum.
- **I-16 Fee conservation:** routed fee output cannot exceed the fee amount supplied by the curve.
- **I-17 Immutable destinations:** per-launch fee destinations cannot be arbitrarily rewritten after creation.
- **I-18 Creator surrender one-way:** creator fee surrender can only redirect the existing creator share toward holder rewards and cannot be reversed.
- **I-19 No automation sweep:** automation vaults expose no arbitrary owner/executor withdrawal.
- **I-20 Purpose allowlist:** vault execution requires an adapter approved for that exact automation purpose.

## Graduation and liquidity

- **I-21 Known curve only:** graduation adapters only process curves created by the canonical factory.
- **I-22 Full preflight:** any condition required for execution is either checked in preflight or fails atomically during execution.
- **I-23 Existing-pool protection:** an existing Pancake pool outside the permitted price-deviation bound cannot be used for graduation.
- **I-24 Atomic graduation:** reserve transfer, pool creation/mint, dust routing, NFT transfer and locker registration either all succeed or all revert.
- **I-25 Retry safety:** failed graduation remains retryable without duplicate successful graduation.
- **I-26 Single completion:** a successfully graduated curve cannot graduate twice.
- **I-27 Permanent LP custody:** Fortune exposes no function that transfers a registered LP NFT out of the permanent locker.
- **I-28 Fixed LP fee recipient:** locker fee collection cannot redirect fees away from the registered launch recipient.

## Administration and production release

- **I-29 Paused deployment:** production deployment leaves the factory paused.
- **I-30 Contract governance:** production governance must contain bytecode.
- **I-31 Contract automation executor:** mainnet v1 automation executor must contain bytecode.
- **I-32 Ownership acceptance:** activation requires the factory and governed registries to be owned by the configured governance contract.
- **I-33 Exact external dependencies:** production deploy uses the pinned Pancake and WBNB/Chainlink dependency manifest.
- **I-34 Reviewed source freeze:** deployment refuses security-critical source changes after the reviewed commit.
- **I-35 Explicit activation:** no CI workflow possesses a governance key capable of silently unpausing the factory.

## Test/evidence mapping

The audit bundle supplies:
- contracts/test/Fortune.t.sol for launch, curve, reserve, oracle, fee, rescue and graduation invariants;
- contracts/test/MainnetFork.t.sol for live BSC/WBNB/Chainlink/Pancake integration and chain-56 policy enforcement;
- scripts/mainnet-economic-sim.mjs for deterministic broad arithmetic/economic stress;
- the mainnet readiness workflow for 5,000-run fuzz testing;
- the audit-bundle workflow for 10,000-run fuzz testing and contract-size evidence;
- the BSC mainnet fork workflow for live dependency rehearsal.

Passing tests are evidence, not a replacement for independent review. Any invariant whose proof depends on an unstated external assumption should be explicitly documented in the final audit.
