/** Exact research accounting. Does not replace any deployed engine's economics. */
export type FeeBucket = "creator" | "holders" | "operations" | "protocol" | "burn";
export type FeeAllocation = { bucket: FeeBucket; bps: number };
const buckets = new Set<FeeBucket>(["creator", "holders", "operations", "protocol", "burn"]);
const MAX = (1n << 256n) - 1n;

export function allocateReceivedFees(amount: bigint, assetSide: "pair" | "launch-token", allocations: readonly FeeAllocation[]) {
  if (typeof amount !== "bigint" || amount < 0n || amount > MAX) throw new Error("Invalid received amount");
  if (assetSide !== "pair" && assetSide !== "launch-token") throw new Error("Unknown fee asset side");
  if (!Array.isArray(allocations) || !allocations.length || allocations.length > 5) throw new Error("Invalid allocation count");
  const seen = new Set<FeeBucket>();
  let total = 0;
  for (const a of allocations) {
    if (!a || !buckets.has(a.bucket) || seen.has(a.bucket) || !Number.isInteger(a.bps) || a.bps <= 0 || a.bps > 10_000) throw new Error("Invalid fee allocation");
    seen.add(a.bucket);
    total += a.bps;
  }
  if (total !== 10_000) throw new Error("Received-fee allocations must total 10000 bps");
  if (assetSide === "launch-token" && (allocations.length !== 1 || allocations[0].bucket !== "burn")) throw new Error("Launch-token fees must only burn");
  const amounts = allocations.map(a => ({ bucket: a.bucket, amount: amount * BigInt(a.bps) / 10_000n }));
  // Keep dust explicitly unallocated; never silently give a liability's dust to revenue.
  return { amounts, roundingRemainder: amount - amounts.reduce((sum, a) => sum + a.amount, 0n) };
}

export function protocolRecirculation(earnedProtocol: bigint, bps: number) {
  if (typeof earnedProtocol !== "bigint" || earnedProtocol < 0n || earnedProtocol > MAX || !Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("Invalid protocol recirculation");
  const recirculate = earnedProtocol * BigInt(bps) / 10_000n;
  return { recirculate, retainedProtocol: earnedProtocol - recirculate };
}
