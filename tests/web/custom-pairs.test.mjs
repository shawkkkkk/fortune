import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CUSTOM_PAIRS,
  CUSTOM_PAIR_RULES,
  afterTax,
  firstBuyTokens,
  pairForTokens,
  previewCurveBuy,
  shieldBpsAt,
  splitBuy,
  spotPriceX18,
  tokensForNet,
} from "../../lib/custom-pairs.ts";
import { controlsInCode, minimalProxyTarget, pushedSelectors } from "../../lib/pair-inspector.ts";
import { CUSTOM_PAIR_CURVE_ABI, CUSTOM_PAIR_FACTORY_ABI, PAIR_TOKEN_PROBE_RUNTIME } from "../../lib/custom-pairs-artifacts.ts";
import { formatTaxBps } from "../../lib/pair-inspector-text.ts";
import { formatUnitPrice } from "../../lib/market-format.ts";

const E18 = 10n ** 18n;
const SUPPLY = 1_000_000_000n * E18;

test("Launch Shield decay matches the Standard curve table", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 60].map(shieldBpsAt), [9_900, 2_475, 309, 38, 4, 0, 0]);
});

test("buy split: shield first, then each fee on the rest, rounded down", () => {
  const split = splitBuy(E18, 9_900, 50, 50);
  assert.equal(split.shield, (E18 * 9_900n) / 10_000n);
  assert.equal(split.protocolFee, (E18 / 100n) * 50n / 10_000n);
  assert.equal(split.creatorFee, split.protocolFee);
  assert.equal(split.net, E18 - split.shield - split.protocolFee - split.creatorFee);
});

test("curve math: sold(R) = S*R/(a0+R), and a buy then a full sell never profits", () => {
  const target = 30n * E18;
  const a0 = target / 3n;
  const net = 99n * E18 / 100n;
  const tokens = tokensForNet(SUPPLY, a0, 0n, net);
  const exact = (SUPPLY * net) / (a0 + net);
  assert.ok(exact - tokens <= 1n);
  const back = pairForTokens(SUPPLY, a0, net, tokens);
  assert.ok(back <= net);
  assert.ok(net - back < 10n ** 6n);
  // Opening price is a0 / S per base unit, i.e. target / 3 across the whole supply.
  assert.equal(spotPriceX18(SUPPLY, a0, 0n), (a0 * 10n ** 36n) / SUPPLY);
  // At the target the price is 16x the opening price.
  const ratio = Number(spotPriceX18(SUPPLY, a0, target)) / Number(spotPriceX18(SUPPLY, a0, 0n));
  assert.ok(Math.abs(ratio - CUSTOM_PAIR_RULES.priceMultiple) < 1e-9);
});

test("final buy is clamped to the target and the rest refunded, like the contract", () => {
  const target = 30n * E18;
  const quote = previewCurveBuy({
    supply: SUPPLY,
    virtualReserve: target / 3n,
    reserve: 0n,
    target,
    received: 100n * E18,
    shieldBps: 0,
    protocolFeeBps: 50,
    creatorFeeBps: 50,
  });
  assert.ok(quote.completesCurve);
  assert.ok(quote.net >= target && quote.net - target <= 2n);
  assert.equal(quote.used + quote.refund, 100n * E18);
  const expectedSpent = (target * 10_000n) / 9_900n;
  assert.ok(quote.used - expectedSpent <= 3n);
  // 75% of supply is sold when the curve completes.
  const share = Number(quote.tokens) / Number(SUPPLY);
  assert.ok(Math.abs(share - 0.75) < 1e-6);
});

test("a creator first buy is shielded at 99% and stays under the wallet cap below ~69% of target", () => {
  const target = 1_000n * E18;
  const small = firstBuyTokens({ supply: SUPPLY, target, received: 600n * E18, protocolFeeBps: 50, creatorFeeBps: 50 });
  assert.equal(small.shield, (600n * E18 * 9_900n) / 10_000n);
  assert.ok(Number(small.tokens) / Number(SUPPLY) < 0.02);
  const big = firstBuyTokens({ supply: SUPPLY, target, received: 800n * E18, protocolFeeBps: 50, creatorFeeBps: 50 });
  assert.ok(Number(big.tokens) / Number(SUPPLY) > 0.02);
});

test("afterTax and tax formatting", () => {
  assert.equal(afterTax(1_000n, 500), 950n);
  assert.equal(afterTax(1_000n, 0), 1_000n);
  assert.equal(afterTax(1_000n, 20_000), 0n);
  assert.equal(formatTaxBps(0), "0%");
  assert.equal(formatTaxBps(500), "5%");
  assert.equal(formatTaxBps(125), "1.25%");
  assert.equal(formatTaxBps(null), "—");
});

test("tiny unit prices stay readable", () => {
  assert.equal(formatUnitPrice(0.00000012345), "0.0₆1234");
  assert.equal(formatUnitPrice(1.5), "1.5");
  assert.equal(formatUnitPrice(null), "—");
});

test("bytecode selector scan skips push data and finds dispatcher selectors", () => {
  // PUSH4 pause() 0x8456cb59, then a PUSH32 whose data happens to contain paused() 0x5c975abb.
  const code = "0x638456cb5914" + "7f" + "5c975abb".padEnd(64, "0") + "00";
  const selectors = pushedSelectors(code);
  assert.ok(selectors.has("8456cb59"));
  assert.ok(!selectors.has("5c975abb"));
  const controls = controlsInCode([code]);
  assert.equal(controls.pause, true);
  assert.equal(controls.blacklist, false);
  // PUSH3 carries a selector with a leading zero byte.
  assert.ok(pushedSelectors("0x62fdd58e").has("00fdd58e"));
});

test("EIP-1167 minimal proxies are recognised", () => {
  const target = "bebebebebebebebebebebebebebebebebebebebe";
  assert.equal(
    minimalProxyTarget(`0x363d3d373d3d3d363d73${target}5af43d82803e903d91602b57fd5bf3`)?.toLowerCase(),
    "0x" + target
  );
  assert.equal(minimalProxyTarget("0x6080604052"), null);
});

test("custom pairs stay disabled without a factory and can never be enabled on chain 56", () => {
  assert.equal(CUSTOM_PAIRS.factory, null);
  assert.equal(CUSTOM_PAIRS.enabled, false);
  const source = readFileSync(new URL("../../lib/custom-pairs.ts", import.meta.url), "utf8");
  assert.match(source, /enabled: isAddress\(configuredFactory\) && FORTUNE_NETWORK\.chainId !== 56/);
});

test("the pair inspector fails closed when transfer simulation is unavailable", () => {
  const source = readFileSync(new URL("../../lib/pair-inspector.ts", import.meta.url), "utf8");
  assert.match(source, /code: "NO_HOLDER_FOUND", level: "block"/);
  assert.match(source, /code: "SIMULATION_UNAVAILABLE", level: "block"/);
});

test("website constants mirror the Solidity sources", () => {
  const curve = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneCustomPairCurve.sol", import.meta.url), "utf8");
  const factory = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneCustomPairFactory.sol", import.meta.url), "utf8");
  const constant = (source, name) => source.match(new RegExp(`${name} = ([0-9_*]+);`))?.[1].replace(/_/g, "");
  assert.equal(Number(constant(curve, "SNIPE_TAX_START_BPS")), CUSTOM_PAIR_RULES.snipeTaxStartBps);
  assert.equal(Number(constant(curve, "SNIPE_TAX_SECONDS")), CUSTOM_PAIR_RULES.snipeTaxSeconds);
  assert.equal(Number(constant(curve, "EARLY_WALLET_CAP_BPS")), CUSTOM_PAIR_RULES.earlyWalletCapBps);
  assert.equal(Number(constant(curve, "EARLY_WALLET_CAP_SECONDS")), CUSTOM_PAIR_RULES.earlyWalletCapSeconds);
  assert.equal(BigInt(constant(curve, "VIRTUAL_RESERVE_DIVISOR")), CUSTOM_PAIR_RULES.virtualReserveDivisor);
  assert.equal(Number(constant(factory, "MAX_PROTOCOL_FEE_BPS")), CUSTOM_PAIR_RULES.maxProtocolFeeBps);
  assert.equal(Number(constant(factory, "MAX_CREATOR_FEE_BPS")), CUSTOM_PAIR_RULES.maxCreatorFeeBps);
  assert.equal(BigInt(constant(factory, "MIN_GRADUATION_TARGET")), CUSTOM_PAIR_RULES.minTarget);
  assert.match(factory, /MAX_GRADUATION_TARGET = 2 \*\* 100;/);
  assert.match(factory, /MIN_SUPPLY = 1_000_000e18;/);
  assert.match(factory, /MAX_SUPPLY = 1_000_000_000_000e18;/);
});

test("generated artifacts expose the calls the website makes", () => {
  const names = (abi) => new Set(abi.filter((item) => item.type === "function").map((item) => item.name));
  const factory = names(CUSTOM_PAIR_FACTORY_ABI);
  for (const name of ["createLaunch", "createLaunchAndBuy", "preflight", "launchAt", "launchCount", "metadataOf", "curveIndexPlusOne", "protocolFeeBps", "launchesPaused"]) {
    assert.ok(factory.has(name), name);
  }
  const curve = names(CUSTOM_PAIR_CURVE_ABI);
  for (const name of ["buy", "sell", "graduate", "activateRescue", "rescueRedeem", "previewRescueRedeem", "claimCreatorFees", "state"]) {
    assert.ok(curve.has(name), name);
  }
  const params = CUSTOM_PAIR_FACTORY_ABI.find((item) => item.name === "createLaunchAndBuy").inputs[0].components.map((field) => field.name);
  assert.deepEqual(params, ["name", "symbol", "supply", "pairToken", "graduationTarget", "creatorFeeBps", "description", "imageURI", "website", "xProfile", "telegram"]);
  assert.match(PAIR_TOKEN_PROBE_RUNTIME, /^0x[0-9a-f]{200,}$/);
});
