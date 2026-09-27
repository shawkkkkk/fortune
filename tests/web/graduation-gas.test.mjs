import test from "node:test";
import assert from "node:assert/strict";
import { graduationGasLimit } from "../../lib/graduation-gas.ts";

// A one-pool Pancake V3 graduation used 5,734,869 gas on a BSC testnet fork,
// while eth_estimateGas returned 259,666 because the factory catches the
// migration's out-of-gas failure.
const MEASURED_ONE_POOL = 5_734_869n;
const BSC_MAINNET_BLOCK_GAS = 70_000_000n;

test("one pool gets a limit above the measured graduation", () => {
  assert.equal(graduationGasLimit(1), 8_000_000n);
  assert.ok(graduationGasLimit(1) > (MEASURED_ONE_POOL * 13n) / 10n);
});

test("the limit grows with the number of pools and stays within a block", () => {
  for (let pools = 1; pools < 5; pools++) assert.ok(graduationGasLimit(pools + 1) > graduationGasLimit(pools));
  assert.ok(graduationGasLimit(5) < BSC_MAINNET_BLOCK_GAS / 2n);
});

test("out-of-range pool counts are clamped", () => {
  assert.equal(graduationGasLimit(0), graduationGasLimit(1));
  assert.equal(graduationGasLimit(Number.NaN), graduationGasLimit(1));
  assert.equal(graduationGasLimit(9), graduationGasLimit(5));
});
