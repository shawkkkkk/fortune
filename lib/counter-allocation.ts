import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";

export const COUNTER_ALLOCATION_ABI = parseAbi([
  "function governor() view returns(address)", "function guardian() view returns(address)",
  "function launchToken() view returns(address)", "function paused() view returns(bool)",
  "function nextRound() view returns(uint256)", "function assetCodeHash(address) view returns(bytes32)",
  "function excluded(address) view returns(bool)",
  "function fundRound(address,address[],uint256[]) returns(uint256)",
  "function fundSnapshotRound(address,address[],uint256[],(uint256 expectedRound,uint256 blockNumber,bytes32 blockHash,uint256 deadline)) returns(uint256)",
]);
const TOKEN = parseAbi(["function totalSupply() view returns(uint256)", "function balanceOf(address) view returns(uint256)"]);
const UINT = (1n << 256n) - 1n;
const zero = `0x${"0".repeat(40)}`;
const address = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v) && v !== zero;
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v) && !/^0x0{64}$/.test(v);
const units = (v: unknown) => {
  if (typeof v !== "string" || !/^[1-9][0-9]{0,77}$/.test(v) || BigInt(v) > UINT) throw Error("Positive uint256 units required");
  return BigInt(v);
};
const uint = (v: unknown): v is bigint => typeof v === "bigint" && v >= 0n && v <= UINT;
export type CounterAllocationPolicy = {
  chainId: 97; escrow: Address; escrowCodeHash: Hex; governor: Address; guardian: Address;
  launchToken: Address; launchTokenCodeHash: Hex; payoutAsset: Address; payoutAssetCodeHash: Hex;
  accounts: Address[]; minimumHolding: string; payoutBudget: string;
};

/** Read-only bounded allocation builder, not a holder index, signer or fee-funding proof. */
export async function buildCounterAllocation(clients: readonly [PublicClient, PublicClient], input: CounterAllocationPolicy) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== "accounts,chainId,escrow,escrowCodeHash,governor,guardian,launchToken,launchTokenCodeHash,minimumHolding,payoutAsset,payoutAssetCodeHash,payoutBudget"
    || p.chainId !== 97 || ![p.escrow, p.governor, p.guardian, p.launchToken, p.payoutAsset].every(address)
    || p.governor === p.guardian || new Set([p.escrow, p.launchToken, p.payoutAsset]).size !== 3
    || ![p.escrowCodeHash, p.launchTokenCodeHash, p.payoutAssetCodeHash].every(hash)
    || !Array.isArray(p.accounts) || p.accounts.length < 1 || p.accounts.length > 128
    || p.accounts.some((a, i) => !address(a) || (i > 0 && a <= p.accounts[i - 1]))) throw Error("Invalid bounded allocation policy");
  const minimum = units(p.minimumHolding), budget = units(p.payoutBudget);
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const start = Date.now(); let previous = start, finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = () => {
    const now = Date.now();
    if (finished || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < previous || now - start > 20_000) throw Error("Allocation observation ended, expired or clock moved backwards");
    previous = now; return now;
  };
  const methods = new Set(["getChainId", "getBlockNumber", "getBlock", "getCode", "readContract"]);
  const readers = clients.map(c => new Proxy(c, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof key !== "string" || !methods.has(key) || typeof value !== "function") return value;
    return async (...args: unknown[]) => { clock(); const result = await value.apply(target, args); clock(); return result; };
  } }));
  try {
    clock();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Allocation observation timed out")), 20_000); });
    return await Promise.race([(async () => {
      const heads = await Promise.all(readers.map(async c => {
        if (await c.getChainId() !== 97) throw Error("Wrong chain");
        const n = await c.getBlockNumber({ cacheTime: 0 });
        if (!uint(n) || n < 21n || n >= 1n << 64n) throw Error("Invalid head");
        return n;
      }));
      if ((heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error("Head disagreement");
      const blockNumber = (heads[0] < heads[1] ? heads[0] : heads[1]) - 20n;
      const observe = async (c: PublicClient) => {
        const block = await c.getBlock({ blockNumber });
        if (block.number !== blockNumber || !hash(block.hash) || !uint(block.timestamp)) throw Error("Invalid snapshot block");
        const fresh = () => { const age = BigInt(clock()) - block.timestamp * 1000n; if (age < 0n || age > 120_000n) throw Error("Stale allocation snapshot"); };
        fresh();
        for (const [token, expected] of [[p.escrow, p.escrowCodeHash], [p.launchToken, p.launchTokenCodeHash], [p.payoutAsset, p.payoutAssetCodeHash]] as const) {
          const code = await c.getCode({ address: token, blockNumber });
          if (!code || code.length > 262146 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || keccak256(code) !== expected) throw Error("Untrusted allocation runtime");
        }
        const escrowRead = (functionName: "governor" | "guardian" | "launchToken" | "paused" | "nextRound") => c.readContract({ address: p.escrow, abi: COUNTER_ALLOCATION_ABI, functionName, blockNumber });
        if ((await escrowRead("governor") as string)?.toLowerCase() !== p.governor || (await escrowRead("guardian") as string)?.toLowerCase() !== p.guardian
          || (await escrowRead("launchToken") as string)?.toLowerCase() !== p.launchToken || await escrowRead("paused") !== true) throw Error("Escrow configuration or pause mismatch");
        const nextRound = await escrowRead("nextRound");
        if (!uint(nextRound) || nextRound === 0n || await c.readContract({ address: p.escrow, abi: COUNTER_ALLOCATION_ABI, functionName: "assetCodeHash", args: [p.payoutAsset], blockNumber }) !== p.payoutAssetCodeHash) throw Error("Round or payout policy mismatch");
        const supply = await c.readContract({ address: p.launchToken, abi: TOKEN, functionName: "totalSupply", blockNumber });
        if (!uint(supply) || supply === 0n) throw Error("Positive supply required");
        let sum = 0n; const rows = [];
        for (const account of p.accounts) {
          const balance = await c.readContract({ address: p.launchToken, abi: TOKEN, functionName: "balanceOf", args: [account], blockNumber });
          const excluded = await c.readContract({ address: p.escrow, abi: COUNTER_ALLOCATION_ABI, functionName: "excluded", args: [account], blockNumber });
          if (!uint(balance) || typeof excluded !== "boolean") throw Error("Malformed allocation balance or exclusion");
          sum += balance; if (sum > supply) throw Error("Balances exceed supply");
          rows.push({ account, balance: balance.toString(), excluded });
        }
        if (sum !== supply) throw Error("Supplied balances do not cover total supply");
        const after = await c.getBlock({ blockNumber });
        if (await c.getChainId() !== 97 || after.number !== block.number || after.hash !== block.hash || after.timestamp !== block.timestamp) throw Error("Snapshot changed");
        fresh(); return { blockHash: block.hash, timestamp: block.timestamp.toString(), nextRound: nextRound.toString(), supply: supply.toString(), rows };
      };
      const observations = await Promise.all(readers.map(observe));
      if (JSON.stringify(observations[0]) !== JSON.stringify(observations[1])) throw Error("Allocation providers disagree");
      const observedAtMs = clock(), observation = observations[0];
      if (BigInt(observedAtMs) - BigInt(observation.timestamp) * 1000n > 120_000n) throw Error("Stale completed allocation snapshot");
      const eligible = observation.rows.filter(r => !r.excluded && BigInt(r.balance) >= minimum);
      const eligibleUnits = eligible.reduce((sum, r) => sum + BigInt(r.balance), 0n);
      if (eligibleUnits === 0n) throw Error("No eligible balance");
      const allocations = eligible.map(r => ({ recipient: r.account, amount: (budget * BigInt(r.balance) / eligibleUnits).toString() })).filter(r => r.amount !== "0");
      const fundedAmount = allocations.reduce((sum, r) => sum + BigInt(r.amount), 0n);
      if (fundedAmount === 0n) throw Error("Payout rounds to zero");
      return { schemaVersion: 1, chainId: 97, escrow: p.escrow, payoutAsset: p.payoutAsset, launchToken: p.launchToken,
        blockNumber: blockNumber.toString(), blockHash: observation.blockHash, blockTimestamp: observation.timestamp, observedAtMs, expectedNextRound: observation.nextRound,
        totalSupply: observation.supply, eligibleUnits: eligibleUnits.toString(), minimumHolding: p.minimumHolding,
        payoutBudget: p.payoutBudget, fundedAmount: fundedAmount.toString(), unallocatedDust: (budget - fundedAmount).toString(), allocations,
        data: encodeFunctionData({ abi: COUNTER_ALLOCATION_ABI, functionName: "fundRound", args: [p.payoutAsset, allocations.map(r => r.recipient), allocations.map(r => BigInt(r.amount))] }),
        source: "bounded-two-client-rpc-balance-observation", completeHolderIndexVerified: false, independentProvidersVerified: false,
        holderEligibilityPolicyApproved: false, feeFundingVerified: false, executionAuthorized: false, fullCounterReadiness: false,
      };
    })(), timeout]);
  } finally { finished = true; clearTimeout(timer); }
}

/** Optional binding for newly compiled escrows; preserves the legacy allocation builder. */
export async function buildCounterSnapshotFunding(clients: readonly [PublicClient, PublicClient], input: CounterAllocationPolicy) {
  const allocation = await buildCounterAllocation(clients, input);
  // Fixed expiry follows the observed block, never a later retry or client clock refresh.
  const snapshot = { expectedRound: BigInt(allocation.expectedNextRound), blockNumber: BigInt(allocation.blockNumber),
    blockHash: allocation.blockHash, deadline: BigInt(allocation.blockTimestamp) + 120n };
  return { ...allocation, schemaVersion: 2, fundingMethod: "fundSnapshotRound", deadline: snapshot.deadline.toString(),
    roundAndSnapshotBound: true, data: encodeFunctionData({ abi: COUNTER_ALLOCATION_ABI, functionName: "fundSnapshotRound",
      args: [allocation.payoutAsset, allocation.allocations.map(r => r.recipient), allocation.allocations.map(r => BigInt(r.amount)), snapshot] }) };
}
