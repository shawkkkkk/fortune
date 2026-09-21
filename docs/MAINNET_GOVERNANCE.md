# Fortune Mainnet v1 Governance and Key Controls

This document defines the minimum operational control model for Fortune's first real-value BSC release. It contains no private keys, signer identities, seed phrases, or recovery material.

## Governance contract

Fortune mainnet v1 requires contract-based governance. A Safe-style multisig is the reference model, but another contract wallet may be used if it provides equivalent multi-party authorization and auditable execution.

Minimum properties before the governanceMultisig gate may be marked complete:

- no single ordinary EOA can execute governance actions alone;
- transaction threshold is at least 2 independent approvals;
- signer/recovery configuration has been tested with a harmless transaction;
- the governance contract address is recorded as release evidence;
- the governance contract contains deployed bytecode on BSC mainnet;
- FortuneFactory, FortuneAssetRegistry, FortuneAutomationRegistry, and FortuneChainlinkOracle ownership has been accepted by that exact contract;
- owners/signers are not stored in the repository.

Mainnet v1 deliberately uses the same governance address as:
- Fortune protocol owner;
- automation executor;
- protocol treasury.

That keeps the first real-funds canary behind one auditable multi-party authority boundary. A later reviewed release may separate operational automation from governance.

## Governance powers

Governance can:
- pause or unpause new launch creation;
- configure the asset registry;
- configure Chainlink feed mappings;
- select the graduation adapter for future launches;
- approve or revoke automation adapters;
- execute purpose-approved launch automation;
- receive the protocol fee allocation.

Governance cannot:
- mint additional supply into an existing Fortune token;
- arbitrarily withdraw accounted curve reserves;
- release registered Pancake LP NFTs from the permanent locker;
- rewrite a launch's immutable fee split;
- silently rewrite an existing curve's snapshotted oracle/economic configuration.

## Deployer key

The deployment key is a temporary broadcast credential, not protocol governance.

Before deploymentKeyControls may be marked complete:

- use a dedicated deployment key, not a personal day-to-day wallet;
- fund it only with the BNB required for the reviewed deployment;
- never put the private key in Git history, artifacts, logs, release JSON, or frontend environment variables;
- store it only in the protected GitHub mainnet environment secret used by the paused deployment workflow;
- require protected-environment review before workflow execution;
- after the Ownable2Step handoff is accepted, verify the deployer owns none of the governed Fortune contracts;
- remove/rotate the deployer credential after deployment evidence is preserved.

The deployer should have no ongoing protocol privilege after governance acceptance.

## Release ceremony

1. Freeze the externally reviewed source commit.
2. Verify the audit-candidate fingerprint and release manifest.
3. Verify governance contract bytecode and authorization policy.
4. Verify the deployment key has only the required BNB.
5. Run the protected paused-deployment workflow.
6. Preserve deployment transaction hashes and broadcast artifacts.
7. Independently verify every deployed address.
8. Submit ownership-acceptance calls through governance.
9. Verify onchain ownership from at least two RPC providers.
10. Run activation preflight while launches remain paused.
11. Review the generated unpause calldata.
12. Only after every activation gate passes, execute the unpause through governance.

## Emergency pause

The highest-priority governance transaction during a suspected protocol incident is:

FortuneFactory.setLaunchesPaused(true)

At least two independent RPC reads should confirm the resulting pause state. Pausing prevents new launches; it does not grant governance a reserve-withdrawal power over existing curves.

## Evidence format

For governanceMultisig, release evidence should identify the BSC governance contract and a reproducible public verification of its multi-party authorization configuration without publishing sensitive recovery information.

For deploymentKeyControls, evidence should document the protected deployment procedure and post-handoff ownership verification. It must never contain secret material.
