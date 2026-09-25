import test from "node:test";
import assert from "node:assert/strict";
import { curveEconomics, curveTokensForUsd, curveUsdForTokens, firstBuyPreview } from "../../lib/launch-preview.ts";

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);

test("curve purchase math inverts the reserve integral", () => {
  for (const [base, slope, tokens] of [[0.001, 1e-12, 1234], [0.001, 1e-8, 41_421], [0.5, 0, 10]]) {
    close(curveTokensForUsd(base, slope, curveUsdForTokens(base, slope, tokens)), tokens);
  }
  assert.equal(curveTokensForUsd(0.001, 1e-8, 0), 0);
});

test("curve economics report opening and graduation market caps", () => {
  const economics = curveEconomics({ supply: 10_000_000, base: 0.001, slope: 1e-8, graduationUsd: 50 });
  close(economics.openingMarketCap, 10_000);
  close(economics.graduationPrice, Math.sqrt(1e-6 + 2 * 1e-8 * 50));
  close(economics.soldShare, economics.soldAtGraduation / 10_000_000);
  assert.equal(curveEconomics({ supply: 0, base: 0.001, slope: 1e-8, graduationUsd: 50 }), null);
});

test("an atomic first buy pays the 99% Launch Shield and 1% fees", () => {
  const preview = firstBuyPreview({ amount: 100, quotePriceUsd: 1, supply: 1_000_000_000, base: 0.001, slope: 1e-12, graduationUsd: 1 });
  close(preview.shield, 99);
  close(preview.fee, 0.01);
  close(preview.netUsd, 0.99);
  close(preview.tokens, curveTokensForUsd(0.001, 1e-12, 0.99));
  assert.equal(preview.reachesGraduation, false);
  assert.equal(preview.exceedsWalletCap, false);
  assert.ok(preview.afterShieldTokens > preview.tokens * 1.009, "the same amount after the shield buys far more");
});

test("a first buy past the graduation target is filled to the target and refunded", () => {
  const preview = firstBuyPreview({ amount: 200, quotePriceUsd: 1, supply: 1_000_000_000, base: 0.001, slope: 1e-12, graduationUsd: 1 });
  assert.equal(preview.reachesGraduation, true);
  close(preview.netUsd, 1);
  close(preview.spent, 1 / 0.0099);
  close(preview.refund, 200 - 1 / 0.0099);
});

test("a first buy above the 2% early-wallet cap is flagged with the largest safe amount", () => {
  const inputs = { quotePriceUsd: 776, supply: 10_000_000, base: 0.001, slope: 1e-8, graduationUsd: 1_000_000 };
  const small = firstBuyPreview({ ...inputs, amount: 1 });
  assert.equal(small.exceedsWalletCap, false);
  close(small.maxAmountUnderCap, curveUsdForTokens(0.001, 1e-8, 200_000) / 776 / 0.0099);
  const large = firstBuyPreview({ ...inputs, amount: small.maxAmountUnderCap * 1.01 });
  assert.equal(large.exceedsWalletCap, true);
});
