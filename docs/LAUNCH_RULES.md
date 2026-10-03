# Launch rules (custom-pairs beta)

A custom-pair launch can choose rules that its token enforces on every transfer until graduation. Examples: a cap on how much one wallet holds, a cap on each sell, vesting, an allowlist for the first minutes, or trading only during US stock-market hours. The idea follows HookedPad's per-launch transfer hooks on Solana, rebuilt for BNB Chain with one difference that matters: **rules are fixed at launch and nobody can change them afterwards**. That includes the creator and Fortune.

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
| Exempt wallets | Listed wallets may exceed the wallet and buy caps, move tokens under curve-only, buy during access windows, and skip the gas cap and anti-bundle limit | up to 10, public |

The trade rules below follow HookedPad's hooks:

| Rule | What it does | Range |
| --- | --- | --- |
| Market hours | Curve buys and sells only Monday to Friday, 9:30am to 4:00pm New York time, like a stock. Daylight saving time, the NYSE's ten holidays and its three 1:00pm early closes are worked out onchain. Wallet-to-wallet sends always work. | Options: keep sells open around the clock; ignore holidays |
| Graduated sell caps | A wallet holding up to the small holders' cap sells up to that much at once. Bigger bags get a smaller cap per sell, falling evenly to a floor for the biggest bags | small 0.05% to 5%, floor 0.01% to 1%, big bag 0.5% to 10% |
| Sliding caps | The max per buy and per sell change with graduation progress: launch caps, then up to five levels | caps 0.1% to 10% per buy, 0.05% to 10% per sell, or none |
| Rising max per wallet | Starts small and rises on a timer, by a fixed step or doubling, until it limits nobody | start and step 0.01% to 5%, every 1 minute to 1 day |
| Chapters | Starts small and doubles each time another slice of supply trades on the curve | start 0.1% to 5%, chapter 0.1% to 10% of supply traded |
| Sniper gas cap | For a window after launch, a buy paying more than the cap per gas is refused | 0.1 to 100 gwei, for 1 minute to 1 day |
| Anti-bundle | At most N buys of at least a minimum size in one block | 1 to 20 buys, counting buys of 0.01% to 1% of supply or more |
| Holder vesting | Every buy locks on its wallet's own clock: nothing during a cliff, then a share every period. A later buy restarts the clock for what is still locked. Can apply to every buy or only to buys in the first minutes | cliff up to 7 days, 0.1% to 100% every 1 hour to 7 days, all free within 30 days; window 1 minute to 7 days |

As on HookedPad, each cap comes from one rule: max wallet, the rising max per wallet and chapters all cap wallets; max sell, graduated sell caps and sliding caps all cap sells; sliding caps also set the buy cap; and early-buyer vesting and holder vesting are alternatives. Everything else combines.

Exempt wallets are never exempt from sell caps, sell cooldowns, vesting or market hours: anti-dump rules apply to everyone, the creator included. The creator can always buy during an access window, so the optional first buy in the launch transaction works, and is not held to the gas cap. The creator's first buy is also subject to the caps, vests like anyone else's when vesting is on, and is refused outside market hours.

Presets on the launch form:
- **Fair launch:** 1% max wallet, 0.5% max buy, curve-only.
- **Anti-dump:** 0.25% max sell, one minute between sells.
- **Sniper vesting:** buys in the first 60 s stay locked until an hour after launch, then unlock evenly over 24 hours.

HookedPad-style presets, with HookedPad's defaults:
- **Stock hours:** market hours, holidays observed.
- **Whale guard:** graduated sell caps of 1%, down to 0.1% for bags of 3% or more.
- **Sliding caps:** 2% per buy and 1% per sell at launch, 0.5% per sell from 25% progress and 0.1% from 60%.
- **Slow open:** max per wallet 0.1%, rising 0.1% every 5 minutes.
- **Chapters:** max per wallet 1%, doubling every 1% of supply traded.
- **Anti-sniper:** a 1 gwei gas cap for 10 minutes, and at most 3 buys of 0.05% of supply or more per block.
- **Holder vesting:** every wallet's buys locked for 24 hours, then 10% a day.

A preset clears any rule that would set the same cap, so presets can be pressed in any order.

## Guarantees

- **Fixed at launch.** `FortuneLaunchRules` has no owner, no setter and no upgrade path. The factory registers a launch's rules once, inside the launch transaction; a second registration reverts. The token stores the rules contract address as an immutable.
- **They end.** The token stops consulting the rules the moment the curve graduates. The rules contract ignores any transfer once the curve has opened rescue. After graduation the token trades on PancakeSwap like any other token, and scanners see no live transfer restriction.
- **They cannot trap funds:**
  - Sell caps, cooldowns and market hours only pace sales. The longest market closure is a long holiday weekend, under four days.
  - Early-buyer vesting ends by a fixed time within 30 days of launch. Holder vesting frees every wallet within 30 days of its last vesting buy, a time the holder chooses.
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
- **Market hours** comes before everything else on curve buys and sells, for everyone. `FortuneMarketCalendar` is pure arithmetic: New York's UTC offset from the daylight-saving rule, the date from the timestamp, and the NYSE's standing holiday rules (Rule 7.2), including Good Friday from the date of Easter and a Saturday New Year's Day not observed on the Friday before. A one-off closure announced at short notice, such as a national day of mourning, cannot be known in advance.
- **Sliding caps** are judged at the level the curve stood at before the trade. After every trade the contract records the level it left, from the curve's `graduationProgressBps`. So a big sell cannot escape a level's tighter cap by pushing the price under it, and a level falls back when the market does. The curve's price grows as (1 + 3p)² of its opening price at progress p, so each level is also a market cap.
- **Chapters** count curve buys and sells, and a trade is judged at the chapter before it. Volume can be bought with round trips, but every trade pays the curve's fees.
- **The gas cap** reads `tx.gasprice`. It stops the plain priority-gas auction at a launch. It can't see a bribe paid to a block builder in a separate transaction, so pair it with the anti-bundle limit.
- **Anti-bundle** counts only buys of at least the minimum size, so nobody can fill a block's quota with dust. Smaller buys are neither counted nor refused, and sells are never limited.
- **Holder vesting** keeps, per wallet, what was locked when its clock last started and when that was. A vesting buy restarts the clock for everything still locked plus the new buy, so every buy is fully locked when it lands and all of a wallet's tokens are free within 30 days of its last vesting buy. Tokens a wallet receives from another wallet are not vested.
- The holder gate reads `balanceOf` with a `staticcall` capped at 50,000 gas, and copies only the first word of the reply. A gate token that misbehaves can only keep its own window shut: it cannot burn a buyer's gas or make anyone pay to copy a huge reply.
- Views for wallets and integrators: `rulesOf`, `tradeRulesOf`, `capsOf` (the caps the next trade meets), `sellCapOf`, `flowOf`, `walletClockOf`, `active`, `lockOf`, `sellReadyAt`, `canBuyNow`, `marketStatus`, `isMarketOpen`, `isExempt`, `isAllowlisted`, `checkRules`.
- `FortuneCustomPairFactory` gains `launchRules()`, `preflightWithRules(params, rules)` and `createLaunchWithRules(params, rules, amountIn, minTokensOut)`, where `rules` is `abi.encode(FortuneLaunchRules.Rules)`. The existing `createLaunch` and `createLaunchAndBuy` are unchanged, so the website keeps working with a factory from before launch rules. It detects support with `launchRules()` and only then shows the rules form.

### Deployment

The rules contract is bound to its factory's address, and the factory checks that binding in its constructor.
- **Order:** `DeployCustomPairsTestnet` deploys the rules contract first, at the factory's predicted address (the deployer's next nonce), then the factory. It prints `CUSTOM_PAIR_LAUNCH_RULES`. A factory built with a zero rules address simply does not offer rules.
- **Why separately:** deploying the rules contract inside the factory would push the factory past the EIP-3860 initcode limit. Sizes now:
  - factory: 17.4 KB runtime, 40.9 KB initcode;
  - curve deployer: 22.5 KB runtime;
  - rules: 21.0 KB, with every trade rule and the market calendar.
- **Testnet upgrade:** existing launches keep working. Launch rules need a new factory, deployed with the owner-run workflow, and the site pointed at it.

## Compared with HookedPad

Fortune offers HookedPad's rules that make sense on BNB Chain. The rest are left out on purpose:

| HookedPad | Fortune |
| --- | --- |
| Hook programs upgradeable by the deployer | Immutable: nobody can change a launch's rules |
| Anti-dump caps, max per wallet, trade guard | Max wallet, max buy, max sell, sell cooldown |
| Graduated sell caps | Graduated sell caps, same settings |
| Sliding caps by pool market cap | Sliding caps by graduation progress, which sets the curve's price and so its market cap |
| Rising max per wallet, fixed step or doubling | Same |
| Chapters | Same, counted in curve volume |
| Sniper-fee cap (priority fee and Jito tip) | Gas-price cap; it can't see a builder bribe sent in a separate transaction |
| Anti-bundle (max trades per block) | Max buys per block, counting only buys above a minimum size, so dust can't lock others out |
| Market hours, with sells-open and holiday options | Same, with daylight saving time, NYSE holidays and early closes worked out onchain |
| Holder vesting (per-wallet clock) | Same, with a later buy restarting the clock for what is still locked, so an early dust buy can't free later buys |
| Allowlist (Merkle), holder-gated | On-chain allowlist (up to 200) and holder gate, both time-boxed |
| Venue-locked, DEX-only | Curve-only transfers |
| Tithe (donation per trade) | Already covered by creator fee splits to any wallet or social account |
| Buyer rewards | Holders earn the pair stocks in Stock Rewards launches |
| Airdrop vault | An exempt wallet can hold and distribute tokens |
| FOMO-only, Pump-app-only, social trading, OpenSea-only | Not applicable: they gate specific Solana apps |
| P2P-only | Not offered: holders could not sell back to the curve |
| Reactive pairs, Beacon and Entangled tokens | Not yet: they link two launches |

## Website

- **`/launch/custom`:** an optional **Launch rules** section, with the ten presets and every setting, when the configured factory supports rules. Sliding-cap levels show the market cap each one stands for, and holder vesting shows when every wallet will be free. A first buy is refused before signing while a market-hours launch's market is closed.
  - The review list states the rules in plain words.
  - A holder gate's minimum is written in the gate token's own units, so the form won't launch until it has read that token's decimals.
  - The preflight checks them onchain before anything is signed.
  - A first buy over a cap is caught in simulation and explained.
- **`/custom/[curve]`:** a **Launch rules** panel listing the rules, whether they still apply, the exempt wallets and when access windows end. It also shows whether the market is open and when that changes, in New York time; the caps the next trade meets, with the sliding level, the chapter or the next rise of the wallet cap; and how long the gas cap lasts.
  - For the connected wallet it shows the tokens still vesting, which count down live with the contract's unlock math, their unlock times, its own sell cap under graduated caps, the next allowed sell, and whether it can buy yet.
  - The trade panel refuses trades a rule would refuse before any signature, and decodes rule reverts. During a gas-cap window it sends buys at the network gas price, and says so if that price is above the cap.
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

### Trade rules (v2)

- **Foundry:** 25 more tests, covering:
  - every bound and reason code, and the one-rule-per-cap conflicts;
  - preflight and registration;
  - market hours: closed nights, weekends, holidays and for the creator, sells kept open, holidays ignored, wallet sends always allowed;
  - graduated sell caps for small, middle and big bags, exempt wallets included;
  - sliding caps level by level, including a sell refused at the level it started from;
  - rising caps by step and by doubling, up to no cap at all;
  - chapters by buy and sell volume, with a buy that would cross into the next chapter judged at the cap before it;
  - the gas cap, with the creator and exempt wallets excepted, sells never capped, and the window ending;
  - anti-bundle: small buys, exempt buys and sells not counted, and a new block resetting the count;
  - holder vesting on separate wallet clocks, the restart of a later buy, and the early-buys window;
  - a 1,000-run fuzz showing vesting only ever unlocks and ends on schedule;
  - every trade rule ending at graduation and when rescue opens;
  - gas: every trade rule together adds about 41,000 gas to a curve buy.
- **The market calendar against an independent reference:** `test/data/nyse-calendar.json` holds every day from 2026 to 2045, from exchange_calendars' XNYS calendar and the IANA time zone database. The contract matches it every day at the minute either side of the open, the early close and the close, with holidays observed and ignored, and at each year's daylight-saving changes. The website's mirror (`lib/market-calendar.ts`) is checked against the same file. Easter dates are checked against known dates, including the earliest and latest possible.
- **Mutation checks:** each of these makes a test fail:
  - a sell judged at the level it leaves;
  - sells kept open ignored;
  - wallet sends closed after hours;
  - Good Friday, early closes, the Saturday New Year's rule or a Friday Juneteenth wrong;
  - daylight time an hour early;
  - sells or small buys counted against the bundle limit;
  - exempt wallets gas-capped, or the gas cap never ending;
  - later buys joining the old vesting clock;
  - the first share unlocking at the cliff;
  - the early-buys window ignored;
  - graduated caps from the bag after the sell, or skipped for exempt wallets;
  - a whole-supply cap still enforced;
  - chapters judged after the trade's volume;
  - conflicting wallet caps accepted;
  - rules running in rescue.
- **Web tests:** the website's limits mirror the new constants. The form uses the same reason codes and conflicts. The struct the form encodes matches the contract ABI field for field. The live math (holder vesting, rising and chapter caps, graduated sell caps) follows the contract's formulas. Sentences in English and Chinese, and the new revert messages, are covered too.
- **Browser rehearsal on a local chain-97 node,** with BNB Chain-like gas and the chain clock on a weekday session:
  - a launch made through `/launch/custom` with the Stock hours, Whale guard, Slow open, Anti-sniper and Holder vesting presets. Slow open replaced Fair launch's fixed max wallet instead of conflicting with it. The review list and the API reported every rule;
  - the panel showed "Market open · closes 4:00 PM ET". A buy over the rising wallet cap was refused before signing. A buy within it was sent at the 1 gwei cap and vested on the wallet's own clock, with its next unlock shown;
  - onchain, a 5 gwei buy was refused with `RulesGasPrice` and the same buy at 1 gwei went through. Of four counted buys sent into one block, the fourth was refused with `RulesBundle`;
  - on the Saturday the panel showed "Market closed · opens Mon 9:30 AM ET". Buys and sells were refused before signing and onchain (`RulesMarketClosed`). A wallet send of unlocked tokens went through, and a send of locked tokens was refused;
  - at Monday's open, a sell beyond the unlocked part was refused before signing and one within it filled;
  - a 4% bag was shown, and held to, its 0.1% sell cap, before signing and onchain (`RulesMaxSell`);
  - Chinese, dark mode and a phone-width screen showed no overflow, axe reported no violations on the editor or the panel, Explore showed the badge, and there were no page errors.

## Before mainnet

These are part of the custom-pairs audit scope: an independent audit of `FortuneLaunchRules` and the token hook, and a review of the rule bounds. Custom pairs stay on BSC Testnet until their own release gate passes.
