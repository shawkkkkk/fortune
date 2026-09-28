import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";

// Optional launch rules for custom-pair launches (FortuneLaunchRules). This
// file turns the launch form into the struct the factory takes, with the same
// checks and reason codes as FortuneLaunchRules.checkRules, and turns rules
// and rule reverts into plain language. Client-safe.

/** Mirrors FortuneLaunchRules constants. */
export const LAUNCH_RULE_LIMITS = {
  minMaxWalletBps: 50,
  minMaxBuyBps: 10,
  minMaxSellBps: 5,
  maxCapBps: 1_000,
  maxSellCooldown: 86_400,
  maxVestingWindow: 86_400,
  maxVestingEnd: 30 * 86_400,
  maxAccessWindow: 3_600,
  maxExempt: 10,
  maxAllowlist: 200,
} as const;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type LaunchRulesStruct = {
  maxWalletBps: number;
  maxBuyBps: number;
  maxSellBps: number;
  sellCooldown: number;
  curveOnly: boolean;
  vestingWindow: number;
  vestingCliff: number;
  vestingDuration: number;
  allowlistSeconds: number;
  allowlist: Address[];
  gateToken: Address;
  gateMinBalance: bigint;
  gateSeconds: number;
  exempt: Address[];
};

/** abi.encode(FortuneLaunchRules.Rules): what createLaunchWithRules takes. */
const RULES_TUPLE = [
  {
    type: "tuple",
    components: [
      { name: "maxWalletBps", type: "uint16" },
      { name: "maxBuyBps", type: "uint16" },
      { name: "maxSellBps", type: "uint16" },
      { name: "sellCooldown", type: "uint32" },
      { name: "curveOnly", type: "bool" },
      { name: "vestingWindow", type: "uint32" },
      { name: "vestingCliff", type: "uint32" },
      { name: "vestingDuration", type: "uint32" },
      { name: "allowlistSeconds", type: "uint32" },
      { name: "allowlist", type: "address[]" },
      { name: "gateToken", type: "address" },
      { name: "gateMinBalance", type: "uint256" },
      { name: "gateSeconds", type: "uint32" },
      { name: "exempt", type: "address[]" },
    ],
  },
] as const;

export function encodeLaunchRules(rules: LaunchRulesStruct): Hex {
  return encodeAbiParameters(RULES_TUPLE, [rules]);
}

/** What the launch form holds: percentages, minutes and hours as typed. Empty turns a rule off. */
export type LaunchRulesForm = {
  maxWallet: string;
  maxBuy: string;
  maxSell: string;
  cooldownMinutes: string;
  curveOnly: boolean;
  vestingWindowSeconds: string;
  vestingCliffHours: string;
  vestingDurationHours: string;
  allowlistMinutes: string;
  allowlist: string;
  gateToken: string;
  gateMin: string;
  gateMinutes: string;
  exempt: string;
};

export function emptyRulesForm(): LaunchRulesForm {
  return {
    maxWallet: "",
    maxBuy: "",
    maxSell: "",
    cooldownMinutes: "",
    curveOnly: false,
    vestingWindowSeconds: "",
    vestingCliffHours: "",
    vestingDurationHours: "",
    allowlistMinutes: "",
    allowlist: "",
    gateToken: "",
    gateMin: "",
    gateMinutes: "",
    exempt: "",
  };
}

export const RULE_PRESETS = {
  fair: { maxWallet: "1", maxBuy: "0.5", curveOnly: true },
  antiDump: { maxSell: "0.25", cooldownMinutes: "1" },
  vesting: { vestingWindowSeconds: "60", vestingCliffHours: "1", vestingDurationHours: "24" },
} as const satisfies Record<string, Partial<LaunchRulesForm>>;

export type RulesBuild =
  | { ok: true; rules: LaunchRulesStruct; encoded: Hex }
  | { ok: false; code: string; reason: string };

const fail = (code: string, reason: string): RulesBuild => ({ ok: false, code, reason });

/** "1.5" → 150 bps; null when not a percentage with at most two decimals. */
function bps(value: string) {
  const clean = value.trim();
  if (!clean) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** A non-negative number of units times `scale`, as whole seconds; null when invalid. */
function seconds(value: string, scale: number) {
  const clean = value.trim();
  if (!clean) return 0;
  if (!/^\d+(?:\.\d+)?$/.test(clean)) return null;
  const result = Math.round(Number(clean) * scale);
  return Number.isSafeInteger(result) ? result : null;
}

/** Distinct checksummed addresses from text separated by spaces, commas or lines; null lists the first bad entry. */
export function parseAddressList(text: string): { ok: true; addresses: Address[] } | { ok: false; bad: string } {
  const seen = new Set<string>();
  const addresses: Address[] = [];
  for (const entry of text.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)) {
    if (!isAddress(entry) || entry.toLowerCase() === ZERO) return { ok: false, bad: entry };
    const address = getAddress(entry);
    if (seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    addresses.push(address);
  }
  return { ok: true, addresses };
}

/**
 * The rules struct and its encoding, or the first problem, checked like
 * FortuneLaunchRules.checkRules (same codes). `gateDecimals` scales the gate
 * minimum; the gate token's code is checked onchain by the preflight.
 */
export function buildLaunchRules(form: LaunchRulesForm, gateDecimals = 18): RulesBuild {
  const L = LAUNCH_RULE_LIMITS;
  const maxWalletBps = bps(form.maxWallet);
  if (maxWalletBps === null || (maxWalletBps !== 0 && (maxWalletBps < L.minMaxWalletBps || maxWalletBps > L.maxCapBps))) {
    return fail("RULES_MAX_WALLET", "Max wallet must be between 0.5% and 10% of supply.");
  }
  const maxBuyBps = bps(form.maxBuy);
  if (maxBuyBps === null || (maxBuyBps !== 0 && (maxBuyBps < L.minMaxBuyBps || maxBuyBps > L.maxCapBps))) {
    return fail("RULES_MAX_BUY", "Max buy must be between 0.1% and 10% of supply.");
  }
  const maxSellBps = bps(form.maxSell);
  if (maxSellBps === null || (maxSellBps !== 0 && (maxSellBps < L.minMaxSellBps || maxSellBps > L.maxCapBps))) {
    return fail("RULES_MAX_SELL", "Max sell must be between 0.05% and 10% of supply.");
  }
  const sellCooldown = seconds(form.cooldownMinutes, 60);
  if (sellCooldown === null || sellCooldown > L.maxSellCooldown) return fail("RULES_COOLDOWN", "The sell cooldown can be at most one day.");

  const vestingWindow = seconds(form.vestingWindowSeconds, 1);
  const vestingCliff = seconds(form.vestingCliffHours, 3_600);
  const vestingDuration = seconds(form.vestingDurationHours, 3_600);
  if (vestingWindow === null || vestingCliff === null || vestingDuration === null) return fail("RULES_VESTING", "Enter vesting times as numbers.");
  if (vestingWindow === 0 && (vestingCliff > 0 || vestingDuration > 0)) return fail("RULES_VESTING", "Set how many seconds of early buys vest.");
  if (vestingWindow > 0) {
    if (vestingWindow > L.maxVestingWindow) return fail("RULES_VESTING", "Early buys can vest for a window of at most one day.");
    const end = vestingCliff + vestingDuration;
    if (end === 0 || end > L.maxVestingEnd) return fail("RULES_VESTING", "The cliff plus the unlock period must be between one second and 30 days.");
  }

  const allowlistSeconds = seconds(form.allowlistMinutes, 60);
  const allowlist = parseAddressList(form.allowlist);
  if (allowlistSeconds === null) return fail("RULES_ALLOWLIST", "Enter the allowlist window in minutes.");
  if (!allowlist.ok) return fail("RULES_ALLOWLIST", `Not an address: ${allowlist.bad.slice(0, 20)}`);
  if (allowlistSeconds === 0 && allowlist.addresses.length) return fail("RULES_ALLOWLIST", "Set how many minutes the allowlist lasts.");
  if (allowlistSeconds > 0) {
    if (allowlistSeconds > L.maxAccessWindow) return fail("RULES_ALLOWLIST", "The allowlist window can be at most one hour.");
    if (!allowlist.addresses.length || allowlist.addresses.length > L.maxAllowlist) return fail("RULES_ALLOWLIST", "List between 1 and 200 addresses.");
  }

  const gateSeconds = seconds(form.gateMinutes, 60);
  const gateText = form.gateToken.trim();
  if (gateSeconds === null) return fail("RULES_GATE", "Enter the holder gate window in minutes.");
  let gateToken = ZERO;
  let gateMinBalance = 0n;
  if (gateSeconds > 0 || gateText || form.gateMin.trim()) {
    if (gateSeconds === 0) return fail("RULES_GATE", "Set how many minutes the holder gate lasts.");
    if (gateSeconds > L.maxAccessWindow) return fail("RULES_GATE", "The holder gate can last at most one hour.");
    if (!isAddress(gateText) || gateText.toLowerCase() === ZERO) return fail("RULES_GATE", "Enter the token holders must hold.");
    gateToken = getAddress(gateText);
    try {
      gateMinBalance = parseUnits(form.gateMin.trim().replace(/,/g, "") || "0", gateDecimals);
    } catch {
      return fail("RULES_GATE", "Enter the minimum balance as a number.");
    }
    if (gateMinBalance <= 0n) return fail("RULES_GATE", "Enter the minimum balance holders need.");
  }

  const exempt = parseAddressList(form.exempt);
  if (!exempt.ok) return fail("RULES_EXEMPT", `Not an address: ${exempt.bad.slice(0, 20)}`);
  if (exempt.addresses.length > L.maxExempt) return fail("RULES_EXEMPT", "Up to 10 exempt wallets.");

  const rules: LaunchRulesStruct = {
    maxWalletBps,
    maxBuyBps,
    maxSellBps,
    sellCooldown,
    curveOnly: form.curveOnly,
    vestingWindow,
    vestingCliff,
    vestingDuration,
    allowlistSeconds,
    allowlist: allowlist.addresses,
    gateToken,
    gateMinBalance,
    gateSeconds,
    exempt: exempt.addresses,
  };
  const any = maxWalletBps || maxBuyBps || maxSellBps || sellCooldown || form.curveOnly || vestingWindow || allowlistSeconds || gateSeconds;
  if (!any) return fail("RULES_EMPTY", "Choose at least one rule, or turn launch rules off.");
  return { ok: true, rules, encoded: encodeLaunchRules(rules) };
}

/** Rules as the market page reads them (FortuneLaunchRules.rulesOf plus caps). */
export type LaunchRulesView = {
  address: Address;
  active: boolean;
  launchTimestamp: number;
  maxWalletBps: number;
  maxBuyBps: number;
  maxSellBps: number;
  sellCooldown: number;
  curveOnly: boolean;
  vestingWindow: number;
  vestingCliff: number;
  vestingDuration: number;
  allowlistSeconds: number;
  allowlistCount: number;
  gateToken: Address | null;
  gateMinBalance: string;
  gateSeconds: number;
  gate: { symbol: string; decimals: number } | null;
  exempt: Address[];
  caps: { maxWallet: string; maxBuy: string; maxSell: string };
};

/** Tokens still vesting at `now`, with the same math as `FortuneLaunchRules._locked`. */
export function lockedAt(vested: bigint, unlockStart: number, unlockEnd: number, now: number): bigint {
  if (now < unlockStart) return vested;
  if (now >= unlockEnd) return 0n;
  return (vested * BigInt(unlockEnd - now)) / BigInt(unlockEnd - unlockStart);
}

/** A duration in the largest unit that reads naturally; a no-break space keeps the number with its unit. */
export function formatDuration(totalSeconds: number, zh = false) {
  const s = Math.max(0, Math.round(totalSeconds));
  const unit = (value: number, en: string, cn: string) => (zh ? `${value}\u00a0${cn}` : `${value}\u00a0${en}`);
  if (s < 120) return unit(s, "s", "秒");
  if (s < 2 * 3_600 && s % 3_600 !== 0) return unit(Math.round(s / 60), "min", "分钟");
  if (s < 2 * 86_400) return unit(Math.round((s / 3_600) * 10) / 10, "h", "小时");
  return unit(Math.round((s / 86_400) * 10) / 10, "days", "天");
}

const percent = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

type SummaryInput = Pick<
  LaunchRulesView,
  | "maxWalletBps" | "maxBuyBps" | "maxSellBps" | "sellCooldown" | "curveOnly" | "vestingWindow" | "vestingCliff" | "vestingDuration" | "allowlistSeconds" | "gateSeconds"
> & { allowlistCount: number; gateLabel?: string | null; gateMin?: string | null; exemptCount: number };

/** One plain line per active rule, for the review list and the market page. */
export function describeLaunchRules(rules: SummaryInput, zh = false): string[] {
  const lines: string[] = [];
  if (rules.maxWalletBps) lines.push(zh ? `每个钱包最多持有 ${percent(rules.maxWalletBps)} 的供应量` : `No wallet may hold more than ${percent(rules.maxWalletBps)} of supply`);
  if (rules.maxBuyBps) lines.push(zh ? `每笔曲线买入最多 ${percent(rules.maxBuyBps)} 的供应量` : `Each curve buy takes at most ${percent(rules.maxBuyBps)} of supply`);
  if (rules.maxSellBps) lines.push(zh ? `每笔曲线卖出最多 ${percent(rules.maxSellBps)} 的供应量` : `Each curve sell returns at most ${percent(rules.maxSellBps)} of supply`);
  if (rules.sellCooldown) lines.push(zh ? `每个钱包两次卖出之间至少间隔 ${formatDuration(rules.sellCooldown, true)}` : `A wallet waits ${formatDuration(rules.sellCooldown)} between sells`);
  if (rules.curveOnly) lines.push(zh ? "毕业前代币只能通过曲线买卖，不能在钱包之间转账" : "Until graduation, tokens move only through the curve, not wallet to wallet");
  if (rules.vestingWindow) {
    // The cliff and the unlock both count from launch, not from each buy.
    const window = formatDuration(rules.vestingWindow, zh);
    const cliff = formatDuration(rules.vestingCliff, zh);
    const over = formatDuration(rules.vestingDuration, zh);
    if (zh) {
      lines.push(!rules.vestingCliff
        ? `开盘 ${window} 内的买入从开盘起 ${over} 内线性解锁`
        : rules.vestingDuration
          ? `开盘 ${window} 内的买入锁定至开盘后 ${cliff}，之后 ${over} 内线性解锁`
          : `开盘 ${window} 内的买入锁定至开盘后 ${cliff}，届时全部解锁`);
    } else {
      lines.push(!rules.vestingCliff
        ? `Buys in the first ${window} unlock evenly over the ${over} after launch`
        : rules.vestingDuration
          ? `Buys in the first ${window} stay locked until ${cliff} after launch, then unlock evenly over ${over}`
          : `Buys in the first ${window} stay locked until ${cliff} after launch, then unlock all at once`);
    }
  }
  if (rules.allowlistSeconds) {
    lines.push(zh
      ? `开盘 ${formatDuration(rules.allowlistSeconds, true)} 内只有白名单上的 ${rules.allowlistCount} 个地址可以买入`
      : `For the first ${formatDuration(rules.allowlistSeconds)}, only ${rules.allowlistCount === 1 ? "the one allowlisted address" : `the ${rules.allowlistCount} allowlisted addresses`} can buy`);
  }
  if (rules.gateSeconds) {
    const what = rules.gateLabel ? `${rules.gateMin ?? ""} ${rules.gateLabel}`.trim() : zh ? "指定代币" : "the gate token";
    lines.push(zh ? `开盘 ${formatDuration(rules.gateSeconds, true)} 内只有持有至少 ${what} 的钱包可以买入` : `For the first ${formatDuration(rules.gateSeconds)}, only wallets holding at least ${what} can buy`);
  }
  if (rules.exemptCount) {
    lines.push(zh
      ? `${rules.exemptCount} 个豁免钱包可以超出持仓和买入上限，并可在钱包间转账，但同样受卖出上限、冷却和锁仓约束`
      : `${rules.exemptCount} exempt ${rules.exemptCount === 1 ? "wallet" : "wallets"} may exceed the wallet and buy caps and move tokens between wallets, but sell caps, cooldowns and vesting still apply`);
  }
  return lines;
}

/** The launch rule that refused a transaction, in plain words, or null when it was something else. */
export function launchRulesErrorMessage(error: unknown, format: (raw: bigint) => string, zh = false): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  const name = reverted?.data?.errorName;
  const args = (reverted?.data?.args ?? []) as readonly unknown[];
  const amount = typeof args[0] === "bigint" ? (args[0] as bigint) : null;
  const time = amount !== null ? new Date(Number(amount) * 1000).toLocaleString(zh ? "zh-CN" : "en-US") : "";
  switch (name) {
    case "RulesMaxWallet":
      return zh ? `该发行规定每个钱包最多持有 ${amount !== null ? format(amount) : ""}。请减少数量。` : `This launch caps each wallet at ${amount !== null ? format(amount) : "its limit"}. Lower the amount.`;
    case "RulesMaxBuy":
      return zh ? `该发行规定每笔买入最多 ${amount !== null ? format(amount) : ""}。` : `This launch caps each buy at ${amount !== null ? format(amount) : "its limit"}.`;
    case "RulesMaxSell":
      return zh ? `该发行规定每笔卖出最多 ${amount !== null ? format(amount) : ""}。` : `This launch caps each sell at ${amount !== null ? format(amount) : "its limit"}.`;
    case "RulesSellCooldown":
      return zh ? `卖出冷却中，${time} 后可再次卖出。` : `Sell cooldown: you can sell again at ${time}.`;
    case "RulesVestingLocked":
      return zh ? `该钱包仍有 ${amount !== null ? format(amount) : ""} 处于锁仓中，只能卖出或转出超出部分。` : `${amount !== null ? format(amount) : "Part of this balance"} is still vesting in this wallet; only the rest can move.`;
    case "RulesCurveOnly":
      return zh ? "毕业前该代币只能通过曲线买卖，不能在钱包之间转账。" : "Until graduation this token moves only through the curve, not wallet to wallet.";
    case "RulesAllowlistOnly":
      return zh ? `目前只有白名单地址可以买入，${time} 开放给所有人。` : `Only allowlisted addresses can buy until ${time}.`;
    case "RulesHolderGate":
      return zh ? `目前只有持有指定代币的钱包可以买入，${time} 开放给所有人。` : `Only holders of the gate token can buy until ${time}.`;
    default:
      return null;
  }
}
