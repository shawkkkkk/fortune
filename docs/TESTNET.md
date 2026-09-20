# BSC testnet workflow

Fortune should reach BNB Smart Chain mainnet only after the curve economics, adapters and automation vaults are independently reviewed. The included deployment script therefore creates an **isolated mock stack** on BSC testnet.

## What the script deploys

- FortuneAssetRegistry
- FortuneFactory
- MockGraduationAdapter
- MockUsdOracle
- mock tUSDT
- mock tWBNB

It does **not** register real BSC tokens and does **not** create real PancakeSwap pools.

## Deploy

Set:

```bash
BSC_TESTNET_RPC_URL=https://...
PRIVATE_KEY=...
```

Use a test-only key funded only with BSC testnet BNB.

Then:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge install foundry-rs/forge-std --no-commit

forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url bsc_testnet \
  --broadcast
```

The script prints all deployed addresses.

## Safety boundary

Never use a mainnet private key with this script. Never treat the mock oracle or MockGraduationAdapter as production infrastructure.


## Wire the Pancake V3 graduation research adapter

After the isolated Fortune stack is deployed, the next stage is to test actual pool creation with the configurable graduation adapter.

First independently verify the PancakeSwap V3 factory and position-manager addresses for the **exact test chain**. Then set:

```bash
FORTUNE_FACTORY=0x...
FORTUNE_REGISTRY=0x...
PANCAKE_V3_FACTORY=0x...
PANCAKE_V3_POSITION_MANAGER=0x...
PRIVATE_KEY=...
```

Run:

```bash
forge script script/DeployPancakeGraduation.s.sol:DeployPancakeGraduation \
  --rpc-url bsc_testnet \
  --broadcast
```

The script:
1. verifies that every configured contract address has bytecode;
2. deploys `FortunePermanentLiquidityLocker`;
3. deploys `FortunePancakeV3GraduationAdapter`;
4. authorizes only that adapter as a locker depositor;
5. switches the Fortune factory to the new graduation adapter.

The adapter itself still treats every graduation as conditional. Existing pools with a price too far from the Fortune graduation target fail preflight instead of inheriting a bad market price.

## Testnet graduation drill

Before any mainnet candidate:

1. create single-pair BNB and stablecoin launches;
2. create 2-, 3-, and 5-asset demand-weighted launches;
3. deliberately create a conflicting pool price and confirm graduation refuses it;
4. use an unsupported fee tier and confirm preflight fails without moving reserves;
5. expire the graduation deadline and confirm all transfers roll back;
6. stop one RPC provider and confirm the web/API remain available through failover;
7. graduate successfully and verify every LP NFT is owned by the permanent locker;
8. compare the first Pancake price to `graduationAnchorPriceUsd1e18`;
9. verify unsold inventory was burned and no curve reserve remains stranded;
10. run the web load test while buys and graduation are occurring.

No mainnet release should proceed until all drills are repeatable.
