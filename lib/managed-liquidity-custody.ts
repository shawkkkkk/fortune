import { keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { inspectLiquidityPosition, validateLiquidityPositionPolicy, type LPReadPolicy } from "@/lib/managed-liquidity-position";

export type LPCustodyPolicy = Omit<LPReadPolicy,"owner"> & {
  custody: {address:Address;codeHash:Hex}; governor:Address; guardian:Address; treasury:Address;
  tickLower:number; tickUpper:number; expectedLiquidity:string;
};
export const LP_CUSTODY_READ_ABI = parseAbi([
  "function governor() view returns(address)", "function guardian() view returns(address)", "function treasury() view returns(address)",
  "function paused() view returns(bool)", "function held() view returns(bool)", "function released() view returns(bool)",
  "function policy() view returns (((address target, bytes32 codeHash) manager, (address target, bytes32 codeHash) factory, (address target, bytes32 codeHash) pool, (address target, bytes32 codeHash) token0, (address target, bytes32 codeHash) token1, uint256 positionId, uint24 fee, int24 tickLower, int24 tickUpper, uint128 expectedLiquidity) p)",
]);
const zero="0x"+"0".repeat(40);
const address=(v:unknown):v is Address=>typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v)&&v.toLowerCase()!==zero;
const hash=(v:unknown):v is Hex=>typeof v==="string"&&/^0x[0-9a-fA-F]{64}$/.test(v)&&!/^0x0{64}$/i.test(v);
const same=(a:unknown,b:string)=>typeof a==="string"&&a.toLowerCase()===b.toLowerCase();
const keys=(v:unknown,expected:string[])=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join()===expected.sort().join();
function validate(p:LPCustodyPolicy){
  if(!keys(p,["chainId","manager","factory","pool","token0","token1","fee","positionId","custody","governor","guardian","treasury","tickLower","tickUpper","expectedLiquidity"]))throw Error("Exact custody policy required");
  for(const pin of [p.custody,p.manager,p.factory,p.pool,p.token0,p.token1])if(!keys(pin,["address","codeHash"])||!address(pin.address)||!hash(pin.codeHash))throw Error("Pinned custody policy required");
  const targets=[p.custody,p.manager,p.factory,p.pool,p.token0,p.token1].map(v=>v.address.toLowerCase());
  if(new Set(targets).size!==6||![p.governor,p.guardian,p.treasury].every(v=>address(v)&&!targets.includes(v.toLowerCase()))||same(p.governor,p.guardian)
    ||!Number.isInteger(p.tickLower)||!Number.isInteger(p.tickUpper)||p.tickLower< -887272||p.tickUpper>887272||p.tickLower>=p.tickUpper
    ||typeof p.expectedLiquidity!=="string"||!/^[1-9][0-9]{0,38}$/.test(p.expectedLiquidity)||BigInt(p.expectedLiquidity)>=1n<<128n)throw Error("Invalid custody policy");
  validateLiquidityPositionPolicy({...p,owner:p.custody.address});
}

/** Historical held-state observation under supplied pins; never a custody or execution approval. */
export async function inspectLiquidityCustody(clients:readonly [PublicClient,PublicClient], policy:LPCustodyPolicy){
  const p=structuredClone(policy);validate(p);
  if(clients.length!==2||clients[0]===clients[1])throw Error("Two distinct read clients required");
  const start=Date.now();let last=start,finished=false,timer:ReturnType<typeof setTimeout>|undefined;
  const time=()=>{const now=Date.now();if(finished||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>30_000)throw Error("Custody observation expired or clock moved backward");last=now;return now;};
  const guarded=clients.map(c=>new Proxy(c,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);
    if(!["getBlockNumber","getChainId","getBlock","getCode","readContract"].includes(String(key)))return value;
    return async(...args:unknown[])=>{time();const r=await Reflect.apply(value,target,args);time();return r;};}})) as unknown as readonly [PublicClient,PublicClient];
  const work=async()=>{
    // The existing reader selects the common twenty-confirmed height and checks
    // the actual manager, canonical route, NFT fields, owner and token approval.
    const position=await inspectLiquidityPosition(guarded,{...p,owner:p.custody.address});
    if(position.approved!==zero||position.tickLower!==p.tickLower||position.tickUpper!==p.tickUpper||position.liquidityUnits!==p.expectedLiquidity)throw Error("Held position differs");
    const blockNumber=BigInt(position.blockNumber);
    const header=async(c:PublicClient)=>{if(await c.getChainId()!==97)throw Error("Testnet only");const b=await c.getBlock({blockNumber});
      if(b.number!==blockNumber||typeof b.timestamp!=="bigint"||b.timestamp.toString()!==position.blockTimestamp||!same(b.hash,position.blockHash))throw Error("Custody snapshot changed");};
    const observations=await Promise.all(guarded.map(async c=>{
      await header(c);
      const code=await c.getCode({address:p.custody.address,blockNumber});
      if(!code||!/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code)||!same(keccak256(code),p.custody.codeHash))throw Error("Custody runtime differs");
      const read=(functionName:string)=>c.readContract({address:p.custody.address,abi:LP_CUSTODY_READ_ABI,functionName,blockNumber} as never) as Promise<unknown>;
      const [governor,guardian,treasury,paused,held,released,raw]=await Promise.all(["governor","guardian","treasury","paused","held","released","policy"].map(read));
      const v=raw as Record<string,unknown>;
      if(!same(governor,p.governor)||!same(guardian,p.guardian)||!same(treasury,p.treasury)||typeof paused!=="boolean"||held!==true||released!==false||!v||typeof v!=="object")throw Error("Custody identity or held state differs");
      for(const name of ["manager","factory","pool","token0","token1"] as const){const pin=v[name] as Record<string,unknown>;if(!pin||!same(pin.target,p[name].address)||!same(pin.codeHash,p[name].codeHash))throw Error("Custody route policy differs");}
      if(v.positionId!==BigInt(p.positionId)||v.fee!==p.fee||v.tickLower!==p.tickLower||v.tickUpper!==p.tickUpper||v.expectedLiquidity!==BigInt(p.expectedLiquidity))throw Error("Custody position policy differs");
      await header(c);return {paused};
    }));
    if(JSON.stringify(observations[0])!==JSON.stringify(observations[1]))throw Error("Custody providers disagree");
    return Object.freeze({chainId:97,custody:p.custody.address.toLowerCase(),governor:p.governor.toLowerCase(),guardian:p.guardian.toLowerCase(),treasury:p.treasury.toLowerCase(),
      held:true,released:false,paused:observations[0].paused,position,observedAtMs:time(),currentAuthorization:null,
      projectConsentVerified:false,capitalOriginVerified:false,independentProvidersVerified:false,finalityVerified:false,executionAuthorized:false,fullManagedLiquidityReadiness:false});
  };
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{finished=true;reject(Error("Custody observation timed out"));},30_000);})]);}
  finally{finished=true;clearTimeout(timer);}
}
