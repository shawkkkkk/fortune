import type { Address } from "viem";

// Pure helpers for the trade panels: slippage, price impact, the Launch Shield
// schedule and the wrapped-BNB and PancakeSwap V3 contracts trades go through.
// No network reads here, so every number the panels show can be tested.

export const BPS = 10_000n;

/** Wrapped BNB per chain: the WETH9 of PancakeSwap's routers, checked onchain 2026-09-27. */
export const WRAPPED_NATIVE: Record<number, Address> = {
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  97: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

/**
 * PancakeSwap V3 periphery, checked onchain 2026-09-27: both routers report
 * WETH9 = WBNB and factory 0x0BFb…1865 on their chain.
 */
export const PANCAKE_V3: Record<number, { swapRouter: Address; quoter: Address }> = {
  56: { swapRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997" },
  97: { swapRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", quoter: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2" },
};

export function isWrappedNative(chainId: number, asset: string | null | undefined) {
  return Boolean(asset && WRAPPED_NATIVE[chainId]?.toLowerCase() === asset.toLowerCase());
}

// ---------------------------------------------------------------------------
// Slippage

export const SLIPPAGE_PRESETS_BPS = [50, 100, 200, 500] as const;
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 5_000;

/** "1.5" → 150 bps. Anything empty, non-numeric, zero or above 50% is rejected. */
export function parseSlippagePercent(input: string): number | null {
  const text = input.trim().replace(",", ".").replace(/%$/, "");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps > 0 && bps <= MAX_SLIPPAGE_BPS ? bps : null;
}

/** The least a trade may return: the quoted amount minus the slippage allowance, rounded down. */
export function minimumOut(amount: bigint, slippageBps: number) {
  if (slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) throw new Error("Slippage out of range.");
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

// ---------------------------------------------------------------------------
// Prices

/** Average USD price per whole token, 18 decimals: usd1e18 per token1e18. */
export function averagePriceUsd1e18(usd1e18: bigint, tokens1e18: bigint) {
  return tokens1e18 > 0n ? (usd1e18 * 10n ** 18n) / tokens1e18 : 0n;
}

/** How far the average fill sits from the price before the trade, in bps (always positive). */
export function priceImpactBps(spotUsd1e18: bigint, averageUsd1e18: bigint): number | null {
  if (spotUsd1e18 <= 0n || averageUsd1e18 <= 0n) return null;
  const difference = averageUsd1e18 > spotUsd1e18 ? averageUsd1e18 - spotUsd1e18 : spotUsd1e18 - averageUsd1e18;
  return Number((difference * BPS) / spotUsd1e18);
}

/** Pool trades: shortfall of the actual output against the mid price, in bps (includes the pool fee). */
export function poolImpactBps(amountIn: number, amountOut: number, midPriceOutPerIn: number): number | null {
  if (!(amountIn > 0) || !(amountOut > 0) || !(midPriceOutPerIn > 0)) return null;
  const expected = amountIn * midPriceOutPerIn;
  return Math.max(0, Math.round(((expected - amountOut) / expected) * 10_000));
}

// ---------------------------------------------------------------------------
// Wrapped BNB

/** WBNB that must be wrapped from BNB before a buy of `amount`. */
export function wrapShortfall(amount: bigint, wrappedBalance: bigint) {
  return amount > wrappedBalance ? amount - wrappedBalance : 0n;
}

/** BNB kept back for gas when a buyer taps Max. */
export const GAS_RESERVE_WEI = 3_000_000_000_000_000n; // 0.003 BNB

export function maxSpendableNative(nativeBalance: bigint, wrappedBalance: bigint) {
  const native = nativeBalance > GAS_RESERVE_WEI ? nativeBalance - GAS_RESERVE_WEI : 0n;
  return native + wrappedBalance;
}

// ---------------------------------------------------------------------------
// Launch Shield (FortuneCurve): buys pay a 99% tax that halves every 5/14 s
// (whole seconds of block time) and reaches 0 at 5 s. For the first 15 s each
// wallet may buy at most 2% of supply. Both apply to every buyer, the
// creator's opening purchase included.

export const LAUNCH_SHIELD = { startBps: 9_900, seconds: 5, capBps: 200, capSeconds: 15 } as const;

export function shieldTaxBpsAt(elapsedSeconds: number) {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  if (elapsed >= LAUNCH_SHIELD.seconds) return 0;
  const shift = Math.floor((elapsed * 14) / LAUNCH_SHIELD.seconds);
  return LAUNCH_SHIELD.startBps >> shift;
}

export function shieldStatus(launchTimestamp: number, chainNow: number) {
  const elapsed = Math.max(0, Math.floor(chainNow - launchTimestamp));
  return {
    elapsed,
    taxBps: shieldTaxBpsAt(elapsed),
    secondsToZero: Math.max(0, LAUNCH_SHIELD.seconds - elapsed),
    capActive: elapsed < LAUNCH_SHIELD.capSeconds,
    secondsToCapEnd: Math.max(0, LAUNCH_SHIELD.capSeconds - elapsed),
  };
}

/** Tokens one wallet may still buy while the 2% early cap applies. */
export function walletCapRemaining(totalSupply: bigint, alreadyBought: bigint) {
  const cap = (totalSupply * BigInt(LAUNCH_SHIELD.capBps)) / BPS;
  return alreadyBought >= cap ? 0n : cap - alreadyBought;
}

// ---------------------------------------------------------------------------
// Graduation rescue: seven days after a launch becomes ready to graduate
// without graduating, anyone may open rescue; holders then redeem tokens for a
// pro-rata share of every quote reserve.

export const RESCUE_DELAY_SECONDS = 7 * 24 * 60 * 60;

export function rescueOpensAt(graduationReadyAt: number) {
  return graduationReadyAt > 0 ? graduationReadyAt + RESCUE_DELAY_SECONDS : null;
}

/** Quote returned for `tokenAmount`: reserve × amount ÷ (rescue supply − already redeemed), as the curve computes it. */
export function rescuePayout(reserve: bigint, tokenAmount: bigint, rescueSupply: bigint, rescueRedeemed: bigint) {
  const remaining = rescueSupply - rescueRedeemed;
  if (remaining <= 0n || tokenAmount <= 0n) return 0n;
  return (reserve * (tokenAmount > remaining ? remaining : tokenAmount)) / remaining;
}

// ---------------------------------------------------------------------------
// Formatting

export function formatBps(bps: number) {
  const percent = bps / 100;
  return (Number.isInteger(percent) ? percent.toFixed(0) : percent < 1 ? percent.toFixed(2) : percent.toFixed(1)) + "%";
}
