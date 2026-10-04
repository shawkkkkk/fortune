import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, decodeAbiParameters, encodeErrorResult } from "viem";
import {
  LAUNCH_RULE_LIMITS,
  RULES_TUPLE,
  RULE_PRESETS,
  buildLaunchRules,
  capTokens,
  describeLaunchRules,
  emptyRulesForm,
  encodeLaunchRules,
  formatDuration,
  launchRulesErrorMessage,
  lockedAt,
  marketCapMultiple,
  nextWalletUnlock,
  parseAddressList,
  sellTierCap,
  walletCapBps,
  walletLockedAt,
  walletVestLength,
} from "../../lib/launch-rules.ts";
import { CUSTOM_PAIR_FACTORY_ABI, CUSTOM_PAIR_TOKEN_ABI, LAUNCH_RULES_ABI } from "../../lib/custom-pairs-artifacts.ts";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const form = (patch) => ({ ...emptyRulesForm(), ...patch });
const code = (patch) => {
  const built = buildLaunchRules(form(patch));
  return built.ok ? "OK" : built.code;
};

test("website limits mirror FortuneLaunchRules", () => {
  const source = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneLaunchRules.sol", import.meta.url), "utf8");
  const constant = (name) => source.match(new RegExp(`${name} = ([0-9_]+(?: (?:minutes|hours|days))?);`))?.[1];
  const seconds = (value) => {
    const [number, unit] = value.split(" ");
    return Number(number.replace(/_/g, "")) * (unit === "days" ? 86_400 : unit === "hours" ? 3_600 : unit === "minutes" ? 60 : 1);
  };
  const number = (name) => Number(constant(name).replace(/_/g, ""));
  assert.equal(Number(constant("MIN_MAX_WALLET_BPS")), LAUNCH_RULE_LIMITS.minMaxWalletBps);
  assert.equal(Number(constant("MIN_MAX_BUY_BPS")), LAUNCH_RULE_LIMITS.minMaxBuyBps);
  assert.equal(Number(constant("MIN_MAX_SELL_BPS")), LAUNCH_RULE_LIMITS.minMaxSellBps);
  assert.equal(Number(constant("MAX_CAP_BPS").replace(/_/g, "")), LAUNCH_RULE_LIMITS.maxCapBps);
  assert.equal(seconds(constant("MAX_SELL_COOLDOWN")), LAUNCH_RULE_LIMITS.maxSellCooldown);
  assert.equal(seconds(constant("MAX_VESTING_WINDOW")), LAUNCH_RULE_LIMITS.maxVestingWindow);
  assert.equal(seconds(constant("MAX_VESTING_END")), LAUNCH_RULE_LIMITS.maxVestingEnd);
  assert.equal(seconds(constant("MAX_ACCESS_WINDOW")), LAUNCH_RULE_LIMITS.maxAccessWindow);
  assert.equal(Number(constant("MAX_EXEMPT")), LAUNCH_RULE_LIMITS.maxExempt);
  assert.equal(Number(constant("MAX_ALLOWLIST")), LAUNCH_RULE_LIMITS.maxAllowlist);
  assert.match(source, /r\.vestingWindow > end\) \{\s*return \(false, "RULES_VESTING"\);/, "the contract refuses a window that outlasts the unlock, as the form does");
  const L = LAUNCH_RULE_LIMITS;
  assert.equal(number("MIN_SELL_TIER_SMALL_BPS"), L.minSellTierSmallBps);
  assert.equal(number("MAX_SELL_TIER_SMALL_BPS"), L.maxSellTierSmallBps);
  assert.equal(number("MIN_SELL_TIER_FLOOR_BPS"), L.minSellTierFloorBps);
  assert.equal(number("MAX_SELL_TIER_FLOOR_BPS"), L.maxSellTierFloorBps);
  assert.equal(number("MIN_SELL_TIER_BAG_BPS"), L.minSellTierBagBps);
  assert.equal(number("MAX_SELL_TIER_BAG_BPS"), L.maxSellTierBagBps);
  assert.equal(number("MAX_LEVELS"), L.maxLevels);
  assert.equal(number("MAX_RISING_BPS"), L.maxRisingBps);
  assert.equal(seconds(constant("MIN_RISING_PERIOD")), L.minRisingPeriod);
  assert.equal(seconds(constant("MAX_RISING_PERIOD")), L.maxRisingPeriod);
  assert.equal(number("MIN_CHAPTER_START_BPS"), L.minChapterStartBps);
  assert.equal(number("MAX_CHAPTER_START_BPS"), L.maxChapterStartBps);
  assert.equal(number("MIN_CHAPTER_VOLUME_BPS"), L.minChapterVolumeBps);
  assert.equal(number("MAX_CHAPTER_VOLUME_BPS"), L.maxChapterVolumeBps);
  assert.equal(BigInt(number("MIN_GAS_CAP")), L.minGasCap);
  assert.equal(BigInt(number("MAX_GAS_CAP")), L.maxGasCap);
  assert.equal(seconds(constant("MIN_GAS_CAP_WINDOW")), L.minGasCapWindow);
  assert.equal(seconds(constant("MAX_GAS_CAP_WINDOW")), L.maxGasCapWindow);
  assert.equal(number("MAX_BUYS_PER_BLOCK"), L.maxBuysPerBlock);
  assert.equal(number("MAX_BUNDLE_MIN_BPS"), L.maxBundleMinBps);
  assert.equal(seconds(constant("MIN_WALLET_VEST_WINDOW")), L.minWalletVestWindow);
  assert.equal(seconds(constant("MAX_WALLET_VEST_WINDOW")), L.maxWalletVestWindow);
  assert.equal(seconds(constant("MAX_WALLET_VEST_CLIFF")), L.maxWalletVestCliff);
  assert.equal(seconds(constant("MIN_WALLET_VEST_PERIOD")), L.minWalletVestPeriod);
  assert.equal(seconds(constant("MAX_WALLET_VEST_PERIOD")), L.maxWalletVestPeriod);
  assert.equal(number("MIN_WALLET_VEST_UNLOCK_BPS"), L.minWalletVestUnlockBps);
});

test("the trade rules are checked with the contract's reason codes, one rule per cap", () => {
  assert.equal(code({ marketHours: true }), "OK");
  assert.equal(code({ marketHours: true, marketSellsOpen: true, marketIgnoreHolidays: true }), "OK");
  assert.equal(code({ marketSellsOpen: true }), "RULES_EMPTY", "options without the rule are not a rule");
  assert.equal(code({ sellTierSmall: "1", sellTierFloor: "0.1", sellTierBag: "3" }), "OK");
  assert.equal(code({ sellTierSmall: "1", sellTierFloor: "1", sellTierBag: "3" }), "RULES_SELL_TIERS", "the floor is below the small holders' cap");
  assert.equal(code({ sellTierSmall: "1", sellTierFloor: "0.1", sellTierBag: "1" }), "RULES_SELL_TIERS");
  assert.equal(code({ sellTierSmall: "5.01", sellTierFloor: "0.1", sellTierBag: "6" }), "RULES_SELL_TIERS");
  assert.equal(code({ sellTierSmall: "1", sellTierBag: "3" }), "RULES_SELL_TIERS", "all three settings");
  const level = (from, maxBuy = "", maxSell = "") => ({ from, maxBuy, maxSell });
  assert.equal(code({ slideMaxSell: "1", levels: [level("25", "", "0.5")] }), "OK");
  assert.equal(code({ slideMaxSell: "1" }), "RULES_SLIDING", "launch caps need a level");
  assert.equal(code({ slideMaxSell: "1", levels: [level("25", "", "0.5"), level("25", "", "0.1")] }), "RULES_SLIDING", "levels rise");
  assert.equal(code({ slideMaxSell: "1", levels: [level("100", "", "0.5")] }), "RULES_SLIDING", "below graduation");
  assert.equal(code({ levels: [level("25", "0.09")] }), "RULES_SLIDING");
  assert.equal(code({ levels: [level("25")] }), "RULES_SLIDING", "some cap");
  assert.equal(code({ levels: Array.from({ length: 6 }, (_, i) => level(String(10 * (i + 1)), "", "0.5")) }), "RULES_SLIDING", "five levels at most");
  assert.equal(code({ slideMaxSell: "1", levels: [level("25", "", "0.5"), level(" ", "", "")] }), "OK", "blank rows are ignored");
  assert.equal(code({ risingStart: "0.1", risingStep: "0.1", risingMinutes: "5" }), "OK");
  assert.equal(code({ risingStart: "0.1", risingDoubles: true, risingMinutes: "5" }), "OK");
  assert.equal(code({ risingStart: "0.1", risingMinutes: "5" }), "RULES_RISING", "a step or doubling");
  assert.equal(code({ risingStart: "0.1", risingStep: "0.1", risingMinutes: "1441" }), "RULES_RISING");
  assert.equal(code({ risingStart: "5.01", risingStep: "0.1", risingMinutes: "5" }), "RULES_RISING");
  assert.equal(code({ risingStep: "0.1", risingMinutes: "5" }), "RULES_RISING", "a starting cap");
  assert.equal(code({ chapterStart: "1", chapterVolume: "1" }), "OK");
  assert.equal(code({ chapterStart: "0.09", chapterVolume: "1" }), "RULES_CHAPTERS");
  assert.equal(code({ chapterStart: "1", chapterVolume: "10.01" }), "RULES_CHAPTERS");
  assert.equal(code({ chapterVolume: "1" }), "RULES_CHAPTERS");
  assert.equal(code({ gasCapGwei: "1", gasCapMinutes: "10" }), "OK");
  assert.equal(code({ gasCapGwei: "0.09", gasCapMinutes: "10" }), "RULES_GAS_CAP");
  assert.equal(code({ gasCapGwei: "100.000000001", gasCapMinutes: "10" }), "RULES_GAS_CAP");
  assert.equal(code({ gasCapGwei: "1" }), "RULES_GAS_CAP", "the cap always ends");
  assert.equal(code({ gasCapGwei: "1", gasCapMinutes: "1441" }), "RULES_GAS_CAP");
  assert.equal(code({ gasCapMinutes: "10" }), "RULES_GAS_CAP");
  assert.equal(code({ maxBuysPerBlock: "3", bundleMin: "0.05" }), "OK");
  assert.equal(code({ maxBuysPerBlock: "3" }), "RULES_BUNDLE", "a minimum size so dust can't fill a block");
  assert.equal(code({ maxBuysPerBlock: "21", bundleMin: "0.05" }), "RULES_BUNDLE");
  assert.equal(code({ maxBuysPerBlock: "3", bundleMin: "1.01" }), "RULES_BUNDLE");
  assert.equal(code({ maxBuysPerBlock: "2.5", bundleMin: "0.05" }), "RULES_BUNDLE");
  assert.equal(code({ walletVestCliffHours: "24", walletVestUnlock: "10", walletVestPeriodHours: "24" }), "OK", "11 days");
  assert.equal(code({ walletVestCliffHours: "24", walletVestUnlock: "3", walletVestPeriodHours: "24" }), "RULES_WALLET_VESTING", "1 + 34 days is over 30");
  assert.equal(code({ walletVestCliffHours: "24", walletVestUnlock: "3.45", walletVestPeriodHours: "24" }), "OK", "1 + 29 days");
  assert.equal(code({ walletVestUnlock: "10", walletVestPeriodHours: "0.99" }), "RULES_WALLET_VESTING");
  assert.equal(code({ walletVestUnlock: "0.09", walletVestPeriodHours: "1" }), "RULES_WALLET_VESTING");
  assert.equal(code({ walletVestUnlock: "100", walletVestPeriodHours: "1", walletVestCliffHours: "168.01" }), "RULES_WALLET_VESTING");
  assert.equal(code({ walletVestUnlock: "100", walletVestPeriodHours: "1", walletVestWindowMinutes: "0.5" }), "RULES_WALLET_VESTING");
  assert.equal(code({ walletVestUnlock: "100", walletVestPeriodHours: "1", walletVestWindowMinutes: "60" }), "OK");
  assert.equal(code({ walletVestUnlock: "10" }), "RULES_WALLET_VESTING", "settings without a period");

  assert.equal(code({ maxWallet: "1", risingStart: "0.1", risingStep: "0.1", risingMinutes: "5" }), "RULES_WALLET_CAP_CONFLICT");
  assert.equal(code({ chapterStart: "1", chapterVolume: "1", risingStart: "0.1", risingStep: "0.1", risingMinutes: "5" }), "RULES_WALLET_CAP_CONFLICT");
  assert.equal(code({ maxBuy: "1", levels: [level("25", "0.5")] }), "RULES_BUY_CAP_CONFLICT");
  assert.equal(code({ maxSell: "1", sellTierSmall: "1", sellTierFloor: "0.1", sellTierBag: "3" }), "RULES_SELL_CAP_CONFLICT");
  assert.equal(code({ levels: [level("25", "0.5")], sellTierSmall: "1", sellTierFloor: "0.1", sellTierBag: "3" }), "RULES_SELL_CAP_CONFLICT");
  assert.equal(code({ vestingWindowSeconds: "60", vestingCliffHours: "1", walletVestUnlock: "100", walletVestPeriodHours: "1" }), "RULES_VESTING_CONFLICT");
});

test("the form is checked with the contract's reason codes", () => {
  assert.equal(code({}), "RULES_EMPTY");
  assert.equal(code({ maxWallet: "0.49" }), "RULES_MAX_WALLET");
  assert.equal(code({ maxWallet: "10.01" }), "RULES_MAX_WALLET");
  assert.equal(code({ maxWallet: "1.234" }), "RULES_MAX_WALLET", "at most two decimals");
  assert.equal(code({ maxWallet: "0.5" }), "OK");
  assert.equal(code({ maxBuy: "0.09" }), "RULES_MAX_BUY");
  assert.equal(code({ maxSell: "0.04" }), "RULES_MAX_SELL");
  assert.equal(code({ maxSell: "0.05" }), "OK");
  assert.equal(code({ cooldownMinutes: "1441" }), "RULES_COOLDOWN");
  assert.equal(code({ cooldownMinutes: "1440" }), "OK");
  assert.equal(code({ vestingCliffHours: "1" }), "RULES_VESTING", "a cliff needs a window");
  assert.equal(code({ vestingWindowSeconds: "60" }), "RULES_VESTING", "a window needs a lock");
  assert.equal(code({ vestingWindowSeconds: "60", vestingCliffHours: "700", vestingDurationHours: "21" }), "RULES_VESTING", "over 30 days");
  assert.equal(code({ vestingWindowSeconds: "60", vestingCliffHours: "700", vestingDurationHours: "20" }), "OK");
  assert.equal(code({ vestingWindowSeconds: "86401", vestingCliffHours: "1" }), "RULES_VESTING");
  assert.equal(code({ vestingWindowSeconds: "86400", vestingDurationHours: "1" }), "RULES_VESTING", "the window may not outlast the unlock");
  assert.equal(code({ vestingWindowSeconds: "86400", vestingCliffHours: "1", vestingDurationHours: "22.99" }), "RULES_VESTING");
  assert.equal(code({ vestingWindowSeconds: "86400", vestingCliffHours: "1", vestingDurationHours: "23" }), "OK", "a window ending with the unlock is fine");
  assert.equal(code({ allowlistMinutes: "10" }), "RULES_ALLOWLIST", "a window needs addresses");
  assert.equal(code({ allowlist: A }), "RULES_ALLOWLIST", "addresses need a window");
  assert.equal(code({ allowlistMinutes: "61", allowlist: A }), "RULES_ALLOWLIST");
  assert.equal(code({ allowlistMinutes: "10", allowlist: `${A}\nnope` }), "RULES_ALLOWLIST");
  assert.equal(code({ allowlistMinutes: "10", allowlist: `${A}, ${B}` }), "OK");
  assert.equal(code({ gateMinutes: "10" }), "RULES_GATE");
  assert.equal(code({ gateMinutes: "10", gateToken: A }), "RULES_GATE", "a gate needs a minimum");
  assert.equal(code({ gateMinutes: "10", gateToken: A, gateMin: "100" }), "OK");
  assert.equal(code({ gateToken: A, gateMin: "100" }), "RULES_GATE", "a gate needs a window");
  assert.equal(code({ curveOnly: true, exempt: Array.from({ length: 11 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`).join("\n") }), "RULES_EXEMPT");
  const tooMany = Array.from({ length: 201 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`).join("\n");
  assert.equal(code({ allowlistMinutes: "10", allowlist: tooMany }), "RULES_ALLOWLIST");
});

test("HookedPad-style presets combine, and each clears the rule that would set the same cap", () => {
  const { stockHours, whaleGuard, sliding, slowOpen, chapters, antiSniper, holderVesting, fair, antiDump, vesting } = RULE_PRESETS;
  assert.equal(buildLaunchRules(form({ ...stockHours, ...whaleGuard, ...slowOpen, ...antiSniper, ...holderVesting, curveOnly: true })).ok, true);
  assert.equal(buildLaunchRules(form({ ...stockHours, ...sliding, ...chapters, ...antiSniper, ...vesting })).ok, true);
  assert.equal(buildLaunchRules(form({ ...fair, ...slowOpen })).ok, true, "slow open replaces the fixed max wallet");
  assert.equal(buildLaunchRules(form({ ...slowOpen, ...fair })).ok, true, "and the other way round");
  assert.equal(buildLaunchRules(form({ ...antiDump, ...whaleGuard })).ok, true);
  assert.equal(buildLaunchRules(form({ ...whaleGuard, ...sliding })).ok, true);
  assert.equal(buildLaunchRules(form({ ...vesting, ...holderVesting })).ok, true);
  const built = buildLaunchRules(form({ ...stockHours, ...sliding, ...antiSniper }));
  assert.deepEqual(built.rules.levels, [{ fromProgressBps: 2_500, maxBuyBps: 0, maxSellBps: 50 }, { fromProgressBps: 6_000, maxBuyBps: 0, maxSellBps: 10 }]);
  assert.deepEqual([built.rules.marketHours, built.rules.slideMaxBuyBps, built.rules.slideMaxSellBps, built.rules.maxGasPrice, built.rules.gasCapSeconds, built.rules.maxBuysPerBlock, built.rules.bundleMinBps], [1, 200, 100, 1_000_000_000n, 600, 3, 5]);
});

test("presets are valid on their own and together", () => {
  for (const preset of Object.values(RULE_PRESETS)) assert.equal(buildLaunchRules(form(preset)).ok, true);
  const all = buildLaunchRules(form({ ...RULE_PRESETS.fair, ...RULE_PRESETS.antiDump, ...RULE_PRESETS.vesting }));
  assert.equal(all.ok, true);
  assert.deepEqual(
    [all.rules.maxWalletBps, all.rules.maxBuyBps, all.rules.maxSellBps, all.rules.sellCooldown, all.rules.curveOnly, all.rules.vestingWindow, all.rules.vestingCliff, all.rules.vestingDuration],
    [100, 50, 25, 60, true, 60, 3_600, 86_400]
  );
});

test("the struct round-trips through abi.encode, and gate minimums use the gate token's decimals", () => {
  const built = buildLaunchRules(form({ maxWallet: "2", gateMinutes: "5", gateToken: A.toLowerCase(), gateMin: "1.5", exempt: `${B} ${B}`, ...RULE_PRESETS.stockHours, ...RULE_PRESETS.sliding, ...RULE_PRESETS.antiSniper, ...RULE_PRESETS.holderVesting }), 6);
  assert.equal(built.ok, true);
  assert.equal(built.rules.gateMinBalance, 1_500_000n);
  assert.deepEqual(built.rules.exempt, [B], "duplicates collapse");
  assert.equal(built.rules.gateToken, A, "checksummed");
  const [decoded] = decodeAbiParameters(
    [{ type: "tuple", components: [
      { name: "maxWalletBps", type: "uint16" }, { name: "maxBuyBps", type: "uint16" }, { name: "maxSellBps", type: "uint16" }, { name: "sellCooldown", type: "uint32" },
      { name: "curveOnly", type: "bool" }, { name: "vestingWindow", type: "uint32" }, { name: "vestingCliff", type: "uint32" }, { name: "vestingDuration", type: "uint32" },
      { name: "allowlistSeconds", type: "uint32" }, { name: "allowlist", type: "address[]" }, { name: "gateToken", type: "address" }, { name: "gateMinBalance", type: "uint256" },
      { name: "gateSeconds", type: "uint32" }, { name: "exempt", type: "address[]" },
      { name: "marketHours", type: "uint8" }, { name: "sellTierSmallBps", type: "uint16" }, { name: "sellTierFloorBps", type: "uint16" }, { name: "sellTierBagBps", type: "uint16" },
      { name: "slideMaxBuyBps", type: "uint16" }, { name: "slideMaxSellBps", type: "uint16" },
      { name: "levels", type: "tuple[]", components: [{ name: "fromProgressBps", type: "uint16" }, { name: "maxBuyBps", type: "uint16" }, { name: "maxSellBps", type: "uint16" }] },
      { name: "risingStartBps", type: "uint16" }, { name: "risingStepBps", type: "uint16" }, { name: "risingDoubles", type: "bool" }, { name: "risingPeriod", type: "uint32" },
      { name: "chapterStartBps", type: "uint16" }, { name: "chapterVolumeBps", type: "uint16" }, { name: "maxGasPrice", type: "uint64" }, { name: "gasCapSeconds", type: "uint32" },
      { name: "maxBuysPerBlock", type: "uint8" }, { name: "bundleMinBps", type: "uint16" }, { name: "walletVestWindow", type: "uint32" }, { name: "walletVestCliff", type: "uint32" },
      { name: "walletVestUnlockBps", type: "uint16" }, { name: "walletVestPeriod", type: "uint32" },
    ] }],
    built.encoded
  );
  assert.deepEqual(decoded, built.rules);
  assert.equal(encodeLaunchRules(built.rules), built.encoded);
  // The tuple is exactly the contract's Rules struct, field for field.
  const checkRules = LAUNCH_RULES_ABI.find((item) => item.type === "function" && item.name === "checkRules");
  const shape = (components) => components.map((c) => ({ name: c.name, type: c.type, ...(c.components ? { components: shape(c.components) } : {}) }));
  assert.deepEqual(shape(RULES_TUPLE[0].components), shape(checkRules.inputs[0].components));
});

test("addresses parse from spaces, commas and lines; zero and junk are refused", () => {
  assert.deepEqual(parseAddressList(` ${A},${B};\n${A.toLowerCase()} `), { ok: true, addresses: [A, B] });
  assert.deepEqual(parseAddressList("0x0000000000000000000000000000000000000000"), { ok: false, bad: "0x0000000000000000000000000000000000000000" });
  assert.equal(parseAddressList("hello").ok, false);
  assert.deepEqual(parseAddressList(""), { ok: true, addresses: [] });
});

test("the still-vesting amount follows the contract's unlock math as time passes", () => {
  const source = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneLaunchRules.sol", import.meta.url), "utf8");
  assert.match(source, /if \(block\.timestamp < unlockStart\) return vested;/);
  assert.match(source, /if \(block\.timestamp >= unlockEnd\) return 0;/);
  assert.match(source, /return vested \* \(unlockEnd - block\.timestamp\) \/ l\.vestingDuration;/);
  const vested = 2_961_205_220_495_129_465_490_454n;
  const start = 1_000_000 + 3_600;
  const end = start + 86_400;
  assert.equal(lockedAt(vested, start, end, 1_000_000), vested, "before the cliff everything is locked");
  assert.equal(lockedAt(vested, start, end, start), vested, "unlocking starts at the cliff");
  assert.equal(lockedAt(vested, start, end, start + 43_200), vested / 2n);
  assert.equal(lockedAt(vested, start, end, start + 1), (vested * 86_399n) / 86_400n, "rounds like Solidity");
  assert.equal(lockedAt(vested, start, end, end - 1), vested / 86_400n);
  assert.equal(lockedAt(vested, start, end, end), 0n);
  assert.equal(lockedAt(vested, start, start, start), 0n, "a cliff with no unlock period frees everything at once");
  assert.equal(lockedAt(vested, start, start, start - 1), vested);
  let previous = vested;
  for (let t = start - 10; t <= end + 10; t += 997) {
    const locked = lockedAt(vested, start, end, t);
    assert.ok(locked <= previous, "vesting only ever unlocks");
    previous = locked;
  }
});

test("durations use the largest natural unit and keep the number with its unit", () => {
  assert.equal(formatDuration(59), "59\u00a0s");
  assert.equal(formatDuration(90), "90\u00a0s");
  assert.equal(formatDuration(120), "2\u00a0min");
  assert.equal(formatDuration(3_600), "1\u00a0h");
  assert.equal(formatDuration(5_400), "90\u00a0min");
  assert.equal(formatDuration(86_400), "24\u00a0h");
  assert.equal(formatDuration(30 * 86_400), "30\u00a0days");
  assert.equal(formatDuration(-5), "0\u00a0s");
  assert.equal(formatDuration(3_600, true), "1\u00a0小时");
});

test("rules read as plain sentences in both languages", () => {
  const rules = {
    maxWalletBps: 100, maxBuyBps: 50, maxSellBps: 25, sellCooldown: 60, curveOnly: true, vestingWindow: 60, vestingCliff: 3_600, vestingDuration: 86_400,
    allowlistSeconds: 600, gateSeconds: 300, allowlistCount: 12, gateLabel: "CAKE", gateMin: "100", exemptCount: 1,
  };
  const en = describeLaunchRules(rules);
  assert.equal(en.length, 9);
  assert.match(en[0], /No wallet may hold more than 1% of supply/);
  assert.match(en[3], /waits 60\u00a0s between sells/);
  assert.match(en[5], /first 60\u00a0s stay locked until 1\u00a0h after launch, then unlock evenly over 24\u00a0h/);
  assert.match(describeLaunchRules({ ...rules, vestingCliff: 0 })[5], /first 60\u00a0s unlock evenly over the 24\u00a0h after launch/);
  assert.match(describeLaunchRules({ ...rules, vestingDuration: 0 })[5], /stay locked until 1\u00a0h after launch, then unlock all at once/);
  assert.match(describeLaunchRules({ ...rules, vestingCliff: 0 }, true)[5], /从开盘起 24\u00a0小时 内线性解锁/);
  assert.match(describeLaunchRules({ ...rules, vestingDuration: 0 }, true)[5], /锁定至开盘后 1\u00a0小时，届时全部解锁/);
  assert.match(en[6], /only the 12 allowlisted addresses can buy/);
  assert.match(describeLaunchRules({ ...rules, allowlistCount: 1 })[6], /For the first 10\u00a0min, only the one allowlisted address can buy/);
  assert.match(en[7], /holding at least 100 CAKE/);
  assert.match(en[8], /1 exempt wallet may exceed/);
  const zh = describeLaunchRules(rules, true);
  assert.match(zh[0], /每个钱包最多持有 1% 的供应量/);
  assert.match(zh[5], /开盘 60\u00a0秒 内的买入锁定至开盘后 1\u00a0小时，之后 24\u00a0小时 内线性解锁/);
  assert.equal(describeLaunchRules({ ...rules, maxWalletBps: 0, maxBuyBps: 0, maxSellBps: 0, sellCooldown: 0, curveOnly: false, vestingWindow: 0, allowlistSeconds: 0, gateSeconds: 0, exemptCount: 0 }).length, 0);
});

test("a rule's revert becomes a sentence; anything else is left to the generic message", () => {
  const revert = (errorName, args) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({ abi: LAUNCH_RULES_ABI, data: encodeErrorResult({ abi: LAUNCH_RULES_ABI, errorName, args }), functionName: "buy" }),
      { abi: LAUNCH_RULES_ABI, functionName: "buy", args: [], contractAddress: A }
    );
  const format = (raw) => `${raw / 10n ** 18n} CAT`;
  assert.equal(launchRulesErrorMessage(revert("RulesMaxWallet", [10_000_000n * 10n ** 18n]), format), "This launch caps each wallet at 10000000 CAT. Lower the amount.");
  assert.match(launchRulesErrorMessage(revert("RulesVestingLocked", [5n * 10n ** 18n]), format), /^5 CAT is still vesting/);
  assert.match(launchRulesErrorMessage(revert("RulesSellCooldown", [1_800_000_060n]), format), /Sell cooldown: you can sell again at/);
  assert.equal(launchRulesErrorMessage(revert("RulesCurveOnly", []), format), "Until graduation this token moves only through the curve, not wallet to wallet.");
  assert.match(launchRulesErrorMessage(revert("RulesMaxSell", [10n ** 18n]), format, true), /每笔卖出最多 1 CAT/);
  assert.equal(launchRulesErrorMessage(new Error("boom"), format), null);
  assert.equal(launchRulesErrorMessage(revert("OnlyFactory", []), format), null);
});

test("generated ABIs expose what the website calls for launch rules", () => {
  const names = (abi, type) => new Set(abi.filter((item) => item.type === type).map((item) => item.name));
  const factory = names(CUSTOM_PAIR_FACTORY_ABI, "function");
  for (const name of ["launchRules", "preflightWithRules", "createLaunchWithRules", "createLaunch", "createLaunchAndBuy"]) assert.ok(factory.has(name), name);
  assert.ok(names(CUSTOM_PAIR_TOKEN_ABI, "function").has("rules"));
  const rules = names(LAUNCH_RULES_ABI, "function");
  for (const name of ["checkRules", "checkEncodedRules", "rulesOf", "capsOf", "active", "lockOf", "sellReadyAt", "canBuyNow", "isExempt", "isAllowlisted", "tradeRulesOf", "flowOf", "walletClockOf", "sellCapOf", "marketStatus", "isMarketOpen"]) assert.ok(rules.has(name), name);
  const errors = names(LAUNCH_RULES_ABI, "error");
  for (const name of ["RulesMaxWallet", "RulesMaxBuy", "RulesMaxSell", "RulesSellCooldown", "RulesVestingLocked", "RulesCurveOnly", "RulesAllowlistOnly", "RulesHolderGate", "RulesMarketClosed", "RulesGasPrice", "RulesBundle"]) assert.ok(errors.has(name), name);
});

test("holder vesting unlocks a share per period after the cliff, as the contract does", () => {
  const source = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneLaunchRules.sol", import.meta.url), "utf8");
  assert.match(source, /if \(elapsed < uint256\(t\.walletVestCliff\) \+ t\.walletVestPeriod\) return locked;/);
  assert.match(source, /uint256 unlockedBps = \(elapsed - t\.walletVestCliff\) \/ t\.walletVestPeriod \* t\.walletVestUnlockBps;/);
  assert.match(source, /return unlockedBps >= BPS \? 0 : locked \* \(BPS - unlockedBps\) \/ BPS;/);
  const locked = 7_777_777_777_777_777_777_777n;
  const start = 1_000_000;
  const day = 86_400;
  assert.equal(walletLockedAt(locked, start, day, day, 1_000, start + 2 * day - 1), locked, "nothing before a period past the cliff");
  assert.equal(walletLockedAt(locked, start, day, day, 1_000, start + 2 * day), (locked * 9_000n) / 10_000n);
  assert.equal(walletLockedAt(locked, start, day, day, 1_000, start + 6 * day + 5), (locked * 5_000n) / 10_000n);
  assert.equal(walletLockedAt(locked, start, day, day, 1_000, start + 11 * day), 0n);
  assert.equal(walletLockedAt(locked, start, 0, 3_600, 10_000, start + 3_599), locked);
  assert.equal(walletLockedAt(locked, start, 0, 3_600, 10_000, start + 3_600), 0n);
  assert.equal(walletVestLength(day, day, 1_000), 11 * day);
  assert.equal(walletVestLength(day, day, 345), 30 * day);
  assert.equal(nextWalletUnlock(start, day, day, 1_000, start), start + 2 * day);
  assert.equal(nextWalletUnlock(start, day, day, 1_000, start + 2 * day), start + 3 * day);
  assert.equal(nextWalletUnlock(start, day, day, 1_000, start + 11 * day), null);
  let previous = locked;
  for (let t = start; t <= start + 12 * day; t += 4_999) {
    const now = walletLockedAt(locked, start, day, day, 1_000, t);
    assert.ok(now <= previous, "only ever unlocks");
    previous = now;
  }
});

test("wallet caps rise on the clock or with volume, and sell caps shrink with the bag, as onchain", () => {
  const supply = 1_000_000_000n * 10n ** 18n;
  const base = { launchTimestamp: 1_000, maxWalletBps: 0, risingStartBps: 0, risingStepBps: 0, risingDoubles: false, risingPeriod: 0, chapterStartBps: 0, chapterVolumeBps: 0 };
  const rising = { ...base, risingStartBps: 10, risingStepBps: 10, risingPeriod: 300 };
  assert.equal(walletCapBps(rising, 1_000, 0n, supply), 10);
  assert.equal(walletCapBps(rising, 1_299, 0n, supply), 10);
  assert.equal(walletCapBps(rising, 1_300, 0n, supply), 20);
  assert.equal(walletCapBps(rising, 1_000 + 998 * 300, 0n, supply), 9_990);
  assert.equal(walletCapBps(rising, 1_000 + 999 * 300, 0n, supply), 0, "a cap covering the whole supply is no cap");
  const doubling = { ...base, risingStartBps: 10, risingDoubles: true, risingPeriod: 60 };
  assert.deepEqual([0, 1, 2, 9, 10, 1_000].map((m) => walletCapBps(doubling, 1_000 + m * 60, 0n, supply)), [10, 20, 40, 5_120, 0, 0]);
  const chapters = { ...base, chapterStartBps: 50, chapterVolumeBps: 200 };
  assert.equal(walletCapBps(chapters, 0, capTokens(supply, 199), supply), 50);
  assert.equal(walletCapBps(chapters, 0, capTokens(supply, 200), supply), 100);
  assert.equal(walletCapBps(chapters, 0, capTokens(supply, 1_000), supply), 1_600);
  assert.equal(walletCapBps({ ...base, maxWalletBps: 100 }, 0, 0n, supply), 100);
  assert.equal(walletCapBps(base, 0, 0n, supply), 0);

  const pct = (bps) => capTokens(supply, bps);
  assert.equal(sellTierCap(supply, 100, 10, 300, pct(50)), pct(100), "small holders sell their whole bag");
  assert.equal(sellTierCap(supply, 100, 10, 300, pct(200)), pct(100) - ((pct(100) - pct(10)) * (pct(200) - pct(100))) / (pct(300) - pct(100)));
  assert.equal(sellTierCap(supply, 100, 10, 300, pct(500)), pct(10));
  assert.equal(marketCapMultiple(0), 1);
  assert.equal(marketCapMultiple(10_000), 16, "the curve ends at 16× its opening price");
  assert.ok(Math.abs(marketCapMultiple(2_500) - 3.0625) < 1e-9);
});

test("trade rules read as plain sentences in both languages", () => {
  const v1 = { maxWalletBps: 0, maxBuyBps: 0, maxSellBps: 0, sellCooldown: 0, curveOnly: false, vestingWindow: 0, vestingCliff: 0, vestingDuration: 0, allowlistSeconds: 0, gateSeconds: 0, allowlistCount: 0, exemptCount: 0 };
  const one = (patch, zh = false) => describeLaunchRules({ ...v1, ...patch }, zh);
  assert.deepEqual(one({ marketHours: 1 }), ["Trades on the curve only during US market hours (Monday to Friday, 9:30am to 4:00pm New York time, closed on NYSE holidays and at 1:00pm on its early-close days)"]);
  assert.match(one({ marketHours: 3 })[0], /^Buys on the curve only during US market hours .*; sells stay open around the clock$/);
  assert.match(one({ marketHours: 5 })[0], /holidays included/);
  assert.match(one({ marketHours: 1 }, true)[0], /纽约时间周一至周五 9:30–16:00/);
  assert.equal(one({ sellTierSmallBps: 100, sellTierFloorBps: 10, sellTierBagBps: 300 })[0], "Wallets holding up to 1% of supply sell up to that much at once; bigger bags get a smaller cap per sell, down to 0.1% for bags of 3% or more");
  assert.equal(
    one({ slideMaxBuyBps: 200, slideMaxSellBps: 100, levels: [{ fromProgressBps: 2_500, maxBuyBps: 0, maxSellBps: 50 }, { fromProgressBps: 6_000, maxBuyBps: 0, maxSellBps: 10 }] })[0],
    "Caps change with graduation progress: at launch, 2% per buy and 1% per sell; from 25%, no buy cap and 0.5% per sell; from 60%, no buy cap and 0.1% per sell"
  );
  assert.equal(one({ risingStartBps: 10, risingStepBps: 10, risingPeriod: 300 })[0], "Max per wallet starts at 0.1% of supply and rises by 0.1% every 5\u00a0min until it no longer limits anyone");
  assert.match(one({ risingStartBps: 10, risingDoubles: true, risingPeriod: 300 })[0], /doubles every 5\u00a0min/);
  assert.equal(one({ chapterStartBps: 100, chapterVolumeBps: 100 })[0], "Max per wallet starts at 1% of supply and doubles each time another 1% of supply trades on the curve");
  assert.equal(one({ maxGasPrice: "1000000000", gasCapSeconds: 600 })[0], "For the first 10\u00a0min, buys paying more than 1 gwei per gas are refused (the creator and exempt wallets excepted)");
  assert.equal(one({ maxGasPrice: 100_000_000n, gasCapSeconds: 600 })[0].includes("0.1 gwei"), true);
  assert.equal(one({ maxBuysPerBlock: 3, bundleMinBps: 5 })[0], "At most 3 buys of 0.05% of supply or more per block");
  assert.equal(
    one({ walletVestCliff: 86_400, walletVestUnlockBps: 1_000, walletVestPeriod: 86_400 })[0],
    "Every buy locks on each wallet's own clock: nothing unlocks for 24\u00a0h, then 10% every 24\u00a0h, all free within 11\u00a0days of the wallet's last vesting buy, which restarts the clock for what is still locked"
  );
  assert.match(one({ walletVestWindow: 3_600, walletVestUnlockBps: 10_000, walletVestPeriod: 21_600 })[0], /^Buys in the first 1\u00a0h lock on each wallet's own clock: 100% every 6\u00a0h/);
  assert.match(one({ walletVestCliff: 86_400, walletVestUnlockBps: 1_000, walletVestPeriod: 86_400 }, true)[0], /^每笔买入按各自钱包的时钟锁仓：前 24\u00a0小时 不解锁/);
  assert.match(one({ marketHours: 1, maxBuysPerBlock: 3, bundleMinBps: 5, exemptCount: 2 }).at(-1), /^2 exempt wallets may exceed the wallet and buy caps, skip the gas cap and anti-bundle limit, and move tokens between wallets, but sell caps, cooldowns, vesting and market hours still apply$/);
});

test("trade-rule reverts become sentences", () => {
  const revert = (errorName, args) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({ abi: LAUNCH_RULES_ABI, data: encodeErrorResult({ abi: LAUNCH_RULES_ABI, errorName, args }), functionName: "buy" }),
      { abi: LAUNCH_RULES_ABI, functionName: "buy", args: [], contractAddress: A }
    );
  const format = (raw) => `${raw / 10n ** 18n} CAT`;
  assert.match(launchRulesErrorMessage(revert("RulesMarketClosed", []), format), /^The market is closed/);
  assert.match(launchRulesErrorMessage(revert("RulesMarketClosed", []), format, true), /^美股休市中/);
  assert.equal(launchRulesErrorMessage(revert("RulesGasPrice", [1_000_000_000n]), format), "This launch refuses buys paying more than 1 gwei per gas right now. Lower the gas price and try again.");
  assert.equal(launchRulesErrorMessage(revert("RulesBundle", [3n]), format), "This block already holds the 3 buys this launch allows. Try again in a moment.");
});
