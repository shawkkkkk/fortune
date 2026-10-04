import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";

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
  minSellTierSmallBps: 5,
  maxSellTierSmallBps: 500,
  minSellTierFloorBps: 1,
  maxSellTierFloorBps: 100,
  minSellTierBagBps: 50,
  maxSellTierBagBps: 1_000,
  maxLevels: 5,
  maxRisingBps: 500,
  minRisingPeriod: 60,
  maxRisingPeriod: 86_400,
  minChapterStartBps: 10,
  maxChapterStartBps: 500,
  minChapterVolumeBps: 10,
  maxChapterVolumeBps: 1_000,
  minGasCap: 100_000_000n,
  maxGasCap: 100_000_000_000n,
  minGasCapWindow: 60,
  maxGasCapWindow: 86_400,
  maxBuysPerBlock: 20,
  maxBundleMinBps: 100,
  minWalletVestWindow: 60,
  maxWalletVestWindow: 7 * 86_400,
  maxWalletVestCliff: 7 * 86_400,
  minWalletVestPeriod: 3_600,
  maxWalletVestPeriod: 7 * 86_400,
  minWalletVestUnlockBps: 10,
} as const;

/** Market-hours flags, as onchain: the rule, sells kept open around the clock, holidays ignored. */
export const MARKET_HOURS = 1;
export const MARKET_SELLS_OPEN = 2;
export const MARKET_IGNORE_HOLIDAYS = 4;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const BPS = 10_000;

/** Sliding caps: from `fromProgressBps` of graduation progress, these caps apply (zero: no cap). */
export type CapLevel = { fromProgressBps: number; maxBuyBps: number; maxSellBps: number };

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
  marketHours: number;
  sellTierSmallBps: number;
  sellTierFloorBps: number;
  sellTierBagBps: number;
  slideMaxBuyBps: number;
  slideMaxSellBps: number;
  levels: CapLevel[];
  risingStartBps: number;
  risingStepBps: number;
  risingDoubles: boolean;
  risingPeriod: number;
  chapterStartBps: number;
  chapterVolumeBps: number;
  maxGasPrice: bigint;
  gasCapSeconds: number;
  maxBuysPerBlock: number;
  bundleMinBps: number;
  walletVestWindow: number;
  walletVestCliff: number;
  walletVestUnlockBps: number;
  walletVestPeriod: number;
};

/** abi.encode(FortuneLaunchRules.Rules): what createLaunchWithRules takes. */
export const RULES_TUPLE = [
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
      { name: "marketHours", type: "uint8" },
      { name: "sellTierSmallBps", type: "uint16" },
      { name: "sellTierFloorBps", type: "uint16" },
      { name: "sellTierBagBps", type: "uint16" },
      { name: "slideMaxBuyBps", type: "uint16" },
      { name: "slideMaxSellBps", type: "uint16" },
      {
        name: "levels",
        type: "tuple[]",
        components: [
          { name: "fromProgressBps", type: "uint16" },
          { name: "maxBuyBps", type: "uint16" },
          { name: "maxSellBps", type: "uint16" },
        ],
      },
      { name: "risingStartBps", type: "uint16" },
      { name: "risingStepBps", type: "uint16" },
      { name: "risingDoubles", type: "bool" },
      { name: "risingPeriod", type: "uint32" },
      { name: "chapterStartBps", type: "uint16" },
      { name: "chapterVolumeBps", type: "uint16" },
      { name: "maxGasPrice", type: "uint64" },
      { name: "gasCapSeconds", type: "uint32" },
      { name: "maxBuysPerBlock", type: "uint8" },
      { name: "bundleMinBps", type: "uint16" },
      { name: "walletVestWindow", type: "uint32" },
      { name: "walletVestCliff", type: "uint32" },
      { name: "walletVestUnlockBps", type: "uint16" },
      { name: "walletVestPeriod", type: "uint32" },
    ],
  },
] as const;

export function encodeLaunchRules(rules: LaunchRulesStruct): Hex {
  return encodeAbiParameters(RULES_TUPLE, [rules]);
}

/** A sliding-caps level as typed: graduation progress, buy cap and sell cap, all in percent. */
export type CapLevelForm = { from: string; maxBuy: string; maxSell: string };

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
  marketHours: boolean;
  marketSellsOpen: boolean;
  marketIgnoreHolidays: boolean;
  sellTierSmall: string;
  sellTierFloor: string;
  sellTierBag: string;
  slideMaxBuy: string;
  slideMaxSell: string;
  levels: CapLevelForm[];
  risingStart: string;
  risingStep: string;
  risingDoubles: boolean;
  risingMinutes: string;
  chapterStart: string;
  chapterVolume: string;
  gasCapGwei: string;
  gasCapMinutes: string;
  maxBuysPerBlock: string;
  bundleMin: string;
  walletVestWindowMinutes: string;
  walletVestCliffHours: string;
  walletVestUnlock: string;
  walletVestPeriodHours: string;
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
    marketHours: false,
    marketSellsOpen: false,
    marketIgnoreHolidays: false,
    sellTierSmall: "",
    sellTierFloor: "",
    sellTierBag: "",
    slideMaxBuy: "",
    slideMaxSell: "",
    levels: [],
    risingStart: "",
    risingStep: "",
    risingDoubles: false,
    risingMinutes: "",
    chapterStart: "",
    chapterVolume: "",
    gasCapGwei: "",
    gasCapMinutes: "",
    maxBuysPerBlock: "",
    bundleMin: "",
    walletVestWindowMinutes: "",
    walletVestCliffHours: "",
    walletVestUnlock: "",
    walletVestPeriodHours: "",
  };
}

// A preset clears the rules that would set the same cap, so any preset can be applied on its own.
const NO_SLIDING = { slideMaxBuy: "", slideMaxSell: "", levels: [] as CapLevelForm[] };
const NO_TIERS = { sellTierSmall: "", sellTierFloor: "", sellTierBag: "" };
const NO_RISING = { risingStart: "", risingStep: "", risingDoubles: false, risingMinutes: "" };
const NO_CHAPTERS = { chapterStart: "", chapterVolume: "" };
const NO_EARLY_VESTING = { vestingWindowSeconds: "", vestingCliffHours: "", vestingDurationHours: "" };
const NO_WALLET_VESTING = { walletVestWindowMinutes: "", walletVestCliffHours: "", walletVestUnlock: "", walletVestPeriodHours: "" };

export const RULE_PRESETS = {
  fair: { maxWallet: "1", maxBuy: "0.5", curveOnly: true, ...NO_RISING, ...NO_CHAPTERS, ...NO_SLIDING },
  antiDump: { maxSell: "0.25", cooldownMinutes: "1", ...NO_TIERS, ...NO_SLIDING },
  vesting: { vestingWindowSeconds: "60", vestingCliffHours: "1", vestingDurationHours: "24", ...NO_WALLET_VESTING },
  // Modelled on HookedPad's rules, with its defaults.
  stockHours: { marketHours: true },
  whaleGuard: { sellTierSmall: "1", sellTierFloor: "0.1", sellTierBag: "3", maxSell: "", ...NO_SLIDING },
  sliding: {
    slideMaxBuy: "2",
    slideMaxSell: "1",
    levels: [{ from: "25", maxBuy: "", maxSell: "0.5" }, { from: "60", maxBuy: "", maxSell: "0.1" }],
    maxBuy: "",
    maxSell: "",
    ...NO_TIERS,
  },
  slowOpen: { risingStart: "0.1", risingStep: "0.1", risingDoubles: false, risingMinutes: "5", maxWallet: "", ...NO_CHAPTERS },
  chapters: { chapterStart: "1", chapterVolume: "1", maxWallet: "", ...NO_RISING },
  antiSniper: { gasCapGwei: "1", gasCapMinutes: "10", maxBuysPerBlock: "3", bundleMin: "0.05" },
  holderVesting: { walletVestWindowMinutes: "", walletVestCliffHours: "24", walletVestUnlock: "10", walletVestPeriodHours: "24", ...NO_EARLY_VESTING },
} satisfies Record<string, Partial<LaunchRulesForm>>;

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

/** A whole number, zero when empty; null when invalid. */
function whole(value: string) {
  const clean = value.trim();
  if (!clean) return 0;
  return /^\d{1,6}$/.test(clean) ? Number(clean) : null;
}

/** Wei per gas from a gwei amount with up to nine decimals; null when invalid. */
function gwei(value: string) {
  const clean = value.trim();
  if (!clean) return 0n;
  return /^\d{1,6}(?:\.\d{1,9})?$/.test(clean) ? parseUnits(clean, 9) : null;
}

const capOk = (value: number, minimum: number) => value === 0 || (value >= minimum && value <= LAUNCH_RULE_LIMITS.maxCapBps);

/** Seconds from a holder-vesting clock's start until everything has unlocked. */
export function walletVestLength(cliff: number, period: number, unlockBps: number) {
  return unlockBps > 0 ? cliff + period * Math.ceil(BPS / unlockBps) : 0;
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
 * FortuneLaunchRules.checkRules (same codes, same order). `gateDecimals` scales
 * the gate minimum; the gate token's code is checked onchain by the preflight.
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
    // As onchain: a window that outlasts the unlock would record late buys as vested when they are already free.
    if (vestingWindow > end) return fail("RULES_VESTING", "The vesting window can't be longer than the lock plus the unlock, or later buys would be free at once.");
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

  // Trade rules, in the contract's order.
  const marketHours = form.marketHours
    ? MARKET_HOURS | (form.marketSellsOpen ? MARKET_SELLS_OPEN : 0) | (form.marketIgnoreHolidays ? MARKET_IGNORE_HOLIDAYS : 0)
    : 0;

  const sellTierSmallBps = bps(form.sellTierSmall);
  const sellTierFloorBps = bps(form.sellTierFloor);
  const sellTierBagBps = bps(form.sellTierBag);
  if (sellTierSmallBps === null || sellTierFloorBps === null || sellTierBagBps === null) {
    return fail("RULES_SELL_TIERS", "Enter graduated sell caps as percentages with at most two decimals.");
  }
  if (sellTierSmallBps || sellTierFloorBps || sellTierBagBps) {
    if (sellTierSmallBps < L.minSellTierSmallBps || sellTierSmallBps > L.maxSellTierSmallBps) {
      return fail("RULES_SELL_TIERS", "The sell cap for small holders must be between 0.05% and 5% of supply.");
    }
    if (sellTierFloorBps < L.minSellTierFloorBps || sellTierFloorBps > L.maxSellTierFloorBps) {
      return fail("RULES_SELL_TIERS", "The sell cap for the biggest bags must be between 0.01% and 1% of supply.");
    }
    if (sellTierBagBps < L.minSellTierBagBps || sellTierBagBps > L.maxSellTierBagBps) {
      return fail("RULES_SELL_TIERS", "The bag size that gets the smallest cap must be between 0.5% and 10% of supply.");
    }
    if (sellTierFloorBps >= sellTierSmallBps || sellTierSmallBps >= sellTierBagBps) {
      return fail("RULES_SELL_TIERS", "The biggest bags' cap must be below the small holders' cap, and the bag size above it.");
    }
  }

  const slideMaxBuyBps = bps(form.slideMaxBuy);
  const slideMaxSellBps = bps(form.slideMaxSell);
  const levels: CapLevel[] = [];
  for (const row of form.levels) {
    if (!row.from.trim() && !row.maxBuy.trim() && !row.maxSell.trim()) continue;
    const fromProgressBps = bps(row.from);
    const levelBuy = bps(row.maxBuy);
    const levelSell = bps(row.maxSell);
    if (fromProgressBps === null || levelBuy === null || levelSell === null) {
      return fail("RULES_SLIDING", "Enter sliding caps as percentages with at most two decimals.");
    }
    levels.push({ fromProgressBps, maxBuyBps: levelBuy, maxSellBps: levelSell });
  }
  if (slideMaxBuyBps === null || slideMaxSellBps === null) return fail("RULES_SLIDING", "Enter sliding caps as percentages with at most two decimals.");
  if (levels.length) {
    if (levels.length > L.maxLevels) return fail("RULES_SLIDING", "Sliding caps take up to five levels.");
    if (!capOk(slideMaxBuyBps, L.minMaxBuyBps) || levels.some((row) => !capOk(row.maxBuyBps, L.minMaxBuyBps))) {
      return fail("RULES_SLIDING", "Sliding buy caps must be between 0.1% and 10% of supply, or empty for no cap.");
    }
    if (!capOk(slideMaxSellBps, L.minMaxSellBps) || levels.some((row) => !capOk(row.maxSellBps, L.minMaxSellBps))) {
      return fail("RULES_SLIDING", "Sliding sell caps must be between 0.05% and 10% of supply, or empty for no cap.");
    }
    for (let i = 0; i < levels.length; i += 1) {
      const previous = i ? levels[i - 1].fromProgressBps : 0;
      if (levels[i].fromProgressBps <= previous || levels[i].fromProgressBps >= BPS) {
        return fail("RULES_SLIDING", "Each level starts at a higher graduation progress than the last, below 100%.");
      }
    }
    if (!slideMaxBuyBps && !slideMaxSellBps && levels.every((row) => !row.maxBuyBps && !row.maxSellBps)) {
      return fail("RULES_SLIDING", "Set at least one sliding cap.");
    }
  } else if (slideMaxBuyBps || slideMaxSellBps) {
    return fail("RULES_SLIDING", "Add at least one level where the caps change, or use the fixed max buy and max sell.");
  }

  const risingStartBps = bps(form.risingStart);
  const risingStepBps = form.risingDoubles ? 0 : bps(form.risingStep);
  const risingPeriod = seconds(form.risingMinutes, 60);
  if (risingStartBps === null || risingStepBps === null || risingPeriod === null) {
    return fail("RULES_RISING", "Enter the rising max per wallet as percentages and minutes.");
  }
  if (risingStartBps) {
    if (risingStartBps > L.maxRisingBps) return fail("RULES_RISING", "The rising max per wallet must start between 0.01% and 5% of supply.");
    if (risingPeriod < L.minRisingPeriod || risingPeriod > L.maxRisingPeriod) return fail("RULES_RISING", "The cap rises every 1 minute to 1 day.");
    if (!form.risingDoubles && (risingStepBps === 0 || risingStepBps > L.maxRisingBps)) {
      return fail("RULES_RISING", "Each rise adds 0.01% to 5% of supply, or choose doubling.");
    }
  } else if (risingStepBps || form.risingDoubles || risingPeriod) {
    return fail("RULES_RISING", "Set where the rising max per wallet starts.");
  }

  const chapterStartBps = bps(form.chapterStart);
  const chapterVolumeBps = bps(form.chapterVolume);
  if (chapterStartBps === null || chapterVolumeBps === null) return fail("RULES_CHAPTERS", "Enter chapters as percentages with at most two decimals.");
  if (chapterStartBps) {
    if (chapterStartBps < L.minChapterStartBps || chapterStartBps > L.maxChapterStartBps) {
      return fail("RULES_CHAPTERS", "Chapters start the max per wallet between 0.1% and 5% of supply.");
    }
    if (chapterVolumeBps < L.minChapterVolumeBps || chapterVolumeBps > L.maxChapterVolumeBps) {
      return fail("RULES_CHAPTERS", "Each chapter takes between 0.1% and 10% of supply traded.");
    }
  } else if (chapterVolumeBps) {
    return fail("RULES_CHAPTERS", "Set where the chapters' max per wallet starts.");
  }

  const maxGasPrice = gwei(form.gasCapGwei);
  const gasCapSeconds = seconds(form.gasCapMinutes, 60);
  if (maxGasPrice === null || gasCapSeconds === null) return fail("RULES_GAS_CAP", "Enter the gas cap in gwei and its window in minutes.");
  if (maxGasPrice) {
    if (maxGasPrice < L.minGasCap || maxGasPrice > L.maxGasCap) return fail("RULES_GAS_CAP", "The gas cap must be between 0.1 and 100 gwei.");
    if (gasCapSeconds < L.minGasCapWindow || gasCapSeconds > L.maxGasCapWindow) return fail("RULES_GAS_CAP", "The gas cap lasts 1 minute to 1 day after launch.");
  } else if (gasCapSeconds) {
    return fail("RULES_GAS_CAP", "Set the gas cap in gwei.");
  }

  const maxBuysPerBlock = whole(form.maxBuysPerBlock);
  const bundleMinBps = bps(form.bundleMin);
  if (maxBuysPerBlock === null || bundleMinBps === null) return fail("RULES_BUNDLE", "Enter the anti-bundle limit as a whole number of buys and a percentage.");
  if (maxBuysPerBlock) {
    if (maxBuysPerBlock > L.maxBuysPerBlock) return fail("RULES_BUNDLE", "A block may hold 1 to 20 buys.");
    if (bundleMinBps < 1 || bundleMinBps > L.maxBundleMinBps) {
      return fail("RULES_BUNDLE", "Counted buys start at 0.01% to 1% of supply, so dust can't fill a block.");
    }
  } else if (bundleMinBps) {
    return fail("RULES_BUNDLE", "Set how many buys a block may hold.");
  }

  const walletVestPeriod = seconds(form.walletVestPeriodHours, 3_600);
  const walletVestCliff = seconds(form.walletVestCliffHours, 3_600);
  const walletVestUnlockBps = bps(form.walletVestUnlock);
  const walletVestWindow = seconds(form.walletVestWindowMinutes, 60);
  if (walletVestPeriod === null || walletVestCliff === null || walletVestUnlockBps === null || walletVestWindow === null) {
    return fail("RULES_WALLET_VESTING", "Enter holder vesting as hours, minutes and a percentage.");
  }
  if (walletVestPeriod) {
    if (walletVestPeriod < L.minWalletVestPeriod || walletVestPeriod > L.maxWalletVestPeriod) {
      return fail("RULES_WALLET_VESTING", "Holder vesting unlocks every 1 hour to 7 days.");
    }
    if (walletVestUnlockBps < L.minWalletVestUnlockBps || walletVestUnlockBps > BPS) {
      return fail("RULES_WALLET_VESTING", "Each unlock frees 0.1% to 100% of a wallet's locked bag.");
    }
    if (walletVestCliff > L.maxWalletVestCliff) return fail("RULES_WALLET_VESTING", "The cliff can be at most 7 days.");
    if (walletVestWindow !== 0 && (walletVestWindow < L.minWalletVestWindow || walletVestWindow > L.maxWalletVestWindow)) {
      return fail("RULES_WALLET_VESTING", "Vest only early buys for 1 minute to 7 days, or leave it empty to vest every buy.");
    }
    if (walletVestLength(walletVestCliff, walletVestPeriod, walletVestUnlockBps) > L.maxVestingEnd) {
      return fail("RULES_WALLET_VESTING", "Every wallet must be free within 30 days: shorten the cliff or the period, or unlock more each time.");
    }
  } else if (walletVestCliff || walletVestUnlockBps || walletVestWindow) {
    return fail("RULES_WALLET_VESTING", "Set how often holder vesting unlocks.");
  }

  // As on HookedPad, each cap comes from one rule.
  const count = (...flags: boolean[]) => flags.filter(Boolean).length;
  if (count(maxWalletBps !== 0, risingStartBps !== 0, chapterStartBps !== 0) > 1) {
    return fail("RULES_WALLET_CAP_CONFLICT", "Max wallet, the rising max per wallet and chapters each cap wallets: choose one.");
  }
  if (levels.length && maxBuyBps) return fail("RULES_BUY_CAP_CONFLICT", "Sliding caps set the buy cap: clear the fixed max buy.");
  if (count(maxSellBps !== 0, sellTierSmallBps !== 0, levels.length !== 0) > 1) {
    return fail("RULES_SELL_CAP_CONFLICT", "Max sell, graduated sell caps and sliding caps each cap sells: choose one.");
  }
  if (vestingWindow && walletVestPeriod) return fail("RULES_VESTING_CONFLICT", "Choose early-buyer vesting or holder vesting, not both.");

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
    marketHours,
    sellTierSmallBps,
    sellTierFloorBps,
    sellTierBagBps,
    slideMaxBuyBps,
    slideMaxSellBps,
    levels,
    risingStartBps,
    risingStepBps,
    risingDoubles: Boolean(risingStartBps) && form.risingDoubles,
    risingPeriod,
    chapterStartBps,
    chapterVolumeBps,
    maxGasPrice,
    gasCapSeconds,
    maxBuysPerBlock,
    bundleMinBps,
    walletVestWindow,
    walletVestCliff,
    walletVestUnlockBps,
    walletVestPeriod,
  };
  const any =
    maxWalletBps || maxBuyBps || maxSellBps || sellCooldown || form.curveOnly || vestingWindow || allowlistSeconds || gateSeconds ||
    marketHours || sellTierSmallBps || levels.length || risingStartBps || chapterStartBps || maxGasPrice || maxBuysPerBlock || walletVestPeriod;
  if (!any) return fail("RULES_EMPTY", "Choose at least one rule, or turn launch rules off.");
  return { ok: true, rules, encoded: encodeLaunchRules(rules) };
}

/** Rules as the market page reads them (FortuneLaunchRules.rulesOf, tradeRulesOf and the live caps). */
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
  /** The caps the next trade meets, in launch tokens; "0" where there is none. */
  caps: { maxWallet: string; maxBuy: string; maxSell: string };
  marketHours: number;
  sellTierSmallBps: number;
  sellTierFloorBps: number;
  sellTierBagBps: number;
  slideMaxBuyBps: number;
  slideMaxSellBps: number;
  levels: CapLevel[];
  risingStartBps: number;
  risingStepBps: number;
  risingDoubles: boolean;
  risingPeriod: number;
  chapterStartBps: number;
  chapterVolumeBps: number;
  /** Wei per gas. */
  maxGasPrice: string;
  gasCapSeconds: number;
  maxBuysPerBlock: number;
  bundleMinBps: number;
  walletVestWindow: number;
  walletVestCliff: number;
  walletVestUnlockBps: number;
  walletVestPeriod: number;
  /** Launch tokens traded on the curve so far (chapters). */
  volume: string;
  /** The sliding-caps level the next trade uses: 0 for the launch caps. */
  level: number;
};

/** Tokens still vesting at `now`, with the same math as `FortuneLaunchRules._locked`. */
export function lockedAt(vested: bigint, unlockStart: number, unlockEnd: number, now: number): bigint {
  if (now < unlockStart) return vested;
  if (now >= unlockEnd) return 0n;
  return (vested * BigInt(unlockEnd - now)) / BigInt(unlockEnd - unlockStart);
}

/** Holder vesting: tokens still locked at `now`, with the same math as `FortuneLaunchRules._walletLocked`. */
export function walletLockedAt(locked: bigint, start: number, cliff: number, period: number, unlockBps: number, now: number): bigint {
  if (locked === 0n || period === 0) return 0n;
  const elapsed = now - start;
  if (elapsed < cliff + period) return locked;
  const unlocked = Math.floor((elapsed - cliff) / period) * unlockBps;
  return unlocked >= BPS ? 0n : (locked * BigInt(BPS - unlocked)) / BigInt(BPS);
}

/** The next time holder vesting frees a share of a wallet's bag, or null once it is all free. */
export function nextWalletUnlock(start: number, cliff: number, period: number, unlockBps: number, now: number): number | null {
  if (period === 0 || unlockBps === 0) return null;
  const first = start + cliff + period;
  if (now < first) return first;
  const last = start + walletVestLength(cliff, period, unlockBps);
  if (now >= last) return null;
  return start + cliff + (Math.floor((now - start - cliff) / period) + 1) * period;
}

type WalletCapRules = Pick<LaunchRulesView, "launchTimestamp" | "maxWalletBps" | "risingStartBps" | "risingStepBps" | "risingDoubles" | "risingPeriod" | "chapterStartBps" | "chapterVolumeBps">;

const doubled = (start: number, times: number) => (times >= 14 ? BPS : start * 2 ** times);

/** The max per wallet at `now` in basis points of supply, as `FortuneLaunchRules._walletCap`; 0 when there is none. */
export function walletCapBps(rules: WalletCapRules, now: number, volume: bigint, supply: bigint): number {
  let value: number;
  if (rules.maxWalletBps) return rules.maxWalletBps;
  if (rules.risingStartBps) {
    const periods = Math.floor(Math.max(0, now - rules.launchTimestamp) / rules.risingPeriod);
    value = rules.risingDoubles ? doubled(rules.risingStartBps, periods) : rules.risingStartBps + periods * rules.risingStepBps;
  } else if (rules.chapterStartBps) {
    const perChapter = (supply * BigInt(rules.chapterVolumeBps)) / BigInt(BPS);
    value = doubled(rules.chapterStartBps, perChapter > 0n ? Number(volume / perChapter) : 0);
  } else {
    return 0;
  }
  return value >= BPS ? 0 : value;
}

/** Launch tokens for `bpsOfSupply`, as the contract rounds them. */
export function capTokens(supply: bigint, bpsOfSupply: number) {
  return (supply * BigInt(bpsOfSupply)) / BigInt(BPS);
}

/** Graduated sell caps: the most a wallet holding `bag` may sell at once, as `FortuneLaunchRules._sellCap`. */
export function sellTierCap(supply: bigint, smallBps: number, floorBps: number, bagBps: number, bag: bigint): bigint {
  const small = capTokens(supply, smallBps);
  if (bag <= small) return small;
  const floor = capTokens(supply, floorBps);
  const big = capTokens(supply, bagBps);
  if (bag >= big) return floor;
  return small - ((small - floor) * (bag - small)) / (big - small);
}

/** Market cap at a graduation progress, as a multiple of the launch market cap: the curve's price grows as (1 + 3p)². */
export function marketCapMultiple(progressBps: number) {
  const p = progressBps / BPS;
  return (1 + 3 * p) ** 2;
}

/** A duration in the largest unit that reads naturally; a no-break space keeps the number with its unit. */
export function formatDuration(totalSeconds: number, zh = false) {
  const s = Math.max(0, Math.round(totalSeconds));
  const unit = (value: number, en: string, cn: string) => (zh ? `${value} ${cn}` : `${value} ${en}`);
  if (s < 120) return unit(s, "s", "秒");
  if (s < 2 * 3_600 && s % 3_600 !== 0) return unit(Math.round(s / 60), "min", "分钟");
  if (s < 2 * 86_400) return unit(Math.round((s / 3_600) * 10) / 10, "h", "小时");
  return unit(Math.round((s / 86_400) * 10) / 10, "days", "天");
}

const percent = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
const gweiText = (wei: string | bigint | number) => formatUnits(BigInt(wei), 9);

type TradeSummary = Partial<
  Pick<
    LaunchRulesView,
    | "marketHours" | "sellTierSmallBps" | "sellTierFloorBps" | "sellTierBagBps" | "slideMaxBuyBps" | "slideMaxSellBps" | "levels"
    | "risingStartBps" | "risingStepBps" | "risingDoubles" | "risingPeriod" | "chapterStartBps" | "chapterVolumeBps" | "gasCapSeconds"
    | "maxBuysPerBlock" | "bundleMinBps" | "walletVestWindow" | "walletVestCliff" | "walletVestUnlockBps" | "walletVestPeriod"
  >
> & { maxGasPrice?: string | bigint | number };

type SummaryInput = Pick<
  LaunchRulesView,
  | "maxWalletBps" | "maxBuyBps" | "maxSellBps" | "sellCooldown" | "curveOnly" | "vestingWindow" | "vestingCliff" | "vestingDuration" | "allowlistSeconds" | "gateSeconds"
> & TradeSummary & { allowlistCount: number; gateLabel?: string | null; gateMin?: string | null; exemptCount: number };

function capsPhrase(buyBps: number, sellBps: number, zh: boolean) {
  if (zh) return `${buyBps ? `每笔买入最多 ${percent(buyBps)}` : "买入不设上限"}、${sellBps ? `每笔卖出最多 ${percent(sellBps)}` : "卖出不设上限"}`;
  return `${buyBps ? `${percent(buyBps)} per buy` : "no buy cap"} and ${sellBps ? `${percent(sellBps)} per sell` : "no sell cap"}`;
}

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
  if (rules.marketHours) {
    const sellsOpen = (rules.marketHours & MARKET_SELLS_OPEN) !== 0;
    const holidays = (rules.marketHours & MARKET_IGNORE_HOLIDAYS) === 0;
    if (zh) {
      const session = `纽约时间周一至周五 9:30–16:00${holidays ? "，纽交所假日休市，提前收市日 13:00 收市" : "，假日照常"}`;
      lines.push(sellsOpen ? `只能在美股交易时段（${session}）在曲线上买入；卖出全天开放` : `只能在美股交易时段（${session}）在曲线上买卖`);
    } else {
      const session = `Monday to Friday, 9:30am to 4:00pm New York time${holidays ? ", closed on NYSE holidays and at 1:00pm on its early-close days" : ", holidays included"}`;
      lines.push(sellsOpen ? `Buys on the curve only during US market hours (${session}); sells stay open around the clock` : `Trades on the curve only during US market hours (${session})`);
    }
  }
  if (rules.sellTierSmallBps) {
    lines.push(zh
      ? `持仓不超过供应量 ${percent(rules.sellTierSmallBps)} 的钱包每次最多可卖出 ${percent(rules.sellTierSmallBps)}；持仓越大，单笔卖出上限越小，持仓达到 ${percent(rules.sellTierBagBps ?? 0)} 及以上时单笔最多 ${percent(rules.sellTierFloorBps ?? 0)}`
      : `Wallets holding up to ${percent(rules.sellTierSmallBps)} of supply sell up to that much at once; bigger bags get a smaller cap per sell, down to ${percent(rules.sellTierFloorBps ?? 0)} for bags of ${percent(rules.sellTierBagBps ?? 0)} or more`);
  }
  if (rules.levels?.length) {
    const stages = rules.levels.map((level) => (zh
      ? `进度达到 ${percent(level.fromProgressBps)} 起${capsPhrase(level.maxBuyBps, level.maxSellBps, true)}`
      : `from ${percent(level.fromProgressBps)}, ${capsPhrase(level.maxBuyBps, level.maxSellBps, false)}`));
    lines.push(zh
      ? `上限随毕业进度变化：开盘时${capsPhrase(rules.slideMaxBuyBps ?? 0, rules.slideMaxSellBps ?? 0, true)}；${stages.join("；")}`
      : `Caps change with graduation progress: at launch, ${capsPhrase(rules.slideMaxBuyBps ?? 0, rules.slideMaxSellBps ?? 0, false)}; ${stages.join("; ")}`);
  }
  if (rules.risingStartBps) {
    const every = formatDuration(rules.risingPeriod ?? 0, zh);
    lines.push(zh
      ? `每个钱包的持仓上限从供应量的 ${percent(rules.risingStartBps)} 开始，${rules.risingDoubles ? `每 ${every} 翻倍` : `每 ${every} 增加 ${percent(rules.risingStepBps ?? 0)}`}，直到不再设限`
      : `Max per wallet starts at ${percent(rules.risingStartBps)} of supply and ${rules.risingDoubles ? `doubles every ${every}` : `rises by ${percent(rules.risingStepBps ?? 0)} every ${every}`} until it no longer limits anyone`);
  }
  if (rules.chapterStartBps) {
    lines.push(zh
      ? `每个钱包的持仓上限从供应量的 ${percent(rules.chapterStartBps)} 开始，曲线上每累计成交供应量的 ${percent(rules.chapterVolumeBps ?? 0)}，上限翻倍`
      : `Max per wallet starts at ${percent(rules.chapterStartBps)} of supply and doubles each time another ${percent(rules.chapterVolumeBps ?? 0)} of supply trades on the curve`);
  }
  if (rules.maxGasPrice && BigInt(rules.maxGasPrice) > 0n) {
    lines.push(zh
      ? `开盘 ${formatDuration(rules.gasCapSeconds ?? 0, true)} 内，Gas 价格高于 ${gweiText(rules.maxGasPrice)} gwei 的买入会被拒绝（创建者和豁免钱包除外）`
      : `For the first ${formatDuration(rules.gasCapSeconds ?? 0)}, buys paying more than ${gweiText(rules.maxGasPrice)} gwei per gas are refused (the creator and exempt wallets excepted)`);
  }
  if (rules.maxBuysPerBlock) {
    lines.push(zh
      ? `每个区块最多 ${rules.maxBuysPerBlock} 笔不少于供应量 ${percent(rules.bundleMinBps ?? 0)} 的买入`
      : `At most ${rules.maxBuysPerBlock} ${rules.maxBuysPerBlock === 1 ? "buy" : "buys"} of ${percent(rules.bundleMinBps ?? 0)} of supply or more per block`);
  }
  if (rules.walletVestPeriod) {
    const cliff = rules.walletVestCliff ?? 0;
    const unlock = rules.walletVestUnlockBps ?? 0;
    const total = formatDuration(walletVestLength(cliff, rules.walletVestPeriod, unlock), zh);
    const every = formatDuration(rules.walletVestPeriod, zh);
    if (zh) {
      const which = rules.walletVestWindow ? `开盘 ${formatDuration(rules.walletVestWindow, true)} 内的买入` : "每笔买入";
      lines.push(`${which}按各自钱包的时钟锁仓：${cliff ? `前 ${formatDuration(cliff, true)} 不解锁，之后` : ""}每 ${every} 解锁 ${percent(unlock)}，最后一次锁仓买入后 ${total} 内全部解锁；新的锁仓买入会为仍锁定的部分重新计时`);
    } else {
      const which = rules.walletVestWindow ? `Buys in the first ${formatDuration(rules.walletVestWindow)}` : "Every buy";
      lines.push(`${which} ${rules.walletVestWindow ? "lock" : "locks"} on each wallet's own clock: ${cliff ? `nothing unlocks for ${formatDuration(cliff)}, then ` : ""}${percent(unlock)} every ${every}, all free within ${total} of the wallet's last vesting buy, which restarts the clock for what is still locked`);
    }
  }
  if (rules.exemptCount) {
    const skips = Boolean(rules.maxBuysPerBlock || (rules.maxGasPrice && BigInt(rules.maxGasPrice) > 0n));
    lines.push(zh
      ? `${rules.exemptCount} 个豁免钱包可以超出持仓和买入上限${skips ? "、不受 Gas 上限和防捆绑限制" : ""}，并可在钱包间转账，但同样受卖出上限、冷却${rules.marketHours ? "、锁仓和交易时段" : "和锁仓"}约束`
      : `${rules.exemptCount} exempt ${rules.exemptCount === 1 ? "wallet" : "wallets"} may exceed the wallet and buy caps${skips ? ", skip the gas cap and anti-bundle limit," : ""} and move tokens between wallets, but sell caps, cooldowns${rules.marketHours ? ", vesting and market hours" : " and vesting"} still apply`);
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
    case "RulesMarketClosed":
      return zh
        ? "美股休市中：该发行只在美股交易时段（纽约时间周一至周五 9:30–16:00）在曲线上交易。"
        : "The market is closed: this launch trades on the curve only during US market hours (Monday to Friday, 9:30am to 4:00pm New York time).";
    case "RulesGasPrice":
      return zh
        ? `该发行目前拒绝 Gas 价格高于 ${amount !== null ? gweiText(amount) : ""} gwei 的买入。请调低 Gas 价格后重试。`
        : `This launch refuses buys paying more than ${amount !== null ? gweiText(amount) : "its cap in"} gwei per gas right now. Lower the gas price and try again.`;
    case "RulesBundle":
      return zh
        ? `这个区块的买入已达该发行允许的上限（${amount ?? ""} 笔），请稍后重试。`
        : `This block already holds the ${amount ?? "most"} buys this launch allows. Try again in a moment.`;
    default:
      return null;
  }
}
