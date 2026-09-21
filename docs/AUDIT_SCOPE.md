# Fortune Mainnet Audit Scope

Candidate auditors should review the exact commit recorded in `mainnet-release.json.reviewedCommit`. Any security-critical source change after that commit invalidates the deployment workflow until the reviewed commit is updated following re-review.

## Mainnet v1 in scope

Mainnet v1 deliberately excludes the tax-token launch stack and restricted tokenized-stock/RWA quote assets.

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
- Determine whether any buy/sell or cross-reserve sequence can extract more normalized value than contributed absent oracle movement.
- Analyze partial final fills and rounding at graduation.
- Analyze reserve accounting under donations, rebases, fee-on-transfer behavior, and unexpected ERC-20 behavior.
- Review the seven-day rescue path and pro-rata redemption math.

### Oracle and multi-asset behavior

- Validate Chainlink round completeness, timestamp, decimal normalization, and max-age behavior.
- Analyze asynchronous oracle updates and cross-reserve arbitrage.
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
- Verify Ownable2Step handoff to contract-based governance.
- Inventory every owner/admin action and its impact.
- Verify deployer has no continuing protocol ownership after acceptance.
- Verify automation registry cannot turn a purpose-locked vault into an arbitrary sweep.

### Web / signing boundary

- Review that mainnet transaction construction is fail-closed behind the release manifest, explicit mainnet UI enablement, live readiness, chain check, and onchain preflight.
- Verify unknown transaction outcomes are never automatically resubmitted.

## Evidence supplied to auditors

- `docs/ECONOMIC_SPEC.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/MAINNET_READINESS.md`
- `mainnet-dependencies.json`
- Foundry test suite
- 5,000-run mainnet-readiness fuzz workflow
- public BSC Testnet lifecycle verification artifacts

Audit findings and remediations should be linked from the `independentSmartContractAudit`, `graduationAdapterAudit`, and `automationVaultAudit` gates as applicable.
