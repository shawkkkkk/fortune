# Fortune Mainnet Release

Fortune's repository is structured so production can be prepared without
silently enabling real-value launches.

## Production posture

The BSC Testnet public alpha remains the default deployment until the production
release gates below are complete. Setting `NEXT_PUBLIC_CHAIN_ID=56` alone does
not make Fortune production-ready.

The production deployment script:

- only runs on BNB Smart Chain mainnet (`chainid == 56`);
- receives every external Pancake, asset, oracle, treasury and governance address
  from environment configuration;
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
- `PANCAKE_V3_FACTORY`
- `PANCAKE_V3_POSITION_MANAGER`
- `PRODUCTION_ASSET_COUNT`
- numbered `PRODUCTION_ASSET_N`, `PRODUCTION_FEED_N`,
  `PRODUCTION_MAX_AGE_N`, `PRODUCTION_QUOTE_ENABLED_N`,
  `PRODUCTION_REWARD_ENABLED_N`, `PRODUCTION_GRADUATION_ENABLED_N`,
  and `PRODUCTION_CATEGORY_N` variables.

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

The final activation script is:

`contracts/script/ActivateProduction.s.sol`

It requires:

`CONFIRM_MAINNET_ACTIVATION=ACTIVATE_FORTUNE_MAINNET`

and the private key for the actual FortuneFactory governance owner.

Before unpausing, the script verifies:

- chain ID 56;
- governance owns FortuneFactory and FortuneAssetRegistry;
- metadata registry is bound to the exact factory;
- graduation adapter exists;
- Pancake factory and position manager contain bytecode;
- permanent locker exists and approves the graduation adapter;
- at least one registry asset is both launchable and oracle-healthy.

Only then does it call `setLaunchesPaused(false)`.

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
