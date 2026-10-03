import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import {
  STOCK_REWARDS,
  STOCK_REWARDS_PREFLIGHT_TEXT,
  STOCK_REWARDS_RULES,
  checkWeights,
  curveEconomics,
  equalWeights,
  fixedTargets,
  graduationPlan,
  graduationPrice,
  minimumTargetFor,
  poolPriceFits,
  preflightText,
  sqrt,
  stockRewardsPhase,
  streamProgress,
  withRewardsHeadroom,
} from "../../lib/stock-rewards.ts";
import { poolTokenPriceUsd } from "../../lib/stock-rewards-read.ts";
import { STOCK_REWARDS_FACTORY_ABI, STOCK_REWARDS_TOKEN_ABI } from "../../lib/stock-rewards-artifacts.ts";

const E18 = 10n ** 18n;

test("Stock Rewards stay off unless a testnet factory is configured", () => {
  assert.equal(STOCK_REWARDS.enabled, false);
  assert.equal(STOCK_REWARDS.factory, null);
});

// Read from FortuneStockRewardsFactory.curveEconomics on a BSC Testnet fork.
const SOLIDITY_ECONOMICS = [
  [10n * E18, 3_305_785_123n, 54n],
  [1_000n * E18, 330_578_512_396n, 5_409n],
  [10_000n * E18, 3_305_785_123_966n, 54_094n],
  [50_000n * E18, 16_528_925_619_834n, 270_473n],
  [123_456_789n * 10n ** 15n, 40_812_161_652_892n, 667_835n],
  [1_000_000n * E18, 330_578_512_396_694n, 5_409_466n],
];

test("curve economics match the factory exactly", () => {
  for (const [target, base, slope] of SOLIDITY_ECONOMICS) {
    const economics = curveEconomics(target);
    assert.equal(economics.base, base, `base at ${target}`);
    assert.equal(economics.slope, slope, `slope at ${target}`);
    assert.equal(economics.ok, true);
  }
  assert.equal(graduationPrice(10_000n * E18), 3_305_785_123_966n + (54_094n * STOCK_REWARDS_RULES.curveSale) / E18);
});

test("the curve opens at about $3,306 FDV per $10,000 target and ends ten times higher", () => {
  const { base } = curveEconomics(10_000n * E18);
  const openingFdv = Number(base) / 1e18 * 1e9;
  assert.ok(Math.abs(openingFdv - 3_305.785) < 0.01);
  const ratio = Number(graduationPrice(10_000n * E18)) / Number(base);
  assert.ok(Math.abs(ratio - 10) < 0.01);
});

test("the pool price range matches the factory, including the low-decimal limit", () => {
  // Read from FortuneStockRewardsFactory.poolPriceFits on the same fork.
  assert.equal(poolPriceFits(230n * E18, 6, 33_057_851_239_669n), false);
  assert.equal(poolPriceFits(230n * E18, 6, 165_289_256_198_347n), true);
  assert.equal(poolPriceFits(190n * E18, 8, 33_057_851_239_669n), true);
  assert.equal(poolPriceFits(18n * 10n ** 17n, 18, 33_057_851_239_669n), true);
  assert.equal(poolPriceFits(0n, 18, 1n), false);
  assert.equal(poolPriceFits(230n * E18, 37, 1n), false);
  assert.equal(minimumTargetFor(230n * E18, 6), 20_000);
  assert.equal(minimumTargetFor(230n * E18, 18), 10);
});

test("equal shares add up to 100% with the remainder on the last stock", () => {
  assert.deepEqual(equalWeights(1), [10_000]);
  assert.deepEqual(equalWeights(3), [3_333, 3_333, 3_334]);
  assert.deepEqual(equalWeights(5), [2_000, 2_000, 2_000, 2_000, 2_000]);
  for (let count = 1; count <= 5; count++) {
    assert.equal(equalWeights(count).reduce((sum, weight) => sum + weight, 0), 10_000);
    assert.equal(checkWeights(equalWeights(count)).ok, true);
  }
});

test("shares need 10% each, add up to 100% and cover one to five stocks", () => {
  assert.equal(checkWeights([999, 9_001]).ok, false);
  assert.equal(checkWeights([5_000, 5_001]).ok, false);
  assert.equal(checkWeights([]).ok, false);
  assert.equal(checkWeights([1_000, 1_000, 1_000, 1_000, 1_000, 5_000]).ok, false);
  const result = checkWeights([5_000, 4_000]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /90%/);
  assert.match(result.reasonZh, /90/);
});

test("fixed targets match the curve's split of the graduation target", () => {
  const targets = fixedTargets(10_000n * E18 + 1n, [3_333, 3_333, 3_334]);
  assert.equal(targets[0], (10_000n * E18 + 1n) * 3_333n / 10_000n);
  assert.equal(targets.reduce((sum, value) => sum + value, 0n), 10_000n * E18 + 1n);
});

test("the graduation plan encodes the adapter's GraduationPlan with the launch's fee tier", () => {
  const encoded = graduationPlan(3, 10_000, 1_900_000_000);
  const [plan] = decodeAbiParameters(
    [{ type: "tuple", components: [{ name: "fees", type: "uint24[]" }, { name: "maxSqrtPriceDeviationBps", type: "uint16" }, { name: "maxDustBps", type: "uint16" }, { name: "deadline", type: "uint64" }] }],
    encoded
  );
  assert.deepEqual([...plan.fees], [10_000, 10_000, 10_000]);
  assert.equal(plan.maxSqrtPriceDeviationBps, 100);
  assert.equal(plan.maxDustBps, 100);
  assert.equal(plan.deadline, 1_900_000_000n);
});

test("gas headroom covers the token's once-per-block release for every stock", () => {
  assert.equal(withRewardsHeadroom(100_000n, 5), 270_000n);
  assert.equal(withRewardsHeadroom(100_000n, 0), 150_000n);
});

test("a stream releases what is left evenly over the time left", () => {
  assert.deepEqual(streamProgress(600n, 1_000, 400), { remainingSeconds: 600, perSecond: 1n });
  assert.deepEqual(streamProgress(600n, 1_000, 1_200), { remainingSeconds: 0, perSecond: 0n });
  assert.deepEqual(streamProgress(0n, 1_000, 400), { remainingSeconds: 600, perSecond: 0n });
});

test("phases follow FortuneCurve.Phase", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(stockRewardsPhase), ["CurveActive", "GraduationReady", "Graduated", "Rescued", "CurveActive"]);
});

test("pool prices convert to dollars per launch token in both token orders", () => {
  // 1 launch token = 1.32e-7 of an 18-decimal $250 stock, so $3.3e-5 a token.
  const stockPerToken = (132n << 192n) / 10n ** 9n;
  const sqrtLaunchFirst = sqrt(stockPerToken);
  const priced = poolTokenPriceUsd(sqrtLaunchFirst, true, 18, 250n * E18);
  assert.ok(Math.abs(Number(priced) / 1e18 - 3.3e-5) / 3.3e-5 < 1e-6);
  const tokenPerStock = (10n ** 9n << 192n) / 132n;
  const sqrtStockFirst = sqrt(tokenPerStock);
  const reversed = poolTokenPriceUsd(sqrtStockFirst, false, 18, 250n * E18);
  assert.ok(Math.abs(Number(reversed) / 1e18 - 3.3e-5) / 3.3e-5 < 1e-6);
  assert.equal(poolTokenPriceUsd(0n, true, 18, 250n * E18), 0n);
});

test("every reason the factory preflight can return reads as a sentence in both languages", () => {
  const factory = readFileSync(new URL("../../contracts-stock-rewards/src/FortuneStockRewardsFactory.sol", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../../contracts/src/FortuneAssetRegistry.sol", import.meta.url), "utf8");
  const preflight = factory.slice(factory.indexOf("function preflight("), factory.indexOf("function poolPriceFits("));
  const health = registry.slice(registry.indexOf("function assetHealth("), registry.indexOf("function usdValue("));
  const codes = new Set([
    ...[...preflight.matchAll(/return \(false, "([A-Z_]+)"\)/g)].map((match) => match[1]),
    ...[...health.matchAll(/bytes32\("([A-Z_]+)"\)/g)].map((match) => match[1]).filter((code) => code !== "OK"),
  ]);
  assert.ok(codes.size > 25);
  for (const code of codes) {
    assert.ok(STOCK_REWARDS_PREFLIGHT_TEXT[code], `no text for ${code}`);
    assert.notEqual(preflightText(code, false), `Preflight failed: ${code}`);
    assert.match(preflightText(code, true), /[一-鿿]/);
  }
  assert.equal(preflightText("SOMETHING_NEW", false), "Preflight failed: SOMETHING_NEW");
});

test("the website ABIs carry what the pages call", () => {
  const factoryFunctions = new Set(STOCK_REWARDS_FACTORY_ABI.filter((item) => item.type === "function").map((item) => item.name));
  for (const name of ["preflight", "createLaunch", "graduate", "collectPoolFees", "launchAt", "positionIds", "graduationAdapter", "liquidityLocker", "curveEconomics", "poolPriceFits"]) {
    assert.ok(factoryFunctions.has(name), name);
  }
  const tokenFunctions = new Set(STOCK_REWARDS_TOKEN_ABI.filter((item) => item.type === "function").map((item) => item.name));
  for (const name of ["claim", "claimFor", "claimable", "claimableOf", "sync", "previewRewardState", "rewardState", "eligibleSupply", "excludePool", "isPancakePool"]) {
    assert.ok(tokenFunctions.has(name), name);
  }
});
