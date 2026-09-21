# Fortune Mainnet Audit Scope

Candidate auditors should review the exact commit recorded in `mainnet-release.json.reviewedCommit`. Any security-critical source change after that commit invalidates the deployment workflow until the reviewed commit is updated following re-review.

## Mainnet v1 in scope

Mainnet v1 deliberately excludes the tax-token launch stack and restricted tokenized-stock/RWA quote assets. On BSC mainnet (chain 56), `FortuneFactory.preflightLaunch` also enforces exactly one quote asset, so multi-reserve launches are unreachable in this release even if governance later adds another registry entry.

Primary contracts:

- `FortuneFactory`
- `FortuneCurve`
- `FortuneToken`
- `FortuneAssetRegistry`
- `FortuneChainlinkOracle`
- `FortuneFeeRouter`
- `FortuneMetadataRegistry`
- `FortuneAutomationRegistry`
- `FortuneAutomationVault`
- `FortunePermanentLiquidityLocker`
- `FortunePancakeV3GraduationAdapter`
- token/vault/fee-router/curve deployers and their interfaces

Deployment/governance scripts:

- `DeployProduction.s.sol`
- `PrepareGovernanceAcceptance.s.sol`
- `ActivateProduction.s.sol`

## Required review questions

### Curve and reserves

- Validate integral buy and sell math, scaling, integer rounding, and overflow assumptions.
- Determine whether same-reserve buy/sell sequences can extract more normalized value than contributed absent oracle movement.
- Verify the chain-56 single-quote gate makes cross-reserve launch execution unreachable in mainnet v1; multi-reserve economics remain out of scope until a separately reviewed factory release.
- Analyze partial final fills and rounding at graduation.
- Analyze reserve accounting under donations, rebases, fee-on-transfer behavior, and unexpected ERC-20 behavior.
- Review the seven-day rescue path and pro-rata redemption math.

### Oracle and asset behavior

- Validate Chainlink round completeness, timestamp, decimal normalization, and max-age behavior.
- Verify WBNB is the only pinned mainnet-v1 quote asset, the production deployment contains exactly one initial asset, and the chain-56 factory rejects any non-WBNB quote.
- Verify the chain-56 $10,000 graduation-target ceiling cannot be bypassed through prepared launches or creator-first-buy paths.
- Verify registry expansion alone cannot bypass the factory's chain-56 single-quote launch gate.
- Determine safe production asset criteria and max-age policy.
- Verify existing curves cannot be silently repriced by later registry edits.

### Launch creation

- Review CREATE2 vanity search and prepared-salt flow.
- Verify launch manifest commitments.
- Verify creator-first-buy atomicity and allowance/refund accounting.
- Review Launch Shield timing, wallet cap, and fee routing.

### Graduation

- Verify preflight covers every assumption required by execution.
- Review Pancake V3 price derivation, tick handling, existing-pool price deviation, slippage/dust limits, and deadlines.
- Verify reserve transfers + pool creation + LP mint + permanent lock are atomic.
- Verify failed graduation leaves reserves retryable.
- Verify the permanent locker cannot release LP NFTs and cannot redirect fees.

### Administration and governance

- Verify production deployment starts paused.
- Verify Ownable2Step handoff to Safe-compatible governance with threshold >= 2 and owner count >= threshold.
- Inventory every owner/admin action and its impact.
- Verify deployer has no continuing protocol ownership after acceptance.
- Verify automation registry cannot turn a purpose-locked vault into an arbitrary sweep.

### Web / signing boundary

- Review that mainnet transaction construction is fail-closed behind the release manifest, explicit mainnet UI enablement, live readiness, chain check, and onchain preflight.
- Verify unknown transaction outcomes are never automatically resubmitted.

## Evidence supplied to auditors

- `docs/MAINNET_THREAT_MODEL.md`
- `docs/MAINNET_INVARIANTS.md`
- `docs/ECONOMIC_SPEC.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/MAINNET_READINESS.md`
- `mainnet-dependencies.json`
- Foundry test suite
- live BSC mainnet-fork assertions for WBNB-only, single-quote, and $10k graduation-cap policy
- 5,000-run mainnet-readiness fuzz workflow
- 10,000-run audit-bundle fuzz workflow
- public BSC Testnet lifecycle verification artifacts

Audit findings and remediations should be linked from the `independentSmartContractAudit`, `graduationAdapterAudit`, and `automationVaultAudit` gates as applicable.
