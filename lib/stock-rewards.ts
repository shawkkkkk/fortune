import { encodeAbiParameters, getAddress, isAddress, type Address, type Hex } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// Stock Rewards beta: a launch paired with one to five tokenized stocks whose
// holders earn every one of them. The contracts in contracts-stock-rewards/ are
// UNAUDITED and refuse chain 56, so the site only enables them on BSC Testnet.

const configuredFactory = (process.env.NEXT_PUBLIC_FORTUNE_STOCK_REWARDS_FACTORY_ADDRESS || "").trim();

export const STOCK_REWARDS = {
  chainId: FORTUNE_NETWORK.chainId,
  factory: isAddress(configuredFactory) ? (getAddress(configuredFactory) as Address) : null,
  enabled: isAddress(configuredFactory) && FORTUNE_NETWORK.chainId === 97,
} as const;

const E18 = 10n ** 18n;

/** Mirrors FortuneStockRewardsFactory, FortuneStockRewardsToken and FortuneCurve constants. */
export const STOCK_REWARDS_RULES = {
  bps: 10_000,
  totalSupply: 1_000_000_000n * E18,
  /** Tokens the curve has sold when it reaches its target, if stock prices hold. */
  curveSale: 550_000_000n * E18,
  /** Curve price at the target as a multiple of the opening price. */
  priceMultiple: 10n,
  minGraduationUsd: 10n * E18,
  maxGraduationUsd: 1_000_000n * E18,
  protocolFeeBps: 50,
  maxCreatorFeeBps: 100,
  minHolderFeeBps: 25,
  maxHolderFeeBps: 250,
  minWeightBps: 1_000,
  maxStocks: 5,
  poolFees: [2_500, 10_000] as const,
  poolPriceMargin: 4n,
  graduationBufferBps: 1_000n,
  streamSeconds: 6 * 60 * 60,
  minEligibleSupply: E18,
  snipeTaxStartBps: 9_900,
  snipeTaxSeconds: 5,
  earlyWalletCapBps: 200,
  earlyWalletCapSeconds: 15,
  rescueDelaySeconds: 7 * 24 * 60 * 60,
  /** PancakeSwap V3 keeps this share of every pool fee on BSC (0.25% and 1% tiers). */
  pancakeProtocolShareBps: 3_200,
} as const;

export const STOCK_REWARDS_PHASES = ["CurveActive", "GraduationReady", "Graduated", "Rescued"] as const;
export type StockRewardsPhase = (typeof STOCK_REWARDS_PHASES)[number];

/** FortuneCurve.Phase: CurveActive, GraduationReady, PoolCreated, Rescued. */
export function stockRewardsPhase(value: number | bigint): StockRewardsPhase {
  return STOCK_REWARDS_PHASES[Number(value)] ?? "CurveActive";
}

function mulDiv(a: bigint, b: bigint, denominator: bigint) {
  return (a * b) / denominator;
}

/** Integer square root, rounded down, as OpenZeppelin's Math.sqrt. */
export function sqrt(value: bigint) {
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/**
 * FortuneStockRewardsFactory.curveEconomics: the opening price and slope, in USD (1e18) per whole
 * token, for a graduation target, and whether the curve leaves enough unsold tokens for
 * graduation liquidity (FortuneFactory's check, with its 10% buffer).
 */
export function curveEconomics(graduationUsd1e18: bigint) {
  const rules = STOCK_REWARDS_RULES;
  const base = mulDiv(2n * graduationUsd1e18, E18, rules.curveSale * (rules.priceMultiple + 1n));
  const slope = mulDiv((rules.priceMultiple - 1n) * base, E18, rules.curveSale);
  return { base, slope, ok: graduationFits(base, slope, graduationUsd1e18) };
}

function graduationFits(base: bigint, slope: bigint, target: bigint) {
  const maxScalar = (1n << 120n) - 1n;
  if (base === 0n || slope === 0n || target === 0n) return false;
  if (base > maxScalar || slope > maxScalar || target > maxScalar) return false;
  if (base + mulDiv(slope, STOCK_REWARDS_RULES.totalSupply, E18) > maxScalar) return false;
  const terminal = sqrt(base * base + 2n * slope * target);
  if (terminal <= base) return false;
  const sold = mulDiv(terminal - base, E18, slope);
  const anchor = base + mulDiv(slope, sold, E18);
  if (sold === 0n || anchor === 0n) return false;
  const liquidityTokens = mulDiv(target, E18, anchor);
  const bps = BigInt(STOCK_REWARDS_RULES.bps);
  return mulDiv(sold + liquidityTokens, bps + STOCK_REWARDS_RULES.graduationBufferBps, bps) <= STOCK_REWARDS_RULES.totalSupply;
}

/** The curve price at the target, if stock prices hold: base + slope × CURVE_SALE. */
export function graduationPrice(graduationUsd1e18: bigint) {
  const { base, slope } = curveEconomics(graduationUsd1e18);
  return base + mulDiv(slope, STOCK_REWARDS_RULES.curveSale, E18);
}

/**
 * FortuneStockRewardsFactory.poolPriceFits: the graduation adapter only prices pools whose
 * launch-token and stock amounts, in base units, are within 2^64 of each other. Low-decimal
 * or high-priced stocks need a higher target. Checked with a 4× margin for price moves.
 */
export function poolPriceFits(stockPriceUsd1e18: bigint, decimals: number, tokenPriceUsd1e18: bigint) {
  if (stockPriceUsd1e18 === 0n || tokenPriceUsd1e18 === 0n || decimals > 36) return false;
  const scale = 10n ** BigInt(decimals);
  const margin = STOCK_REWARDS_RULES.poolPriceMargin;
  const limit = (1n << 64n) - 1n;
  const tokensPerUnit = mulDiv(stockPriceUsd1e18, E18 * margin, tokenPriceUsd1e18 * scale);
  const unitsPerToken = mulDiv(tokenPriceUsd1e18 * scale, margin, stockPriceUsd1e18 * E18);
  return tokensPerUnit <= limit && unitsPerToken <= limit;
}

/** The lowest target, in whole dollars from a set of steps, at which a stock's pool can be priced. */
export function minimumTargetFor(stockPriceUsd1e18: bigint, decimals: number) {
  for (const dollars of [10, 100, 1_000, 5_000, 10_000, 20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]) {
    if (poolPriceFits(stockPriceUsd1e18, decimals, graduationPrice(BigInt(dollars) * E18))) return dollars;
  }
  return null;
}

/** Equal shares summing to 10,000 basis points, the rounding remainder on the last stock. */
export function equalWeights(count: number) {
  if (count <= 0) return [];
  const each = Math.floor(STOCK_REWARDS_RULES.bps / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? STOCK_REWARDS_RULES.bps - each * (count - 1) : each));
}

export type WeightCheck = { ok: true } | { ok: false; reason: string; reasonZh: string };

export function checkWeights(weights: number[]): WeightCheck {
  if (!weights.length || weights.length > STOCK_REWARDS_RULES.maxStocks) {
    return { ok: false, reason: "Choose one to five stocks.", reasonZh: "请选择一到五只股票。" };
  }
  if (weights.some((weight) => !Number.isInteger(weight) || weight < STOCK_REWARDS_RULES.minWeightBps)) {
    return { ok: false, reason: "Each stock needs at least a 10% share.", reasonZh: "每只股票至少占 10%。" };
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total !== STOCK_REWARDS_RULES.bps) {
    const percent = (total / 100).toFixed(2).replace(/\.?0+$/, "");
    return {
      ok: false,
      reason: `The shares add up to ${percent}%, not 100%.`,
      reasonZh: `份额合计为 ${percent}%，而不是 100%。`,
    };
  }
  return { ok: true };
}

/** FortuneCurve.fixedTargetReserveUsd for every stock: each share of the target, the remainder on the last. */
export function fixedTargets(graduationUsd1e18: bigint, weights: number[]) {
  let assigned = 0n;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return graduationUsd1e18 - assigned;
    const target = mulDiv(graduationUsd1e18, BigInt(weight), BigInt(STOCK_REWARDS_RULES.bps));
    assigned += target;
    return target;
  });
}

/** `abi.encode(FortunePancakeV3GraduationAdapter.GraduationPlan)` with the launch's fee tier for every stock. */
export function graduationPlan(stockCount: number, poolFee: number, deadline: number, maxSqrtPriceDeviationBps = 100, maxDustBps = 100): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "fees", type: "uint24[]" },
          { name: "maxSqrtPriceDeviationBps", type: "uint16" },
          { name: "maxDustBps", type: "uint16" },
          { name: "deadline", type: "uint64" },
        ],
      },
    ],
    [{ fees: Array.from({ length: stockCount }, () => poolFee), maxSqrtPriceDeviationBps, maxDustBps, deadline: BigInt(deadline) }]
  );
}

/**
 * Gas headroom for a call that may be the first transfer of the token in its block: that one
 * releases every active stream, about 16,000 gas per stock, which an estimate made in a block
 * that already moved the token leaves out. 30,000 per stock covers it with room to spare.
 */
export function withRewardsHeadroom(estimate: bigint, stockCount: number) {
  return estimate + 30_000n * BigInt(Math.max(1, stockCount)) + 20_000n;
}

/** How much of a stream is still to be released at `now`, and the release rate per second. */
export function streamProgress(streaming: bigint, streamEnd: number, now: number) {
  const remainingSeconds = Math.max(0, streamEnd - now);
  if (streaming === 0n || remainingSeconds === 0) return { remainingSeconds, perSecond: 0n };
  return { remainingSeconds, perSecond: streaming / BigInt(remainingSeconds) };
}

export const STOCK_REWARDS_PREFLIGHT_TEXT: Record<string, { en: string; zh: string }> = {
  LAUNCHES_PAUSED: { en: "New Stock Rewards launches are paused right now.", zh: "新的股票分红发行目前已暂停。" },
  NOT_INITIALIZED: { en: "The Stock Rewards factory is not set up yet.", zh: "股票分红工厂尚未完成设置。" },
  BAD_NAME_LENGTH: { en: "The name must be 1 to 64 bytes.", zh: "名称必须为 1 到 64 字节。" },
  BAD_SYMBOL_LENGTH: { en: "The ticker must be 1 to 16 bytes.", zh: "代码必须为 1 到 16 字节。" },
  DESCRIPTION_TOO_LONG: { en: "The description must be at most 1,024 bytes.", zh: "简介最多 1,024 字节。" },
  METADATA_TOO_LONG: { en: "Each link must be at most 256 bytes.", zh: "每个链接最多 256 字节。" },
  TARGET_RANGE: { en: "The graduation target must be between $10 and $1,000,000.", zh: "毕业目标必须在 10 美元到 1,000,000 美元之间。" },
  BAD_ECONOMICS: { en: "The curve does not fit this target.", zh: "该目标无法生成有效的曲线。" },
  BAD_STOCK_COUNT: { en: "Choose one to five stocks.", zh: "请选择一到五只股票。" },
  BAD_WEIGHT_LENGTH: { en: "Each stock needs a share.", zh: "每只股票都需要设置份额。" },
  ZERO_STOCK: { en: "A stock address is missing.", zh: "缺少股票地址。" },
  DUPLICATE_STOCK: { en: "A stock is listed twice.", zh: "有股票重复。" },
  STOCK_NOT_APPROVED: { en: "A stock is not listed in the Stock Rewards registry.", zh: "有股票未在股票分红登记表中。" },
  REWARDS_DISABLED: { en: "A stock is not enabled for holder rewards.", zh: "有股票未开启持有者分红。" },
  GRADUATION_DISABLED: { en: "A stock is not enabled for graduation.", zh: "有股票未开启毕业。" },
  POOL_PRICE_RANGE: { en: "A stock's pool could not be priced at this target. Raise the target.", zh: "在此目标下无法为某只股票的资金池定价。请提高目标。" },
  WEIGHT_TOO_LOW: { en: "Each stock needs at least a 10% share.", zh: "每只股票至少占 10%。" },
  BAD_WEIGHTS: { en: "The shares must add up to 100%.", zh: "份额合计必须为 100%。" },
  CREATOR_FEE_TOO_HIGH: { en: "The creator fee can be at most 1%.", zh: "创作者费最高 1%。" },
  HOLDER_FEE_RANGE: { en: "The holder fee must be between 0.25% and 2.5%.", zh: "持有者费必须在 0.25% 到 2.5% 之间。" },
  BAD_POOL_FEE: { en: "Choose a 0.25% or 1% pool.", zh: "请选择 0.25% 或 1% 的资金池。" },
  ASSET_DISABLED: { en: "A stock is disabled in the registry.", zh: "有股票在登记表中已停用。" },
  QUOTE_DISABLED: { en: "A stock cannot be used to buy right now.", zh: "有股票目前不能用于买入。" },
  STALE_PRICE: { en: "A stock's price is stale. Try again shortly.", zh: "有股票的价格已过期，请稍后再试。" },
  BAD_PRICE: { en: "A stock has no valid price.", zh: "有股票没有有效价格。" },
  BAD_TIMESTAMP: { en: "A stock's price has a bad timestamp.", zh: "有股票的价格时间戳无效。" },
  ORACLE_REVERT: { en: "A stock's price could not be read.", zh: "无法读取某只股票的价格。" },
  DECIMALS_CHANGED: { en: "A stock's decimals changed since it was listed.", zh: "某只股票的小数位数在登记后发生了变化。" },
  DECIMALS_UNREADABLE: { en: "A stock's decimals could not be read.", zh: "无法读取某只股票的小数位数。" },
  UNSUPPORTED_DECIMALS: { en: "A stock has more than 36 decimals.", zh: "某只股票的小数位数超过 36。" },
};

export function preflightText(code: string, zh: boolean) {
  const text = STOCK_REWARDS_PREFLIGHT_TEXT[code];
  if (text) return zh ? text.zh : text.en;
  return zh ? `预检未通过：${code}` : `Preflight failed: ${code}`;
}
