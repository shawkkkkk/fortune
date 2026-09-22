# Fortune BSC Mainnet v1 — External Review Packet

This document is the handoff page for independent review of Fortune's first real-value BNB Smart Chain release.

## Candidate

- Release: `fortune-bsc-mainnet-v1`
- Reviewed source commit: `ae0b4abed9870cd9c3976b715da626b61b69c1dc`
- Chain: BNB Smart Chain mainnet (56)
- Initial quote asset: WBNB only
- Graduation ceiling: $10,000 normalized reserve value
- Mainnet tax-token launches: disabled
- Restricted/tokenized-security quote assets: disabled
- Multi-reserve launches: disabled by chain-56 factory logic
- Automation fee routes: disabled for mainnet v1
- Creator fee surrender into holder automation: disabled for mainnet v1

A security-critical source change after the reviewed commit invalidates deployment until the candidate is re-reviewed and `mainnet-release.json.reviewedCommit` is advanced.

## Reproducible evidence

### Full audit bundle

GitHub Actions run:

`35617557729`

The bundle contains:

- exact source commit and tree;
- candidate SHA-256 fingerprint;
- source-level SHA-256 inventory;
- 10,000-run Foundry fuzz results;
- contract runtime-size report;
- deterministic economic simulation report;
- pinned dependency manifests;
- deployment/activation workflows;
- threat model;
- security invariants;
- governance/key-control policy;
- incident response procedure;
- reviewed-source archive.

### BSC mainnet fork rehearsal

GitHub Actions run:

`35617487172`

The fork uses live BSC mainnet state and exercises:

- WBNB;
- Chainlink BNB/USD;
- Pancake V3 factory and position manager;
- launch creation;
- WBNB purchase;
- graduation partial fill;
- real forked Pancake V3 pool creation;
- permanent LP NFT locking;
- chain-56 single-WBNB restriction;
- chain-56 single-reserve restriction;
- $10,000 graduation ceiling;
- mainnet fee and disabled-automation policy.

### Economic stress analysis

GitHub Actions run:

`35617445741`

This is recorded as the machine-verifiable evidence for the `economicCurveSimulation` release gate. It is not a substitute for independent economic review.

## Review scope

Start with:

- `docs/AUDIT_SCOPE.md`
- `docs/MAINNET_THREAT_MODEL.md`
- `docs/MAINNET_INVARIANTS.md`
- `docs/ECONOMIC_SPEC.md`
- `docs/MAINNET_ASSET_POLICY.md`
- `docs/MAINNET_GOVERNANCE.md`
- `docs/MAINNET_INCIDENT.md`
- `docs/MAINNET_READINESS.md`

Primary contracts:

- `FortuneFactory`
- `FortuneCurve`
- `FortuneToken`
- `FortuneFeeRouter`
- `FortuneAssetRegistry`
- `FortuneChainlinkOracle`
- `FortuneAutomationRegistry`
- `FortuneAutomationVault`
- `FortunePermanentLiquidityLocker`
- `FortunePancakeV3GraduationAdapter`
- deployment helper contracts used by the factory.

Release scripts:

- `DeployProduction.s.sol`
- `PrepareGovernanceAcceptance.s.sol`
- `ActivateProduction.s.sol`

## Independent reviewer deliverables

The final review should explicitly address:

1. fixed-supply and launch-creation atomicity;
2. curve integral math, integer rounding, final-fill behavior, and reserve conservation;
3. direct-donation and non-standard-token behavior;
4. stale/oracle-invalid fail-closed behavior;
5. MEV/front-running/back-running assumptions that remain relevant in a single-reserve design;
6. chain-56 WBNB-only, single-reserve, fee-cap and graduation-cap enforcement;
7. Pancake V3 price derivation, existing-pool deviation protection, tick handling, dust/slippage, deadlines and atomicity;
8. permanent LP custody and fee-collection destination integrity;
9. rescue-path conservation;
10. automation-vault purpose isolation despite automation being disabled for v1 fee routes;
11. governance/admin capabilities and absence of hidden reserve-withdrawal or mint powers;
12. deployment, Ownable2Step handoff, paused-production state and activation flow;
13. any external assumptions about BNB Chain, WBNB, Chainlink or Pancake V3;
14. any finding that requires a source change before real-value activation.

## Required evidence returned to the release manifest

Audit/review evidence should be a stable public HTTPS reference where possible. A retained private report may instead be represented by:

`sha256:<64-hex-digest>`

Relevant release gates are:

- `independentSmartContractAudit`
- `mevCrossReserveReview`
- `oracleAssetPolicyReview`
- `graduationAdapterAudit`
- `automationVaultAudit`

Do not mark a gate passed before the corresponding review has actually completed.

## Production remains fail-closed

The candidate is not authorized for real-value activation merely because this packet exists.

Until all required release gates are complete:

- production deployment cannot satisfy the deploy gate;
- production activation cannot satisfy the activation gate;
- mainnet launch signing remains fail-closed;
- the public release status remains `blocked`.
