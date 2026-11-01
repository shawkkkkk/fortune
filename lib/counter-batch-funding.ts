import { encodeFunctionData, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { buildCounterAllocation, validateCounterAllocationPolicy, type CounterAllocationPolicy } from "@/lib/counter-allocation";

export const COUNTER_BATCH_FUNDING_ABI = parseAbi([
  "function fundSnapshotBatch((address token,address[] recipients,uint256[] amounts)[] funding,(uint256 expectedRound,uint256 blockNumber,bytes32 blockHash,uint256 deadline) firstSnapshot) returns(uint256[])",
]);
export type CounterBatchFundingPolicy = Omit<CounterAllocationPolicy, "payoutAsset" | "payoutAssetCodeHash" | "payoutBudget"> & {
  payouts: { token: Address; codeHash: Hex; budget: string }[];
};

/** Explicit library-only unsigned review. No signing, allowance, funding or retry. */
export async function buildCounterBatchFunding(clients: readonly [PublicClient, PublicClient], input: CounterBatchFundingPolicy) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== "accounts,chainId,escrow,escrowCodeHash,governor,guardian,launchToken,launchTokenCodeHash,minimumHolding,payouts"
    || !Array.isArray(p.payouts) || p.payouts.length < 2 || p.payouts.length > 10) throw Error("Invalid bounded batch policy");
  const { payouts, ...base } = p;
  // Validate EVERY asset and the common account/role policy before any RPC starts.
  const policies = payouts.map((v, i) => {
    if (!v || Object.keys(v).sort().join() !== "budget,codeHash,token" || (i > 0 && v.token <= payouts[i - 1].token)) throw Error("Sorted distinct payout policies required");
    return validateCounterAllocationPolicy({ ...base, payoutAsset: v.token, payoutAssetCodeHash: v.codeHash, payoutBudget: v.budget });
  });
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const start = Date.now(); let previous = start, ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = () => {
    const now = Date.now();
    if (ended || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < previous || now - start > 20_000) throw Error("Batch observation ended, expired or clock moved backwards");
    previous = now; return now;
  };
  const methods = new Set(["getChainId", "getBlockNumber", "getBlock", "getCode", "readContract"]);
  const readers = clients.map(c => new Proxy(c, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof key !== "string" || !methods.has(key) || typeof value !== "function") return value;
    return async (...args: unknown[]) => { clock(); const result = await value.apply(target, args); clock(); return result; };
  } })) as unknown as readonly [PublicClient, PublicClient];
  try {
    clock();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Batch observation timed out")), 20_000); });
    return await Promise.race([(async () => {
      const rounds = await Promise.all(policies.map(policy => buildCounterAllocation(readers, policy)));
      const first = rounds[0];
      for (const r of rounds) {
        if (r.blockNumber !== first.blockNumber || r.blockHash !== first.blockHash || r.blockTimestamp !== first.blockTimestamp
          || r.expectedNextRound !== first.expectedNextRound || r.totalSupply !== first.totalSupply || r.eligibleUnits !== first.eligibleUnits) throw Error("Batch allocation snapshots disagree");
      }
      const lastRound = BigInt(first.expectedNextRound) + BigInt(rounds.length) - 1n;
      // _fundRound also increments nextRound; leave representable space for it.
      if (lastRound >= (1n << 256n) - 1n) throw Error("Batch round range overflow");
      await Promise.all(readers.map(async c => {
        const b = await c.getBlock({ blockNumber: BigInt(first.blockNumber) });
        if (await c.getChainId() !== 97 || b.number !== BigInt(first.blockNumber) || b.hash !== first.blockHash || b.timestamp !== BigInt(first.blockTimestamp)) throw Error("Batch snapshot changed");
      }));
      const observedAtMs = clock(), age = BigInt(observedAtMs) - BigInt(first.blockTimestamp) * 1000n;
      if (age < 0n || age > 120_000n) throw Error("Stale completed batch snapshot");
      const snapshot = { expectedRound: BigInt(first.expectedNextRound), blockNumber: BigInt(first.blockNumber), blockHash: first.blockHash, deadline: BigInt(first.blockTimestamp) + 120n };
      return { schemaVersion: 1, chainId: 97, escrow: p.escrow, launchToken: p.launchToken,
        fundingMethod: "fundSnapshotBatch", blockNumber: first.blockNumber, blockHash: first.blockHash, blockTimestamp: first.blockTimestamp,
        observedAtMs, expectedFirstRound: first.expectedNextRound, deadline: snapshot.deadline.toString(), roundAndSnapshotBound: true,
        rounds: rounds.map((r, i) => ({ expectedRound: (snapshot.expectedRound + BigInt(i)).toString(), payoutAsset: r.payoutAsset,
          payoutBudget: r.payoutBudget, fundedAmount: r.fundedAmount, unallocatedDust: r.unallocatedDust, allocations: r.allocations })),
        data: encodeFunctionData({ abi: COUNTER_BATCH_FUNDING_ABI, functionName: "fundSnapshotBatch", args: [rounds.map(r => ({ token: r.payoutAsset,
          recipients: r.allocations.map(a => a.recipient), amounts: r.allocations.map(a => BigInt(a.amount)) })), snapshot] }),
        source: "bounded-two-client-rpc-balance-observation", currentAuthorization: null, completeHolderIndexVerified: false,
        independentProvidersVerified: false, holderEligibilityPolicyApproved: false, feeFundingVerified: false,
        capitalOriginVerified: false, finalityVerified: false, executionAuthorized: false, fullCounterReadiness: false };
    })(), timeout]);
  } finally { ended = true; clearTimeout(timer); }
}
