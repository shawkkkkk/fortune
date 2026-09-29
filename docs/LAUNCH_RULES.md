# Launch rules (custom-pairs beta)

A custom-pair launch can choose rules that its token enforces on every transfer until graduation. Examples: a cap on how much one wallet holds, a cap on each sell, early-buyer vesting, or an allowlist for the first minutes. The idea follows HookedPad's per-launch transfer hooks on Solana, rebuilt for BNB Chain with one difference that matters: **rules are fixed at launch and nobody can change them afterwards**. That includes the creator and Fortune.

Rules are optional. A launch without them behaves exactly as before, and every launch still has the Launch Shield (99% tax decaying to zero in 5 s, and a 2% wallet cap for 15 s), which is built into the curve.

## The rules

| Rule | What it does | Range |
| --- | --- | --- |
| Max wallet | No wallet may hold more than this share of supply | 0.5% to 10% |
| Max buy | Each curve buy takes at most this share of supply | 0.1% to 10% |
| Max sell | Each curve sell returns at most this share of supply | 0.05% to 10% |
| Sell cooldown | A wallet waits this long between curve sells | up to 1 day |
| Curve-only | Until graduation, tokens move only through the curve (buys and sells), not wallet to wallet | on or off |
| Early-buyer vesting | Tokens bought in the first N seconds stay locked until a cliff, then unlock evenly. The cliff and the unlock count from launch, not from each buy. | window up to 1 day, ending no later than the unlock; cliff plus unlock up to 30 days |
| Allowlist | For the first minutes, only listed addresses can buy | up to 1 hour, 200 addresses |
| Holder gate | For the first minutes, only holders of a chosen token (at least a minimum balance) can buy | up to 1 hour |
| Exempt wallets | Listed wallets may exceed the wallet and buy caps, move tokens under curve-only, and buy during access windows | up to 10, public |

Exempt wallets are never exempt from sell caps, sell cooldowns or vesting: anti-dump rules apply to everyone, the creator included. The creator can always buy during an access window, so the optional first buy in the launch transaction works. The creator's first buy is also subject to the caps, and vests like anyone else's when vesting is on.

Presets on the launch form:
- **Fair launch:** 1% max wallet, 0.5% max buy, curve-only.
- **Anti-dump:** 0.25% max sell, one minute between sells.
- **Sniper vesting:** buys in the first 60 s stay locked until an hour after launch, then unlock evenly over 24 hours.

## Guarantees

- **Fixed at launch.** `FortuneLaunchRules` has no owner, no setter and no upgrade path. The factory registers a launch's rules once, inside the launch transaction; a second registration reverts. The token stores the rules contract address as an immutable.
- **They end.** The token stops consulting the rules the moment the curve graduates. The rules contract ignores any transfer once the curve has opened rescue. After graduation the token trades on PancakeSwap like any other token, and scanners see no live transfer restriction.
- **They cannot trap funds:**
  - Sell caps and cooldowns only pace sales.
  - Vesting ends by a fixed time within 30 days of launch.
  - Every buy that vests is locked when it lands. The window can't outlast the unlock, so a rule can never claim to vest buys that are already free.
  - Curve-only never blocks selling to the curve.
  - Rescue redemptions are never blocked, because the rules stop when rescue opens.
  - Graduation cannot be blocked either, because the pool transfer happens after the token has opened.
- **Mints and burns are never ruled,** so graduation's burn of unsold inventory, and holders burning their own tokens, always work.
- **Public before anyone buys.** The market page lists every rule in plain words, with the exempt wallets. The launch registers them in `RulesRegistered` and `AccessRulesRegistered` events.

What rules cannot do: stop one person from using many wallets (caps are per address), or vouch for the creator. They are pacing and access tools, not a promise that a token is safe.

## How it works

- `FortuneCustomPairToken` (version 2) takes an optional `rules` address at deployment. In `_update`, after the balance change, it calls `rules.onTransfer(from, to, value, fromBalance, toBalance)`. It skips mints and burns, and stops calling once the pool opens at graduation. A revert refuses the transfer.
- `FortuneLaunchRules.onTransfer` treats a transfer from the curve as a buy, one to the curve as a sell, and anything else as a wallet transfer:
  - **Buy:** access windows, then the max buy, then the max wallet, then the vesting record.
  - **Sell:** the max sell, then the cooldown, then vesting.
  - **Wallet transfer:** curve-only, then the max wallet, then vesting.
  Each refusal is a custom error (`RulesMaxWallet(cap)`, `RulesVestingLocked(locked)` and so on) that the website turns into a sentence.
- The holder gate reads `balanceOf` with a `staticcall` capped at 50,000 gas, and copies only the first word of the reply. A gate token that misbehaves can only keep its own window shut: it cannot burn a buyer's gas or make anyone pay to copy a huge reply.
- Views for wallets and integrators: `rulesOf`, `capsOf`, `active`, `lockOf`, `sellReadyAt`, `canBuyNow`, `isExempt`, `isAllowlisted`, `checkRules`.
- `FortuneCustomPairFactory` gains `launchRules()`, `preflightWithRules(params, rules)` and `createLaunchWithRules(params, rules, amountIn, minTokensOut)`, where `rules` is `abi.encode(FortuneLaunchRules.Rules)`. The existing `createLaunch` and `createLaunchAndBuy` are unchanged, so the website keeps working with a factory from before launch rules. It detects support with `launchRules()` and only then shows the rules form.

### Deployment

The rules contract is bound to its factory's address, and the factory checks that binding in its constructor.
- **Order:** `DeployCustomPairsTestnet` deploys the rules contract first, at the factory's predicted address (the deployer's next nonce), then the factory. It prints `CUSTOM_PAIR_LAUNCH_RULES`. A factory built with a zero rules address simply does not offer rules.
- **Why separately:** deploying the rules contract inside the factory would push the factory past the EIP-3860 initcode limit. Sizes now:
  - factory: 17.4 KB runtime, 40.9 KB initcode;
  - curve deployer: 22.5 KB runtime;
  - rules: 8.9 KB.
- **Testnet upgrade:** existing launches keep working. Launch rules need a new factory, deployed with the owner-run workflow, and the site pointed at it.

## Compared with HookedPad

Fortune offers the rules people ask for most. The rest are left out on purpose:

| HookedPad | Fortune |
| --- | --- |
| Hook programs upgradeable by the deployer | Immutable: nobody can change a launch's rules |
| Anti-dump caps, max per wallet, trade guard | Max wallet, max buy, max sell, sell cooldown |
| Holder vesting | Early-buyer vesting with cliff and linear unlock |
| Allowlist (Merkle), holder-gated | On-chain allowlist (up to 200) and holder gate, both time-boxed |
| Venue-locked | Curve-only transfers |
| Tithe (donation per trade) | Already covered by creator fee splits to any wallet or social account |
| Airdrop vault | An exempt wallet can hold and distribute tokens |
| Anti-bundle (max trades per block) | Not offered: anyone could fill each block's quota with dust trades and lock others out |
| Chapters, reactive pairs, entangled/beacon unlocks | Not in v1 |

## Website

- **`/launch/custom`:** an optional **Launch rules** section, with the three presets and every setting, when the configured factory supports rules.
  - The review list states the rules in plain words.
  - A holder gate's minimum is written in the gate token's own units, so the form won't launch until it has read that token's decimals.
  - The preflight checks them onchain before anything is signed.
  - A first buy over a cap is caught in simulation and explained.
- **`/custom/[curve]`:** a **Launch rules** panel listing the rules, whether they still apply, the exempt wallets and when access windows end.
  - For the connected wallet it shows the tokens still vesting, which count down live with the contract's unlock math, their unlock times, the next allowed sell, and whether it can buy yet.
  - The trade panel refuses trades a rule would refuse before any signature, and decodes rule reverts.
  - When an access window closes, the panel re-reads the wallet's access within about two seconds, so buyers waiting for the opening are not held back by a stale check.
  - Countdowns, vesting and cooldowns follow chain time. The page reads the latest block and ignores the device clock whenever the two differ by more than a minute.
- **Explore:** custom-pair launches with live rules carry a **Launch rules** badge.
- **API:**
  - `GET /api/public/v1/custom-pairs` reports the factory's `launchRules` and each launch's `rulesContract`.
  - `GET /api/public/v1/custom-pairs/{curve}` includes `rules` (settings, caps in tokens, exempt wallets, `active`).

## Verification so far

- **Foundry:** 17 launch-rules tests, covering:
  - each bound and reason code, and the preflight;
  - immutability, and that anyone can call the hook without effect;
  - wallet and buy caps, including exemptions;
  - sell cap and cooldown for exempt wallets too;
  - curve-only through exempt wallets;
  - vesting including the creator's first buy;
  - a 1,000-run fuzz over every accepted window, cliff, unlock and buy time: a buy in the window is locked when it lands, vesting only ever unlocks, and the free part always sells;
  - a buy in the last second of a vesting window, locked exactly as the displayed schedule says, and a window longer than the unlock refused at preflight;
  - allowlist and gate windows, a gas-burning gate token, and a gate token that replies with 100 KB;
  - rules ending at graduation, including a pool sell of formerly vested tokens;
  - a max-wallet launch still graduating;
  - a fully vested holder redeeming in rescue.
  All 75 earlier custom-pairs tests still pass.
- **Mutation checks:** each of these makes a test fail:
  - rules running during rescue;
  - sells skipping vesting;
  - exempt wallets skipping the sell cap;
  - dropping curve-only;
  - nothing vesting;
  - vesting ending late;
  - copying a gate token's whole reply;
  - accepting a vesting window longer than the unlock.
- **Browser rehearsal on a local BSC Testnet node (chain 97):** the deploy script, the production site build, and a launch made through `/launch/custom` with all three presets. Then:
  - the review list and the API report every rule;
  - a buy over the max buy is refused before signing;
  - a buy inside the vesting window vests, and the wallet panel shows it locked;
  - a sell is refused while everything is locked;
  - a wallet-to-wallet transfer reverts onchain (curve-only);
  - 13 hours later, half is unlocked, and sells over the max sell or over the unlocked part are refused before signing;
  - a sell within both limits goes through, and the next sell is refused for the 60 s cooldown;
  - Chinese, dark mode and a phone-width screen show no overflow;
  - axe reports no violations on the editor or the panel;
  - Explore shows the badge.
  The same run passed with the node's clock 39 hours ahead of the browser's.
- **Access-window rehearsal:** a second launch with a 10-minute allowlist, a 20-minute holder gate (at least 100 tSTONK) and one exempt wallet.
  - The form refused to launch until it could read the gate token's decimals.
  - A gate-token holder not on the allowlist was refused before signing until minute 10; a wallet without the gate token was refused until minute 20.
  - The allowlisted wallet bought at once, and the exempt wallet bought 1.46% of supply past the 1% wallet cap.
  - The English and Chinese panels showed when the access limits end.
- **Opening-moment rehearsal:** with blocks every second, a 1-minute allowlist and a 2-minute gate, and pages left open with no reload:
  - a gate holder's Buy button unblocked 1.5 s after the allowlist closed, while a wallet without the gate token stayed blocked;
  - that wallet unblocked the second the gate closed;
  - both buys went through.
- **Web tests:**
  - website limits mirror the contract constants;
  - form validation uses the contract's reason codes;
  - presets, and the ABI encoding round trip;
  - plain-language summaries in English and Chinese, including vesting with no cliff or no unlock period;
  - the live vesting amount matching the contract's rounding;
  - the market clock following the chain only when the device clock is clearly off;
  - revert decoding;
  - the exported ABIs.

## Before mainnet

These are part of the custom-pairs audit scope: an independent audit of `FortuneLaunchRules` and the token hook, and a review of the rule bounds. Custom pairs stay on BSC Testnet until their own release gate passes.
