# Stock Rewards beta (unaudited, BSC Testnet only)

A Fortune launch paired with one to five stock tokens whose holders earn every
one of those stocks, claimable on-chain at any time with no keeper.

This is a separate Foundry workspace. It builds on the Standard contracts in
`../contracts/src` without changing a line of them: `frozen` is a symlink to
`../contracts`, so every frozen source compiles exactly once, unmodified. The
new code is:

| Contract | Role |
| --- | --- |
| `FortuneStockRewardsToken` | Fixed-supply launch token. Streams every reward-stock token it receives to holders and burns launch tokens sent to it. |
| `FortuneStockRewardsTokenDeployer` | Keeps the token's bytecode out of the factory. |
| `FortuneStockRewardsFactory` | Creates launches from the Standard `FortuneCurve`, `FortuneFeeRouter` and `FortunePancakeV3GraduationAdapter`, graduates them, and collects pool fees. Refuses to deploy on chain 56. |
| `testnet/FortuneTestStock` | Faucet test stock (testnet only). |
| `testnet/FortuneTestStockOracle` | Owner-set test prices, always fresh (testnet only). |

## How a launch works

- **Supply and curve.** 1,000,000,000 tokens on the Standard linear USD curve. The curve sells 550,000,000 to reach the creator's graduation target ($10 to $1,000,000) and ends at ten times its opening price, if stock prices hold.
- **Stocks.** One to five registry stocks, each with a fixed share of the target (10% minimum). Buyers pay with any stock whose share isn't full; once it is, they pay with the others. Every stock therefore ends up with its own pool.
- **Fees on the curve.** Taken in the stock each trade uses: creator 0–1%, holders 0.25–2.5%, protocol 0.5%. The creator can hand their share to holders for good with `FortuneFeeRouter.surrenderCreatorFeesToHolders()`.
- **Launch Shield.** The 99% → 0 tax over five seconds goes to the protocol fee recipient, not to holders, so snipers never get their own tax back.
- **Graduation.** Permissionless `factory.graduate(curve, plan)`. Creates one PancakeSwap V3 pool per stock at the launch's fee tier (0.25% or 1%), locked forever in the `FortunePermanentLiquidityLocker`, then excludes those pools from rewards.
- **After graduation.** Anyone can call `factory.collectPoolFees(token)`. The pools' fees go to the token: the stock side streams to holders, and the launch-token side is burned. PancakeSwap V3 keeps its protocol share first (32% on BSC for both tiers).
- **Rescue.** If graduation stays impossible for seven days, the Standard rescue returns the curve's stocks pro rata. Rewards already earned stay claimable.

## The rewards token

- **Streaming.** New funds stream to holders over 6 hours, pro rata to balance at each moment. Buying just before a large payment and selling right after earns almost nothing, even with a flash loan.
- **Claims.** Holders call `claim()`. Anyone may call `claimFor(accounts)`, which pays each account its own rewards, or `sync()`, which starts streaming funds that arrived since the last transfer.
- **Supply that earns nothing.** The factory, the curve, the graduation adapter, `0x…dEaD` and PancakeSwap pools earn nothing, and their share goes to everyone else. Anyone can exclude a further genuine PancakeSwap V3 pool or V2 pair holding the token with `excludePool`; its unclaimed rewards go back into the stream.
- **Hostile stocks.** A reward stock that reverts, burns gas, returns huge data or refuses transfers never blocks transfers or the other stocks' claims. Its own claim fails, and the amount stays claimable.
- **Gas.** The first transfer in each block releases the streams, about 16,000 gas per stock with an active stream. A gas estimate made in a block that already moved the token leaves that out. MetaMask's 50% buffer covers it, and the website adds 30,000 gas per stock. Third-party front-ends with tight margins can see out-of-gas failures on four- or five-stock tokens.

## Run the suites

The pinned libraries are installed into `../contracts/lib` as for the Standard workspace.

```sh
forge build --sizes
forge test --no-match-contract Fork --fuzz-runs 1000
# Real PancakeSwap V3 on a BSC Testnet fork:
BSC_TESTNET_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org forge test --match-contract Fork -vv
```

- **Unit tests.** Stream maths, fairness by balance and time held, the flash-farming guard, exclusions, pool checks, hostile stocks and a callback during claims.
- **Integration tests.** The full launch → trade → graduate → pool fees → claim path, plus rescue, against PancakeSwap mocks that really hold pool balances.
- **Fuzz suite.** Bookkeeping and pro-rata splits.
- **Invariant suite.** Solvency, conservation and eligible supply across random buys, sells, transfers, burns, claims and donations.
- **Fork test.** The same lifecycle through real PancakeSwap V3 swaps.

## Deploy to BSC Testnet

Run the **Stock Rewards Beta Testnet Deploy + Drill** workflow. It uses the `FORTUNE_TESTNET_PRIVATE_KEY` and `BSC_TESTNET_RPC_URL` repository secrets; never paste a key anywhere else. The workflow:

1. Deploys a dedicated asset registry with eight faucet test stocks (five large caps and three penny stocks), the test oracle, the factory, the locker and the adapter.
2. Runs a real launch → graduation → swap → fee collection → claim drill.
3. Prints `NEXT_PUBLIC_FORTUNE_STOCK_REWARDS_FACTORY_ADDRESS` for Vercel.

`script/DeployStockRewardsTestnet.s.sol` and `script/StockRewardsTestnetDrill.s.sol` can also be run by hand. Pass `--gas-estimate-multiplier 200`: forge simulates every transaction at one timestamp, which skips the token's once-per-block release.
