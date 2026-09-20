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
