# Fortune Mainnet Release

Fortune's repository is structured so production can be prepared without
silently enabling real-value launches.

## Production posture

The BSC Testnet public alpha remains the default deployment until the production
release gates below are complete. Setting `NEXT_PUBLIC_CHAIN_ID=56` alone does
not make Fortune production-ready.

The production deployment script:

- only runs on BNB Smart Chain mainnet (`chainid == 56`);
- receives governance/operator addresses from protected environment configuration;
- receives Pancake dependencies plus the initial WBNB/Chainlink asset configuration from the reviewed, version-controlled `mainnet-dependencies.json` manifest;
- verifies bytecode exists at all configured assets, feeds and Pancake contracts;
- calls the live Fortune registry health check for every configured asset;
- requires at least one healthy quote + graduation asset;
- deploys the full Fortune factory/deployer/registry/oracle/locker/adapter stack;
- wires the Pancake V3 adapter and permanent LP locker;
- **pauses launch creation before handing governance over**;
- starts two-step ownership transfers to the configured governance address.

The deployment therefore cannot become an open launchpad merely because a
deployment transaction succeeded.

## Required release gates

Before a governance owner activates Fortune mainnet:

1. **Independent security review**
   - FortuneFactory
   - FortuneCurve
   - FortunePancakeV3GraduationAdapter
   - FortunePermanentLiquidityLocker
   - fee routers / automation vaults
   - production deployment and ownership flow

2. **Production governance**
   - use a multisig/timelock rather than an ordinary hot wallet;
   - accept all `Ownable2Step` ownership transfers;
   - verify the factory and registry report the expected owner;
   - document emergency pause responsibilities.

3. **External protocol verification**
   - independently verify the current official Pancake V3 factory and position
     manager for BNB Smart Chain;
   - verify each Chainlink feed against the current official feed registry;
   - do not copy an address from testnet or an old deployment.

4. **Asset policy**
   - configure only ordinary ERC-20 assets that pass Fortune's exact-balance
     accounting assumptions;
   - set a strict oracle freshness bound for every asset;
   - confirm quote, reward and graduation capabilities separately;
   - run `assetHealth` immediately before activation.

5. **Infrastructure**
   - configure at least two independent BSC mainnet RPC providers;
   - enable transaction recovery;
   - deploy monitoring for RPC, factory, registry, adapter, locker, Pancake
     dependencies and launch-pause state;
   - keep the status page publicly accessible.

6. **Web release**
   - set `NEXT_PUBLIC_CHAIN_ID=56`;
   - configure the production factory, registry, adapter and locker addresses;
   - configure the approved primary quote address/symbol/decimals;
   - verify `/api/public/v1/readiness` is fully green;
   - perform a production smoke rehearsal with a controlled launch before
     opening broad access.

7. **Operational / legal review**
   - incident response and communications;
   - jurisdiction/asset restrictions where applicable;
   - terms and risk disclosures appropriate to a real-value launch platform.

## Deployment

The production deployment uses:

`contracts/script/DeployProduction.s.sol`

It expects:

- `PRIVATE_KEY`
- `FORTUNE_GOVERNANCE`
- `FORTUNE_AUTOMATION_EXECUTOR`
- `FORTUNE_PROTOCOL_TREASURY`
The deploy workflow exports `PANCAKE_V3_FACTORY`, `PANCAKE_V3_POSITION_MANAGER`, and the numbered `PRODUCTION_ASSET_N` / feed / policy variables from `mainnet-dependencies.json`; they are not free-form operator inputs. Mainnet v1 requires exactly one pinned production asset.

The script intentionally leaves `launchesPaused() == true`.

## Governance acceptance

The governance address must explicitly accept the pending ownership on:

- FortuneFactory
- FortuneAssetRegistry
- FortuneAutomationRegistry
- FortuneChainlinkOracle

Do not proceed if any expected ownership transfer is still pending or points at
the wrong address.

## Activation

The final activation validator is:

`contracts/script/ActivateProduction.s.sol`

It is intentionally **non-broadcasting** and never receives a governance private key. The protected **Fortune Mainnet Activation Preflight** workflow runs it against the deployed, still-paused production stack and emits the exact governance calldata for review.

Before any unpause transaction, it verifies:

- chain ID 56;
- contract-based governance owns FortuneFactory and FortuneAssetRegistry;
- metadata registry is bound to the exact factory;
- graduation adapter exists;
- Pancake factory and position manager contain bytecode;
- permanent locker exists and approves the graduation adapter;
- the pinned production quote asset is launchable and oracle-healthy;
- every machine-enforced activation gate in `mainnet-release.json` is complete.

The actual `setLaunchesPaused(false)` transaction must then be submitted separately through the configured governance Safe/multisig. CI does not hold or use a governance signing key.

## Website behavior

The website is network-aware.

On testnet it keeps the public-alpha faucet and valueless fUSD flow. On mainnet,
after the production environment is configured, it exposes:

- real launch preflight + wallet-signed token creation;
- live onchain launch discovery from FortuneFactory;
- direct curve buy and sell flows;
- Launch Shield visibility;
- permissionless Pancake V3 graduation;
- transaction links and chain-backed status;
- light/red and dark/red themes;
- English and Simplified Chinese UI.

Mainnet readiness includes extra hard gates for governance ownership, primary
quote health, explicit release approval, RPC redundancy, and launch activation.

## Important

A passing test suite is evidence, not an audit. No software or financial
protocol can honestly be described as "100% risk-free." Fortune should only
present mainnet as live after the independent and operational release gates above
are actually satisfied.
