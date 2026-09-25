# Fortune Burn + Rewards v2 — BNB-Native Design

Status: research / implementation target. This document does not enable mainnet.

## Implementation snapshot

The independent `contracts-v2/` Foundry workspace now contains an unaudited fixed-supply token and pair-asset reward-accounting prototype. It tests transfer corrections, immutable reward exclusions, burn entitlement, direct holder claims and solvency under 1,000 randomized transfer/burn/fund/claim sequences. It has no factory or market integration and is not deployed. The Standard candidate in `contracts/` is unchanged. The legacy tax-token/Pancake V2 contracts are not this v2 implementation.

Infinity pool fees cannot be inferred from a token transfer tax. The official [PancakeSwap hook guide](https://developer.pancakeswap.finance/contracts/infinity/guides/develop-a-hook) and [fee hook example](https://developer.pancakeswap.finance/contracts/infinity/guides/hook-examples/taking-fee-via-hook) show hook permissions and return-delta settlement. A dedicated v2 hook still needs pinned Infinity interfaces, direction-sensitive exact-input/output tests, vault settlement proofs, reward-pot funding, and real BSC mainnet fork swaps. This reward-accounting prototype does not meet any of those hook gates.

The prototype rejects reward deposits while no eligible holders exist. A future hook must define and audit an immutable zero-holder routing policy so swaps never silently trap funds or award past fees to buyers who arrive later. Tiny integer-division remainder remains in the pair-asset contract balance; ledger views must show both funded and claimed amounts instead of treating every wei as distributed.

Fortune Burn + Rewards v2 is the BNB-native successor to the existing fee-on-transfer / Pancake V2 research stack.

The design goal is simple:

> Never sell the launch token to fund rewards.

The existing tax-token stack remains useful testnet evidence, but it is not the intended production architecture for Burn + Rewards v2.

## Why BNB lets Fortune do better

PancakeSwap Infinity supports immutable per-pool hooks that can execute around swaps and can return custom swap deltas. Fortune can therefore attach burn/reward logic to the market instead of embedding a broad transfer tax into the token.

That gives Fortune several advantages:

- normal wallet-to-wallet ERC-20 transfers can remain free of launch taxes;
- CEX/wallet integrations see a much more standard token;
- swap-side launch-token fees can be burned directly;
- pair-asset fees can be routed directly to holder rewards/platform accounting;
- the launch token never has to be sold by a processor to finance rewards;
- the hook is fixed when the pool is initialized;
- each pool can expose its hook and configuration publicly.

## Target lifecycle

### 1. Curve phase

A Burn + Rewards launch starts on a Fortune curve using one reviewed pair asset.

The curve should support two immutable economic components:

- a launch-token burn component on curve trades;
- a pair-asset reward/platform component.

Neither component may require selling launch tokens into the pair asset.

The exact curve-phase burn accounting remains subject to simulation and audit because burning inventory changes the graduation supply equation.

### 2. Graduation

At graduation, the curve migrates into a PancakeSwap Infinity pool with the Fortune Burn + Rewards hook permanently selected in the pool key.

The graduation transaction must atomically verify:

- the expected launch token;
- the expected pair asset;
- the expected hook;
- the immutable hook configuration hash;
- the initial pool price;
- the liquidity amount;
- the permanent liquidity-custody destination.

A pool created without the exact Fortune hook/config must never be accepted as an official Fortune Burn + Rewards market.

### 3. Post-graduation swaps

The hook has two independent fee concepts.

#### Launch-token burn fee

When a swap touches the launch-token side, the hook may collect a bounded share of that launch-token leg and send it only to an irreversible burn path.

The hook must expose no method that transfers collected launch tokens to governance, creator, treasury, executor, or an arbitrary address.

Security invariant:

> Launch tokens collected by the burn path can only be burned.

#### Pair-asset reward fee

The hook may collect a bounded share of the pair-asset leg and split it between immutable destinations such as:

- holder reward accumulator;
- protocol treasury;
- optional creator allocation;
- optional ecosystem/flywheel allocation.

Security invariant:

> Holder rewards are funded in the pair asset directly. No launch-token sale is permitted to fund them.

## Holder rewards

Production v2 should prefer onchain accounting over an operator-only snapshot job.

Target properties:

- rewards accrue in the pair asset;
- newly acquired tokens cannot claim rewards accrued before they were held;
- transfers preserve already-earned rewards;
- pool, hook, locker, protocol and zero/dead addresses are excluded;
- reward accounting never requires iterating all holders;
- a holder can always claim directly;
- an optional keeper may batch/pay claims for UX, but keeper availability is not required for solvency;
- every funded reward and every claim is an event that the public Rewards page can reconstruct.

A magnified-reward-per-share / correction model is the preferred research direction because it can preserve historical entitlement through transfers without an offchain balance snapshot authority.

## Burns ledger

Every burn should emit enough data for a deterministic public ledger:

- pool/launch identifier;
- launch token;
- pair asset;
- swap or settlement transaction context;
- token amount burned;
- cumulative token amount burned.

The Burns page must derive totals from chain events. No manually entered burn counter.

## Pair universe

Fortune v2 is designed for BNB Chain rather than a single pair asset.

Expansion lanes:

1. WBNB / BNB;
2. stablecoins such as reviewed USDT/USDC representations;
3. BNB-native majors and DeFi assets;
4. compatible tokenized equities/RWAs such as reviewed xStocks/bStocks representations;
5. arbitrary BEP-20 assets that pass token-behavior, oracle and liquidity/graduation checks.

A token being present on BNB Chain is not sufficient for approval.

## Any BEP-20

The eventual custom-pair flow should accept a contract address and run a compatibility report before launch.

Checks should include:

- chain ID and bytecode;
- decimals/symbol/name sanity;
- fee-on-transfer behavior;
- rebase/balance mutation behavior;
- blacklist/pause/admin transfer restrictions where detectable;
- oracle/pricing source;
- current liquidity/depth;
- Pancake Infinity compatibility;
- asset-policy or legal/eligibility flags;
- exact launch/graduation configuration.

The UI should show the reason an asset is rejected instead of silently hiding it.

## BNB-native product advantages

Fortune should use the BNB ecosystem instead of merely living on BSC:

- Pancake Infinity hooks for Burn + Rewards markets;
- Pancake routing after graduation;
- Binance Wallet / Trust Wallet / MetaMask compatible wallet flow;
- Binance Web3 market/RWA discovery where available;
- xStocks/bStocks discovery with explicit provider/eligibility labeling;
- BscScan-verifiable burns, rewards and deployment state;
- pair-asset rewards in BNB ecosystem assets;
- public API endpoints for agents, terminals and third-party launch discovery.

## Configuration bounds

Production parameters must be narrower than the research/testnet stack.

The following require explicit reviewed caps:

- launch-token burn BPS;
- pair-asset reward/platform fee BPS;
- total effective swap fee;
- creator allocation;
- minimum reward distribution threshold;
- reward-excluded addresses;
- pool type (Infinity CLAMM/LBAMM);
- price/deviation/slippage bounds;
- custom-pair eligibility.

No production UI option should exceed the onchain bounds.

## Migration from the legacy tax stack

The current contracts:

- FortuneTaxToken
- FortuneTaxProcessor
- FortuneDividendVault
- FortunePancakeV2TaxGraduationAdapter
- FortunePermanentV2LiquidityLocker

remain testnet/research evidence.

They must not be silently relabeled as v2.

Burn + Rewards v2 should be deployed as a distinct version with explicit new addresses and a new audit/release boundary.

## Required proof before mainnet

Before enabling Burn + Rewards v2 with real funds:

1. implement the Pancake Infinity hook against pinned official interfaces;
2. unit-test both swap directions and exact-input/exact-output paths;
3. prove the hook cannot route launch tokens anywhere except burn;
4. prove reward accounting conservation;
5. fuzz transfer/reward/claim ordering;
6. fuzz zero/dust/rounding behavior;
7. test real BSC mainnet-fork Infinity pool initialization and swaps;
8. review hook fee interaction with Pancake LP/protocol fees;
9. complete independent hook + reward-accounting audit;
10. publish a deterministic Burns and Rewards indexer;
11. add a separate release gate before the product enables the mode.

## Product UX

The default user-facing flow should remain:

1. name;
2. ticker;
3. image;
4. Standard or Burn + Rewards;
5. pair asset;
6. optional creator first buy;
7. review;
8. sign.

Advanced economics should be a deliberate secondary surface, not the default launch form.
