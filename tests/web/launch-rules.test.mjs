import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, decodeAbiParameters, encodeErrorResult } from "viem";
import {
  LAUNCH_RULE_LIMITS,
  RULE_PRESETS,
  buildLaunchRules,
  describeLaunchRules,
  emptyRulesForm,
  encodeLaunchRules,
  formatDuration,
  launchRulesErrorMessage,
  lockedAt,
  parseAddressList,
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
  const constant = (name) => source.match(new RegExp(`${name} = ([0-9_]+(?: (?:hours|days))?);`))?.[1];
  const seconds = (value) => {
    const [number, unit] = value.split(" ");
    return Number(number.replace(/_/g, "")) * (unit === "days" ? 86_400 : unit === "hours" ? 3_600 : 1);
  };
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
  const built = buildLaunchRules(form({ maxWallet: "2", gateMinutes: "5", gateToken: A.toLowerCase(), gateMin: "1.5", exempt: `${B} ${B}` }), 6);
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
    ] }],
    built.encoded
  );
  assert.deepEqual(decoded, built.rules);
  assert.equal(encodeLaunchRules(built.rules), built.encoded);
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
  for (const name of ["checkRules", "checkEncodedRules", "rulesOf", "capsOf", "active", "lockOf", "sellReadyAt", "canBuyNow", "isExempt", "isAllowlisted"]) assert.ok(rules.has(name), name);
  const errors = names(LAUNCH_RULES_ABI, "error");
  for (const name of ["RulesMaxWallet", "RulesMaxBuy", "RulesMaxSell", "RulesSellCooldown", "RulesVestingLocked", "RulesCurveOnly", "RulesAllowlistOnly", "RulesHolderGate"]) assert.ok(errors.has(name), name);
});
