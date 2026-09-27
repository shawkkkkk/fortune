// Gas for FortuneFactory.finalizeGraduation.
//
// The factory runs the PancakeSwap migration inside try/catch so that a failed
// graduation stays retryable. A wallet's gas estimate therefore settles on the
// smallest limit at which the transaction does not revert, which is a limit at
// which the migration runs out of gas, is caught, and nothing graduates: on a
// BSC testnet fork eth_estimateGas returned 259,666 while a real one-pool
// Pancake V3 graduation used 5,734,869. Callers simulate with this limit and
// send exactly this limit instead of trusting the estimate. Unused gas is not
// charged.

const BASE_GAS = 2_000_000n;
const GAS_PER_POOL = 6_000_000n;
const MAX_POOLS = 5;

export function graduationGasLimit(pools: number) {
  const count = Math.min(MAX_POOLS, Math.max(1, Math.floor(pools) || 1));
  return BASE_GAS + GAS_PER_POOL * BigInt(count);
}
