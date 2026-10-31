import { keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";

export const LP_MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
export const LP_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
export const LP_READ_ABI = parseAbi([
  "function positions(uint256) view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function ownerOf(uint256) view returns(address)", "function getApproved(uint256) view returns(address)",
  "function factory() view returns(address)", "function getPool(address,address,uint24) view returns(address)",
  "function token0() view returns(address)", "function token1() view returns(address)",
  "function fee() view returns(uint24)", "function tickSpacing() view returns(int24)",
]);
type Pin = { address: Address; codeHash: Hex };
export type LPReadPolicy = { chainId: 97; manager: Pin; factory: Pin; pool: Pin; token0: Pin; token1: Pin; fee: number; positionId: string; owner: Address };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const address = (a: unknown): a is Address => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a);
const hash = (h: unknown): h is Hex => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h) && !/^0x0{64}$/i.test(h);
function uint(value: unknown, bits: number) { if (typeof value !== "bigint" || value < 0n || value >= 1n << BigInt(bits)) throw Error("Invalid position integer"); return value.toString(); }
function validate(p: LPReadPolicy) {
  if (!p || p.chainId !== 97 || !address(p.owner) || !/^[1-9][0-9]{0,77}$/.test(p.positionId) || BigInt(p.positionId) >= 1n << 256n
    || !Number.isInteger(p.fee) || p.fee <= 0 || p.fee >= 1_000_000) throw Error("Reviewed testnet LP policy required");
  const pins = [p.manager, p.factory, p.pool, p.token0, p.token1];
  if (pins.some(v => !v || !address(v.address) || !hash(v.codeHash)) || new Set(pins.map(v => v.address.toLowerCase())).size !== 5
    || !same(p.manager.address, LP_MANAGER) || !same(p.factory.address, LP_FACTORY) || p.token0.address.toLowerCase() >= p.token1.address.toLowerCase()) throw Error("Pinned canonical venue policy required");
}
async function observe(c: PublicClient, p: LPReadPolicy, blockNumber: bigint) {
  if (await c.getChainId() !== 97) throw Error("Testnet only");
  const block = await c.getBlock({ blockNumber });
  if (block.number !== blockNumber || !hash(block.hash)) throw Error("Block unavailable");
  await Promise.all([p.manager,p.factory,p.pool,p.token0,p.token1].map(async pin => {
    const code = await c.getCode({ address: pin.address, blockNumber });
    if (!code || code === "0x" || !same(keccak256(code), pin.codeHash)) throw Error("Pinned runtime differs");
  }));
  const read = (a: Address, functionName: string, args: readonly unknown[] = []) => c.readContract({address:a,abi:LP_READ_ABI,functionName,args,blockNumber} as never) as Promise<unknown>;
  const [position, owner, approved, managerFactory, poolFactory, pool0, pool1, fee, spacing, canonical] = await Promise.all([
    read(p.manager.address,"positions",[BigInt(p.positionId)]),read(p.manager.address,"ownerOf",[BigInt(p.positionId)]),read(p.manager.address,"getApproved",[BigInt(p.positionId)]),
    read(p.manager.address,"factory"),read(p.pool.address,"factory"),read(p.pool.address,"token0"),read(p.pool.address,"token1"),read(p.pool.address,"fee"),read(p.pool.address,"tickSpacing"),
    read(p.factory.address,"getPool",[p.token0.address,p.token1.address,p.fee]),
  ]);
  const v = position as readonly unknown[];
  if (!Array.isArray(v) || v.length !== 12 || typeof owner !== "string" || !same(owner,p.owner) || typeof approved !== "string"
    || !/^0x[0-9a-fA-F]{40}$/.test(approved) || typeof v[1] !== "string" || !same(v[1],approved)
    || ![managerFactory,poolFactory].every(x=>typeof x === "string" && same(x,p.factory.address))
    || typeof canonical !== "string" || !same(canonical,p.pool.address)
    || typeof pool0 !== "string" || !same(pool0,p.token0.address) || typeof pool1 !== "string" || !same(pool1,p.token1.address)
    || typeof v[2] !== "string" || !same(v[2],p.token0.address) || typeof v[3] !== "string" || !same(v[3],p.token1.address)
    || v[4] !== p.fee || fee !== p.fee || typeof spacing !== "number" || !Number.isInteger(spacing) || spacing <= 0
    || typeof v[5] !== "number" || typeof v[6] !== "number" || !Number.isInteger(v[5]) || !Number.isInteger(v[6])
    || v[5] < -887272 || v[6] > 887272 || v[5] >= v[6] || v[5] % spacing !== 0 || v[6] % spacing !== 0) throw Error("Position identity or custody differs");
  const result = { chainId:97, blockNumber:blockNumber.toString(),blockHash:block.hash.toLowerCase(),positionId:p.positionId,
    manager:p.manager.address.toLowerCase(),pool:p.pool.address.toLowerCase(),owner:owner.toLowerCase(),approved:approved.toLowerCase(),
    token0:p.token0.address.toLowerCase(),token1:p.token1.address.toLowerCase(),fee:p.fee,tickLower:v[5],tickUpper:v[6],
    permitNonce:uint(v[0],96),liquidityUnits:uint(v[7],128),feeGrowthInside0LastX128:uint(v[8],256),feeGrowthInside1LastX128:uint(v[9],256),
    lastComputedOwed0:uint(v[10],128),lastComputedOwed1:uint(v[11],128),
    globalOperatorApprovalsEnumerated:false,claimableFees:null,totalValue:null,executionAuthorized:false,readinessAttested:false };
  if (!same((await c.getBlock({blockNumber})).hash || "",block.hash) || await c.getChainId() !== 97) throw Error("Snapshot changed");
  return result;
}
/** Point-in-time trusted RPC observation, not a proof, settlement or custody approval. */
export async function inspectLiquidityPosition(clients: readonly [PublicClient,PublicClient], policy: LPReadPolicy) {
  const p=structuredClone(policy);validate(p);
  if (clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const start=Date.now();let last=start,finished=false,timer:ReturnType<typeof setTimeout>|undefined;
  const time=()=>{
    const now=Date.now();
    if(finished || now<last || now-start>30_000)throw Error("LP read expired or clock moved backward");
    last=now;return now;
  };
  // Preserve the original method receiver. Bound each awaited action, including
  // late results from a client whose peer already failed. No transport is replaced.
  const guarded=clients.map(c=>new Proxy(c,{
    get(target,key,receiver){
      const value=Reflect.get(target,key,receiver);
      if(!["getBlockNumber","getChainId","getBlock","getCode","readContract"].includes(String(key)))return value;
      return async(...args:unknown[])=>{time();const result=await Reflect.apply(value,target,args);time();return result;};
    },
  }));
  const work=async()=>{
    const heads=await Promise.all(guarded.map(c=>c.getBlockNumber({cacheTime:0})));
    if (heads.some(h=>typeof h !== "bigint" || h < 20n)) throw Error("Confirmed snapshot unavailable");
    const block=(heads[0]<heads[1]?heads[0]:heads[1])-20n;
    const results=await Promise.all(guarded.map(c=>observe(c,p,block)));
    if (JSON.stringify(results[0])!==JSON.stringify(results[1])) throw Error("Position providers disagree or read expired");
    return Object.freeze({...results[0],observedAtMs:time()});
  };
  try{
    return await Promise.race([work(),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{finished=true;reject(Error("LP observation timed out"));},30_000);
    })]);
  }finally{finished=true;clearTimeout(timer);}
}

// Reuse the exact engine policy checks for offline operator-adapter preflight.
export { validate as validateLiquidityPositionPolicy };
