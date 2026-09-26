# Fortune custom pairs beta (isolated, unaudited)

Permissionless Fortune launches paired with **any BEP-20**, including tokens that take a tax on transfer and tokenized stocks that are not in Fortune's Asset Registry. This is the BNB Chain answer to "custom pairs with any transfer-tax token": pick any token, launch against it.

This is a separate Foundry workspace. The frozen Standard candidate in `contracts/` and the mainnet fingerprint are unchanged. These contracts are **unaudited**, the deploy script refuses any chain except BSC Testnet (97), and a mainnet release needs its own audit and release gate.

## How it works

| Piece | What it does |
| --- | --- |
| `FortuneCustomPairFactory` | Creates launches. Only checks that the pair token is a contract answering `decimals`, `totalSupply` and `balanceOf`. No registry, no oracle. The owner can pause new launches and set the protocol fee (max 1%) for future launches only. |
| `FortuneCustomPairCurve` | One curve per launch, holding only its own pair token. |
| `FortuneCustomPairToken` | Fixed supply, no owner, mint, fee, blacklist or pause. Nobody can send it to the launch's own PancakeSwap V2 pool before graduation. |
| `FortuneCustomPairCurveDeployer` | Keeps the curve bytecode out of the factory (EIP-170). |

**Transfer taxes.** Every amount the curve receives or pays is measured by balance deltas. A buy uses only what actually arrived; sell slippage is checked against what actually reached the seller; graduation prices the pool from what the pool actually received. The creator's first buy moves tokens straight from the creator to the curve, so a taxed pair is taxed once.

**Pricing.** Constant product with a virtual pair reserve `a0 = target / 3` and a virtual launch reserve equal to the whole supply `S`:

```
sold(R)  = S * R / (a0 + R)
price(R) = (a0 + R)^2 / (S * a0)     pair units per launch-token unit
```

The price rises 16x from the first buy to graduation, 75% of supply is sold at the target, and the unsold remainder always covers the pool at the final curve price. Whatever is left is burned. Prices are in pair-token units; no oracle is involved.

**Launch Shield.** Same constants as the Standard curve: a buy-only 99% opening tax decaying to zero within five seconds, and a 2% per-wallet cap for fifteen seconds. There is no creator exemption. Shield tax never moves the price and is never paid to the creator; it stays in the curve and becomes extra pool depth at graduation.

**Fees.** Protocol fee (set per launch at creation, max 1%) plus an optional creator fee (0 to 1%). Fees accrue inside the curve and are pulled, so a blacklisted or broken recipient can never block trading. The creator can move their fee recipient.

**Graduation.** When the net reserve reaches the target, trading closes and anyone can call `graduate()`. It moves every pair token the curve does not owe as fees into the launch's PancakeSwap V2 pool (created in the launch transaction), adds launch tokens at the final curve price for what the pool received, mints LP to `0x…dEaD` and burns unsold inventory. V2 is used because its balance-based `mint` and the router's `SupportingFeeOnTransferTokens` swaps work with taxed tokens. Donations or a synced pool cannot block it.

**When the pair token misbehaves.**

- Balance shrinks (negative rebase, seizure, tax charged on top): the Launch Shield reserve and unclaimed fees absorb the loss first. If the curve reserve itself is short, trading stops and anyone can open rescue.
- Graduation impossible for seven days (paused token, blacklisted pool): anyone can open rescue.
- Rescue burns unsold inventory and lets holders burn launch tokens for a live pro-rata share of every pair token the curve holds.
- Positive rebases and donations join graduation liquidity; after graduation `sweepExcessToPool()` adds them to the pool.
- A pair token with a max-wallet limit can block buys, never sells.

## Tests

Run with the pinned libraries installed in `../contracts/lib`:

```sh
forge test --no-match-contract Fork --fuzz-runs 1000 -vv
BSC_FORK_RPC_URL=https://bsc-dataseed.bnbchain.org forge test --match-contract Fork -vv
```

- Unit tests with hostile pair tokens: 5–10% transfer tax, tax charged on top, share-based rebasing (up and down), pause and blacklist, USDT-style missing return values, reentrancy on every transfer, max-wallet limits, a transfer hook that tries to mint the graduation LP for itself, and 0, 6, 8, 18 and 24 decimals.
- `FortunePairTokenProbe`: the read-only probe the website runs through `eth_call` state overrides to measure a token's tax on each leg before launch. Never deployed.
- Fuzz: a round trip never profits, pool price continuity at graduation for any tax and target, and solvency across random trade sequences.
- Invariants (random buys, sells, donations, time jumps, fee claims and graduation): the pair balance covers everything owed, circulating supply equals what holders hold, the curve never sells more than its formula allows, and every holder can still exit.
- BSC mainnet fork: real PancakeSwap V2 with a 5% tax token, the bStocks Apple token (AAPLB) and WBNB, including swaps through the real router after graduation.

CI: `.github/workflows/custom-pairs-beta.yml`. Testnet deployment is owner-run: `.github/workflows/custom-pairs-testnet-deploy.yml` deploys the factory and two faucet test tokens (tSTONK with a 5% transfer tax, tSHARE without), then runs a real launch → trade → graduate drill on BSC Testnet Pancake V2.

## Before any mainnet use

Independent audit of this workspace, economic review of the fixed curve shape and fee caps, a decision on the owner key (multisig) and pause scope, monitoring for impaired curves, and a distinct release gate. See `../docs/CUSTOM_PAIRS.md`.
