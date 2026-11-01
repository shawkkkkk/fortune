import { keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";

export const WORK_ESCROW_READ_ABI = parseAbi([
  "function governor() view returns(address)", "function guardian() view returns(address)",
  "function arbitrator() view returns(address)", "function paused() view returns(bool)",
  "function nextJob() view returns(uint256)", "function assetCodeHash(address) view returns(bytes32)",
  "function maxPerJob(address) view returns(uint128)", "function reserved(address) view returns(uint256)",
  "function jobs(uint256) view returns(address client,address worker,address asset,uint128 amount,uint64 acceptBy,uint64 deliverBy,bytes32 termsHash,uint8 state)",
  "function latestResultRevision(uint256) view returns(uint256)",
  "function disputedResultRevision(uint256) view returns(uint256)",
  "function resultHashes(uint256,uint256) view returns(bytes32)",
]);
const TOKEN = parseAbi(["function balanceOf(address) view returns(uint256)"]);
const address = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v) && !/^0x0{40}$/.test(v);
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v) && !/^0x0{64}$/.test(v);
const uint = (v: unknown, bits = 256): v is bigint => typeof v === "bigint" && v >= 0n && v < 1n << BigInt(bits);
const positive = (v: unknown, bits: number) => typeof v === "string" && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v) < 1n << BigInt(bits);
const lower = (v: unknown) => typeof v === "string" ? v.toLowerCase() : "";

export type WorkJobPolicy = {
  chainId: 97; escrow: Address; escrowCodeHash: Hex;
  governor: Address; guardian: Address; arbitrator: Address;
  jobId: string; client: Address; worker: Address; termsHash: Hex; amount: string;
  asset: Address; assetCodeHash: Hex; maxPerJob: string;
};

/** Explicit read-only API. Storage observation is not settlement-receipt or work-delivery evidence. */
export async function inspectWorkEscrowJob(clients: readonly [PublicClient, PublicClient], input: WorkJobPolicy) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== "amount,arbitrator,asset,assetCodeHash,chainId,client,escrow,escrowCodeHash,governor,guardian,jobId,maxPerJob,termsHash,worker"
    || p.chainId !== 97 || ![p.escrow,p.asset,p.governor,p.guardian,p.arbitrator,p.client,p.worker].every(address)
    || new Set([p.escrow,p.asset,p.governor,p.guardian,p.arbitrator]).size !== 5
    || p.client === p.worker || [p.escrow,p.arbitrator].includes(p.client) || [p.escrow,p.arbitrator].includes(p.worker)
    || ![p.escrowCodeHash,p.assetCodeHash,p.termsHash].every(hash) || !positive(p.jobId,256)
    || !positive(p.amount,128) || !positive(p.maxPerJob,128) || BigInt(p.amount) > BigInt(p.maxPerJob)) throw Error("Invalid bounded work-job policy");
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const start = Date.now(); let previous = start, finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = () => {
    const now = Date.now();
    if (finished || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < previous || now - start > 20_000) throw Error("Work observation ended, expired or clock moved backwards");
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
    return await Promise.race([(async () => {
      const heads = await Promise.all(readers.map(async c => {
        if (await c.getChainId() !== 97) throw Error("Wrong chain");
        const n = await c.getBlockNumber({ cacheTime: 0 });
        if (!uint(n,64) || n < 21n) throw Error("Invalid head"); return n;
      }));
      if ((heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error("Head disagreement");
      const blockNumber = (heads[0] < heads[1] ? heads[0] : heads[1]) - 20n;
      const observe = async (c: PublicClient) => {
        const block = await c.getBlock({ blockNumber });
        if (block.number !== blockNumber || !hash(block.hash) || !uint(block.timestamp)) throw Error("Invalid snapshot block");
        const fresh = () => { const age = BigInt(clock()) - block.timestamp * 1000n; if (age < 0n || age > 120_000n) throw Error("Stale work snapshot"); };
        fresh();
        for (const [token,expected] of [[p.escrow,p.escrowCodeHash],[p.asset,p.assetCodeHash]] as [Address,Hex][]) {
          const code = await c.getCode({ address:token,blockNumber });
          if (!code || code.length > 262146 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || keccak256(code) !== expected) throw Error("Untrusted work runtime");
        }
        const read = (functionName: string, args: readonly unknown[] = []) => c.readContract({ address:p.escrow,abi:WORK_ESCROW_READ_ABI,functionName,args,blockNumber } as never) as Promise<unknown>;
        const [gov,guard,arb,paused,next,raw,latest,disputed,pin,cap,reserved,balance] = await Promise.all([
          read("governor"),read("guardian"),read("arbitrator"),read("paused"),read("nextJob"),read("jobs",[BigInt(p.jobId)]),
          read("latestResultRevision",[BigInt(p.jobId)]),read("disputedResultRevision",[BigInt(p.jobId)]),read("assetCodeHash",[p.asset]),read("maxPerJob",[p.asset]),read("reserved",[p.asset]),
          c.readContract({ address:p.asset,abi:TOKEN,functionName:"balanceOf",args:[p.escrow],blockNumber }),
        ]);
        if (lower(gov) !== p.governor || lower(guard) !== p.guardian || lower(arb) !== p.arbitrator || typeof paused !== "boolean"
          || !uint(next) || next <= BigInt(p.jobId) || pin !== p.assetCodeHash || cap !== BigInt(p.maxPerJob)) throw Error("Work identity or asset policy differs");
        if (!Array.isArray(raw) || raw.length !== 8) throw Error("Invalid job tuple");
        const [client,worker,asset,amount,acceptBy,deliverBy,termsHash,state] = raw;
        if (lower(client) !== p.client || lower(worker) !== p.worker || lower(asset) !== p.asset || amount !== BigInt(p.amount) || termsHash !== p.termsHash
          || !uint(acceptBy,64) || acceptBy === 0n || !uint(deliverBy,64) || deliverBy <= acceptBy
          || !Number.isInteger(state) || state < 1 || state > 4) throw Error("Job missing or terms differ");
        if (!uint(latest) || latest > 32n || !uint(disputed) || disputed > latest || (disputed !== 0n && disputed !== latest)
          || (state === 1 && latest !== 0n) || (state < 3 && disputed !== 0n)) throw Error("Invalid result revisions");
        const results: { revision: number; resultHash: Hex }[] = [];
        for (let revision = 1; revision <= Number(latest); revision++) {
          const resultHash = await read("resultHashes",[BigInt(p.jobId),BigInt(revision)]);
          if (!hash(resultHash) || results.at(-1)?.resultHash === resultHash) throw Error("Invalid result history");
          results.push({ revision,resultHash });
        }
        const outstanding = state === 4 ? 0n : amount;
        if (!uint(reserved) || reserved < outstanding || !uint(balance) || balance < reserved) throw Error("Reported job backing insufficient");
        const after = await c.getBlock({ blockNumber });
        if (await c.getChainId() !== 97 || after.number !== block.number || after.hash !== block.hash || after.timestamp !== block.timestamp) throw Error("Snapshot changed");
        fresh();
        return { blockHash:block.hash,blockTimestamp:block.timestamp.toString(),paused,nextJob:next.toString(),
          job:{ id:p.jobId,client:p.client,worker:p.worker,asset:p.asset,amount:p.amount,termsHash:p.termsHash,acceptBy:acceptBy.toString(),deliverBy:deliverBy.toString(),state:["Missing","Funded","Accepted","Disputed","Settled"][state] },
          results,disputedResultRevision:disputed.toString(),backing:{ selectedOutstanding:outstanding.toString(),reserved:reserved.toString(),reportedBalance:balance.toString(),maxPerJob:p.maxPerJob } };
      };
      const observations = await Promise.all(readers.map(observe));
      if (JSON.stringify(observations[0]) !== JSON.stringify(observations[1])) throw Error("Work providers disagree");
      const observedAtMs = clock(), observation = observations[0];
      if (BigInt(observedAtMs) - BigInt(observation.blockTimestamp) * 1000n > 120_000n) throw Error("Stale completed work snapshot");
      return { schemaVersion:1,chainId:97,escrow:p.escrow,escrowCodeHash:p.escrowCodeHash,assetCodeHash:p.assetCodeHash,governor:p.governor,guardian:p.guardian,arbitrator:p.arbitrator,blockNumber:blockNumber.toString(),...observation,observedAtMs,
        source:"bounded-two-client-work-job-observation",workerPaid:null,clientRefund:null,settlementTransaction:null,currentAuthorization:null,
        settlementReceiptVerified:false,workDeliveryVerified:false,partyIdentityVerified:false,disputeFairnessVerified:false,capitalOriginVerified:false,
        independentProvidersVerified:false,finalityVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false };
    })(),new Promise<never>((_,reject) => { timer = setTimeout(() => reject(Error("Work observation timed out")),20_000); })]);
  } finally { finished = true; clearTimeout(timer); }
}
