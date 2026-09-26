# Custom pairs (beta)

Status: unaudited beta. Contracts live in `contracts-custom-pairs/`, outside the frozen Standard candidate and the mainnet fingerprint. The website never enables custom-pair launches on BNB Smart Chain mainnet (`lib/custom-pairs.ts` hard-codes that). Updated 2026-09-26.

## Why

LESGO shipped custom pairs on Solana: launch against any token, including Token-2022 tokens with a transfer tax, not only the assets the platform enabled. Fortune's Standard launch pairs only with registry-approved, oracle-priced assets, which is the right default for audited, USD-denominated curves. Custom pairs are the permissionless path on BNB Chain: any BEP-20, including tokenized stocks outside the registry and tokens that tax transfers.

## Design

| Decision | Why |
| --- | --- |
| One curve per launch, holding only its pair token | A hostile or broken pair token can only affect launches that chose it. |
| Price in pair-token units, no oracle | Works for any token; nothing to keep fresh or trust. |
| Every amount measured by balance delta | Transfer taxes (in either direction) never reach the accounting. |
| Sell slippage on what reaches the seller | The UI can promise a minimum the seller actually receives. |
| Constant product with `a0 = target / 3` and virtual token reserve = supply | 16× price from first buy to graduation, 75% sold at the target, and the unsold remainder always covers the pool at the final price for any reserve size. |
| Launch Shield constants identical to Standard | Same anti-sniper behavior and messaging. Shield tax never moves the price and never goes to the creator; it becomes pool depth. |
| Fees accrue in the curve and are pulled | A blacklisted or reverting recipient can never block trading. |
| PancakeSwap V2 pool created in the launch transaction, locked by the token until graduation | Nobody can seed the pool at another price first; V2's balance-based `mint` and the router's fee-on-transfer swaps work with taxed tokens. |
| Graduation is permissionless, prices the pool from what the pool received, burns LP to `0x…dEaD`, and requires its mint to be the pool's only mint | Price continuity even with a tax on the way into the pool; a pair token that reenters the pool from a transfer hook to mint LP for itself makes graduation revert instead of taking the liquidity. |
| Loss order: Launch Shield reserve, then protocol fees, then creator fees, then the reserve | Holders are hit last. |
| Rescue when the reserve is short, or graduation has been impossible for seven days | Live pro-rata redemption of every pair token the curve holds, so later rebases or taxes are shared fairly. |

Curve math (pair base units `R`, virtual pair reserve `a0`, supply `S`):

```
sold(R)            = S * R / (a0 + R)
tokens for net q   = S * a0 * q / ((a0 + R) * (a0 + R + q))      rounded down
pair for t tokens  = t * (a0 + R)^2 / (S * a0 + t * (a0 + R))    rounded down
price(R)           = (a0 + R)^2 / (S * a0)
pool launch tokens = delivered * S * a0 / (a0 + R)^2            capped at inventory
```

## The inspector

`GET /api/public/v1/pairs/inspect?address=…` (`lib/pair-inspector.ts`) measures a token before anyone launches against it:

- Metadata, EIP-1967 implementation/beacon slots, EIP-1167 clones and owner.
- Selector scan of the token and implementation bytecode for pause, blacklist, fee-change, transaction/wallet limits, mint and rebasing functions. A heuristic: presence of a selector, not proof of behavior.
- A transfer simulation with `eth_call` state overrides. The probe (`contracts-custom-pairs/src/FortunePairTokenProbe.sol`) is placed at a fresh wallet whose balance slot is found with `eth_createAccessList` and overridden (like Foundry's `deal`), and at stand-in curve, wallet and pool addresses. It measures wallet → curve (a buy through `transferFrom`), curve → wallet (a sell payout) and curve → pool (graduation). If no slot can be synthesized it falls back to the connected wallet, the burn address, the owner, exchange wallets and DEX pools.
- Verdicts: `unsupported` for no code, unreadable metadata, reverting transfers, 100% tax or tax charged on top; `caution` for any measured tax or control; `clear` otherwise.

Checked on BSC mainnet on 2026-09-26: bStocks, Ondo and xStocks stock tokens measure no transfer tax from a fresh wallet (all upgradeable and mintable; xStocks also rebasing); USDT and WBNB are clear; BabyDoge measures 0% today but is flagged because fees can be changed; SafeMoon v1 is unsupported (99.99% tax).

## Website

- `/launch/custom`: pair-token check, identity, curve and creator fee (0 to 1%), optional first buy with a tax-aware preview, preflight, approval and a simulated transaction before signing.
- `/custom/[curve]`: curve price and market cap in pair units, tax-aware buy/sell quotes, slippage on delivered amounts, graduation, rescue, redemption and creator-fee claims.
- Explore lists custom-pair launches; the Standard launch page links to the beta.
- Configuration: `NEXT_PUBLIC_FORTUNE_CUSTOM_PAIR_FACTORY_ADDRESS` and optional `NEXT_PUBLIC_FORTUNE_CUSTOM_PAIR_TEST_TOKENS` (comma-separated). Ignored on chain 56.

## Deployment

Owner-run workflow `.github/workflows/custom-pairs-testnet-deploy.yml` (confirm with `DEPLOY_CUSTOM_PAIRS_BETA`). It uses the existing `FORTUNE_TESTNET_PRIVATE_KEY` and `BSC_TESTNET_RPC_URL` secrets, refuses any chain but 97, runs the suites, deploys the factory plus faucet tokens tSTONK (5% transfer tax) and tSHARE (no tax), runs a real launch → trade → graduate drill on BSC Testnet PancakeSwap V2, and prints the environment variables to set.

## Verification so far

- Foundry: 35 unit tests with hostile pair tokens, 6 probe tests, 3 fuzz properties at 1,000 runs, 5 invariants over 8,192 random calls, and a BSC mainnet fork against real PancakeSwap V2 (5% tax token, AAPLB, WBNB, router swaps after graduation).
- A mutation check: removing the interleaved-mint guard makes the pool-hijack test fail.
- Local rehearsal: the deploy script and two-phase drill against a BSC Testnet fork, and a full browser run (launch with a first buy, buy, sell, final clamped buy, graduation) on a local chain with the real PancakeSwap V2 factory bytecode.

## Before mainnet

Independent audit of `contracts-custom-pairs/`; economic review of the fixed curve shape and fee caps; owner key on a multisig and a decision on pause scope; monitoring for impaired curves; a separate release gate and fingerprint. Until then the site keeps custom pairs off chain 56.
