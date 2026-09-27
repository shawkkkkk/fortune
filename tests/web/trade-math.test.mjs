import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SLIPPAGE_BPS,
  GAS_RESERVE_WEI,
  LAUNCH_SHIELD,
  PANCAKE_V3,
  RESCUE_DELAY_SECONDS,
  WRAPPED_NATIVE,
  averagePriceUsd1e18,
  formatBps,
  isWrappedNative,
  maxSpendableNative,
  minimumOut,
  parseSlippagePercent,
  poolImpactBps,
  priceImpactBps,
  rescueOpensAt,
  rescuePayout,
  shieldStatus,
  shieldTaxBpsAt,
  walletCapRemaining,
  wrapShortfall,
} from "../../lib/trade-math.ts";

const E18 = 10n ** 18n;

test("slippage input accepts plain percentages up to 50% and nothing else", () => {
  assert.equal(parseSlippagePercent("1"), 100);
  assert.equal(parseSlippagePercent("0.5"), 50);
  assert.equal(parseSlippagePercent("2.25%"), 225);
  assert.equal(parseSlippagePercent("1,5"), 150);
  assert.equal(parseSlippagePercent("50"), 5000);
  for (const bad of ["", "0", "0.00", "51", "abc", "-1", "1e2", "0.001", "100"]) assert.equal(parseSlippagePercent(bad), null, bad);
  assert.equal(DEFAULT_SLIPPAGE_BPS, 100);
});

test("minimum output rounds down and rejects impossible slippage", () => {
  assert.equal(minimumOut(1000n, 100), 990n);
  assert.equal(minimumOut(999n, 100), 989n);
  assert.equal(minimumOut(123456789n * E18, 50), (123456789n * E18 * 9950n) / 10000n);
  assert.throws(() => minimumOut(1n, 5001));
  assert.throws(() => minimumOut(1n, -1));
});

test("average price and price impact match the curve's own units", () => {
  // $10 of net quote buys 1,000 tokens: $0.01 each.
  assert.equal(averagePriceUsd1e18(10n * E18, 1000n * E18), E18 / 100n);
  assert.equal(averagePriceUsd1e18(1n, 0n), 0n);
  // Spot $0.008, average fill $0.01: 25% above spot.
  assert.equal(priceImpactBps((E18 * 8n) / 1000n, E18 / 100n), 2500);
  // A sell filling below spot reads as a positive impact too.
  assert.equal(priceImpactBps(E18 / 100n, (E18 * 8n) / 1000n), 2000);
  assert.equal(priceImpactBps(0n, E18), null);
  // Pool: 1 BNB in at a mid of 1,000 tokens/BNB, 990 out = 1%.
  assert.equal(poolImpactBps(1, 990, 1000), 100);
  assert.equal(poolImpactBps(1, 1001, 1000), 0);
  assert.equal(poolImpactBps(0, 1, 1), null);
});

test("paying with BNB wraps only the shortfall and keeps gas back", () => {
  assert.equal(wrapShortfall(5n, 2n), 3n);
  assert.equal(wrapShortfall(5n, 9n), 0n);
  assert.equal(maxSpendableNative(GAS_RESERVE_WEI + 10n, 7n), 17n);
  assert.equal(maxSpendableNative(GAS_RESERVE_WEI - 1n, 7n), 7n);
});

test("the Launch Shield schedule matches FortuneCurve.currentSnipeTaxBps", () => {
  // 9900 >> (elapsed * 14 / 5): 99%, 24.75%, 3.09%, 0.38%, 0.04%, then 0 from 5 s.
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 60].map(shieldTaxBpsAt), [9900, 2475, 309, 38, 4, 0, 0, 0]);
  assert.equal(shieldTaxBpsAt(-3), 9900, "a block at or before launch counts as zero elapsed");
  assert.equal(shieldTaxBpsAt(1.9), 2475, "block time is whole seconds");
  const status = shieldStatus(1_000, 1_002);
  assert.deepEqual(status, { elapsed: 2, taxBps: 309, secondsToZero: 3, capActive: true, secondsToCapEnd: 13 });
  assert.equal(shieldStatus(1_000, 1_015).capActive, false);
  assert.equal(LAUNCH_SHIELD.capBps, 200);
  // 2% of 1B tokens, 5M already bought.
  assert.equal(walletCapRemaining(1_000_000_000n * E18, 5_000_000n * E18), 15_000_000n * E18);
  assert.equal(walletCapRemaining(1_000_000_000n * E18, 25_000_000n * E18), 0n);
});

test("rescue timing and payouts follow the curve", () => {
  assert.equal(RESCUE_DELAY_SECONDS, 604_800);
  assert.equal(rescueOpensAt(1_000), 605_800);
  assert.equal(rescueOpensAt(0), null);
  // 10 WBNB reserve, 400 of 1,000 rescue tokens already redeemed: 150 tokens get 10 × 150 / 600.
  assert.equal(rescuePayout(10n * E18, 150n * E18, 1000n * E18, 400n * E18), (10n * E18 * 150n) / 600n);
  // Asking for more than remains pays at most the whole remaining reserve.
  assert.equal(rescuePayout(10n * E18, 900n * E18, 1000n * E18, 400n * E18), 10n * E18);
  assert.equal(rescuePayout(10n * E18, 1n, 5n, 5n), 0n);
});

test("wrapped BNB and PancakeSwap V3 addresses are pinned per chain", () => {
  assert.ok(isWrappedNative(56, "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"));
  assert.ok(isWrappedNative(97, WRAPPED_NATIVE[97]));
  assert.equal(isWrappedNative(56, WRAPPED_NATIVE[97]), false);
  assert.equal(isWrappedNative(1, WRAPPED_NATIVE[56]), false);
  assert.equal(isWrappedNative(56, null), false);
  assert.equal(PANCAKE_V3[56].swapRouter, PANCAKE_V3[97].swapRouter);
  assert.notEqual(PANCAKE_V3[56].quoter, PANCAKE_V3[97].quoter);
  assert.equal(formatBps(100), "1%");
  assert.equal(formatBps(50), "0.50%");
  assert.equal(formatBps(2475), "24.8%");
});
