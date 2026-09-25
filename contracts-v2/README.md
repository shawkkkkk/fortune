# Burn + Rewards v2 research (isolated)

This is a separate Foundry workspace. The Standard mainnet candidate in `contracts/` is unchanged. These contracts are unaudited and are not wired to any factory, website transaction path, deployment workflow or real-money release.

`FortuneRewardTokenV2` is a fixed-supply ERC-20 accounting prototype. It accepts the pair asset directly, tracks rewards through transfers with signed corrections, excludes immutable pool/hook/locker addresses, lets holders claim without a keeper, and burns only caller-owned tokens. It has no way to sell launch tokens for pair assets. Events support a future reproducible ledger.

Run from this directory with Foundry and the pinned libraries already installed in `../contracts/lib`:

```sh
forge test --fuzz-runs 1000 -vv
```

The future Pancake Infinity hook must collect actual token and pair legs through its pinned CLAMM interfaces, settle vault deltas exactly, burn collected launch tokens, and deposit pair fees into this reward accounting path. Hook deployment, factory integration, pool-key verification, deterministic indexing, real BSC fork swaps, independent audit and a distinct release gate are still required. See `../docs/BURN_REWARDS_V2.md`.
