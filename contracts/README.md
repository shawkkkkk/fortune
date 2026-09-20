# Fortune contracts

These contracts implement the **testnet research version** of Fortune's multi-asset Basket Curve.

## Install

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge install foundry-rs/forge-std --no-commit
forge test
```

## Core contracts

- `FortuneAssetRegistry` — capability + oracle registry for quote/reward/graduation assets.
- `FortuneChainlinkOracle` — adapter for verified USD price feeds.
- `FortuneFactory` — deploys immutable per-launch token, curve and fee router.
- `FortuneToken` — fixed-supply ERC-20 with the launch manifest hash embedded.
- `FortuneCurve` — accepts 1–5 quote assets while maintaining one sold counter / canonical curve.
- `FortuneFeeRouter` — immutable absolute-bps Fee Matrix for each launch.
- `MockGraduationAdapter` — test-only graduation sink.

## What is intentionally not production-ready

The curve uses a deliberately simple marginal-price approximation. Production economics require simulation and independent review.

The graduation adapter included here **does not create PancakeSwap pools**. A real adapter must be written against the chosen PancakeSwap pool type/version and audited separately.

Holder reward, buyback and LP destinations are vault addresses. Swapping fee assets into a different reward/buyback asset belongs in an approved automation/swap adapter rather than the core curve.

No mainnet deployment should happen before:

1. smart-contract audit;
2. economic/MEV review;
3. oracle and stale-price review;
4. custom-token compatibility review;
5. PancakeSwap adapter review;
6. legal/compliance review for tokenized securities and RWAs.
