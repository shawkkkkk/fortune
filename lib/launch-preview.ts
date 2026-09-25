// Display-only previews of Standard curve economics and a creator's atomic first
// buy. They mirror FortuneCurve's formulas in floating point so a creator can
// see the outcome before signing; the wallet transaction still simulates the
// exact onchain result and enforces a minimum output.

// FortuneCurve constants for Standard launches.
export const LAUNCH_SHIELD_START_BPS = 9_900; // 99% on buys in the creation block
export const EARLY_WALLET_CAP_BPS = 200; // 2% of supply per wallet for 15 seconds
export const STANDARD_FEE_BPS = 100; // 0.5% creator + 0.5% protocol

/** Tokens bought for `usd` of net reserve on P(x) = base + slope·x, starting from `sold` tokens. */
export function curveTokensForUsd(base: number, slope: number, usd: number, sold = 0) {
  if (!(usd > 0) || !(base > 0) || slope < 0) return 0;
  const p0 = base + slope * sold;
  if (slope === 0) return usd / p0;
  return (Math.sqrt(p0 * p0 + 2 * slope * usd) - p0) / slope;
}

/** USD of net reserve needed to buy `tokens` from an empty curve. */
export function curveUsdForTokens(base: number, slope: number, tokens: number) {
  return base * tokens + (slope * tokens * tokens) / 2;
}

export type CurveInputs = { supply: number; base: number; slope: number; graduationUsd: number };

export function curveEconomics({ supply, base, slope, graduationUsd }: CurveInputs) {
  if (!(supply > 0) || !(base > 0) || slope < 0 || !(graduationUsd > 0)) return null;
  const soldAtGraduation = Math.min(curveTokensForUsd(base, slope, graduationUsd), supply);
  const graduationPrice = base + slope * soldAtGraduation;
  return {
    openingMarketCap: base * supply,
    graduationPrice,
    graduationMarketCap: graduationPrice * supply,
    soldAtGraduation,
    soldShare: soldAtGraduation / supply,
  };
}

export function firstBuyPreview(input: CurveInputs & { amount: number; quotePriceUsd: number; shieldBps?: number; feeBps?: number }) {
  const { amount, quotePriceUsd, supply, base, slope, graduationUsd } = input;
  const shieldBps = input.shieldBps ?? LAUNCH_SHIELD_START_BPS;
  const feeBps = input.feeBps ?? STANDARD_FEE_BPS;
  if (!(amount > 0) || !(quotePriceUsd > 0) || !curveEconomics(input)) return null;

  const keep = (1 - shieldBps / 10_000) * (1 - feeBps / 10_000);
  const shield = amount * (shieldBps / 10_000);
  const fee = (amount - shield) * (feeBps / 10_000);
  let spent = amount;
  let netUsd = (amount - shield - fee) * quotePriceUsd;

  // The curve fills only up to the graduation target and refunds the rest.
  const reachesGraduation = netUsd >= graduationUsd;
  if (reachesGraduation) {
    netUsd = graduationUsd;
    spent = graduationUsd / quotePriceUsd / keep;
  }
  const tokens = curveTokensForUsd(base, slope, netUsd);
  const walletCap = supply * (EARLY_WALLET_CAP_BPS / 10_000);
  const capUsd = curveUsdForTokens(base, slope, walletCap);
  const afterShieldTokens = curveTokensForUsd(base, slope, Math.min(amount * (1 - feeBps / 10_000) * quotePriceUsd, graduationUsd));

  return {
    shield: spent * (shieldBps / 10_000),
    fee: spent * (1 - shieldBps / 10_000) * (feeBps / 10_000),
    spent,
    refund: amount - spent,
    netQuote: spent * keep,
    netUsd,
    tokens,
    supplyShare: tokens / supply,
    reachesGraduation,
    exceedsWalletCap: tokens > walletCap,
    /** Largest first buy, in the quote asset, that stays inside the early-wallet cap. */
    maxAmountUnderCap: capUsd / quotePriceUsd / keep,
    /** The same amount at the opening price once the shield has decayed to zero. */
    afterShieldTokens,
  };
}
