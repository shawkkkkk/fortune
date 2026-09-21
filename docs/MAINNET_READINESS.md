# Fortune BSC Mainnet Readiness

Fortune mainnet is intentionally fail-closed. Public BSC Testnet can remain live while the production release advances through the gates in `mainnet-release.json`.

## Mainnet v1 scope

The first real-value release is deliberately smaller than the research/testnet surface:

- BNB Smart Chain mainnet only;
- standard Fortune launches only;
- tax-token mainnet launches disabled;
- exactly one reviewed asset in the initial production registry (WBNB), with WBNB also enforced by the chain-56 factory;
- a $10,000 maximum graduation target enforced by the chain-56 factory;
- tokenized securities / restricted RWAs disabled in the initial registry;
- Pancake V3 graduation only;
- launch creation stays paused immediately after deployment;
- contract-based governance is mandatory;
- mainnet v1 uses that same governance Safe as the immutable automation executor and protocol treasury, eliminating separate hot-key privileged roles.

Expanding the registry, adding restricted RWAs, or enabling another launch architecture is a later governance/review event rather than part of the initial canary.

## Machine-enforced release manifest

`mainnet-release.json` is public release evidence, not a place for secrets.

Every gate is represented as:

- `passed`: boolean;
- `evidence`: a public audit report, repository artifact, issue/PR, signed review, runbook, deployment transaction, or other reproducible reference.

A gate is incomplete if evidence is empty even when `passed` is true.

Run:

```bash
npm run mainnet:check
npm run mainnet:require-deploy
npm run mainnet:require-activate
```

The first command validates the manifest schema while allowing a blocked release. The latter two fail closed until their respective phases are complete.

## Version-controlled production dependencies

`mainnet-dependencies.json` is the canonical source for external contracts and initial production assets used by the deploy workflow.

It currently pins the official PancakeSwap V3 BSC mainnet factory and NonfungiblePositionManager plus the mainnet-v1 WBNB quote asset and BNB/USD Chainlink feed. Those exact addresses remain subject to independent verification from the cited primary sources before the release gates can be marked complete.

Run:

```bash
npm run mainnet:deps
npm run mainnet:deps:require
```

The paused deployment workflow exports the reviewed dependency manifest into its runtime environment. Pancake and asset/feed addresses are not accepted from mutable GitHub dashboard variables.

Every initial asset entry must include its token address, oracle feed, maximum oracle age, capabilities, category, and a primary-source reference. Mainnet v1 refuses to deploy unless exactly one production asset is pinned.

## Phase 1 — reviewed source

Before any mainnet deployment:

1. freeze the candidate source commit;
2. complete the independent smart-contract audit;
3. complete curve/economic simulations;
4. complete MEV and cross-reserve analysis;
5. review production oracle and asset policy;
6. audit the Pancake graduation adapter;
7. audit automation vault/adapter boundaries;
8. establish a contract-based governance wallet;
9. document deployment-key controls;
10. complete applicable legal/compliance review.

Record evidence and the reviewed source commit in `mainnet-release.json`.

The deployment workflow checks that security-critical source has not changed since the reviewed commit.

## Phase 2 — paused production deployment

Use the **Fortune Mainnet Deploy Paused** workflow only after the deploy gates pass.

The workflow:

- requires the exact confirmation phrase;
- runs under the GitHub `mainnet` environment;
- requires BSC chain ID 56;
- requires a contract-based governance address;
- requires the automation executor and protocol treasury to equal the contract-based governance Safe;
- validates Pancake dependencies contain bytecode;
- reruns the Foundry suite with a stronger fuzz count;
- dry-runs the deployment;
- broadcasts `DeployProduction.s.sol`;
- requires the resulting factory to remain paused;
- uploads the deployment broadcast/log as evidence.

The deployment key is only a deployer. It is not intended to remain protocol governance.

## Phase 3 — governance ownership acceptance

`DeployProduction.s.sol` starts the Ownable2Step handoff for:

- FortuneFactory;
- FortuneAssetRegistry;
- FortuneAutomationRegistry;
- FortuneChainlinkOracle.

Set the deployed addresses in the protected mainnet environment, then run `PrepareGovernanceAcceptance.s.sol`.

That script only validates pending ownership and prints `acceptOwnership()` calldata. The governance contract must execute those calls. No CI job should hold a governance private key.

Do not proceed until ownership reads back as the governance contract.

## Phase 4 — production validation while paused

While `launchesPaused == true`:

- verify every deployed address and bytecode;
- publish reproducible deployment records;
- verify every registered asset and oracle source;
- verify max oracle ages and feed freshness;
- verify primary quote health;
- verify RPC redundancy;
- bring indexer/analytics online from onchain events;
- configure alerts for RPC, stale oracles, failed graduation, and service health;
- test the incident runbook;
- run a production canary drill that does not expose public launch creation.

Update the remaining release-manifest evidence.

## Phase 5 — activation preparation

When every activation gate is complete:

1. set `mainnet-release.json.status` to `ready`;
2. keep `FORTUNE_MAINNET_RELEASE_APPROVED=false` until the final operator decision;
3. run **Fortune Mainnet Activation Preflight**;
4. review the generated target and calldata;
5. verify the live readiness API;
6. only then set final operator approval and submit the unpause transaction through governance.

`ActivateProduction.s.sol` is validation-only. It does not broadcast.

The activation transaction is:

- target: the canonical FortuneFactory;
- function: `setLaunchesPaused(false)`;
- caller: the configured governance contract.

## Phase 6 — real-value canary

After activation, do not immediately promote large launches.

Start with a bounded canary period and monitor:

- launch preflight failures;
- quote/oracle freshness;
- buy/sell accounting;
- graduation attempts and failures;
- Pancake pool initialization;
- LP lock state;
- RPC error rates;
- frontend transaction recovery;
- indexer lag.

Pause new launches through governance if a protocol-level issue appears.

## Required GitHub configuration

Before using mainnet workflows, repository administrators should configure a protected GitHub environment named `mainnet` with required reviewers.

Secrets:

- `FORTUNE_MAINNET_DEPLOYER_PRIVATE_KEY`
- `BSC_MAINNET_RPC_URL`

Public environment variables should contain only operator-specific public addresses such as governance, automation executor, and protocol treasury. Pancake dependencies and production asset/feed addresses come from the reviewed `mainnet-dependencies.json` manifest and are checked against it during deployment.

Never place a seed phrase, governance key, private RPC credential, or API secret in the repository or release manifest.


## Reproducible toolchain

Mainnet validation and deployment workflows pin:

- Foundry: `v1.8.3`;
- `foundry-rs/foundry-toolchain` action commit: `908c540300062bd5a7e473851cdb4282204cee09`;
- OpenZeppelin Contracts v5.1.0 commit: `69c8def5f222ff96f2b5beff05dfba996368aa79`;
- forge-std v1.10.0 commit: `8bbcf6e3f8f62f419e5429a0bd89331c85c37824`.

Changing any of these is a reviewed build-system change and should invalidate a previously frozen audit/deployment candidate.
