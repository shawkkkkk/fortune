import {encodeFunctionData,keccak256,parseAbi,type Hex,type PublicClient} from 'viem';
import {LP_CUSTODY_READ_ABI,validateLiquidityCustodyPolicy,type LPCustodyPolicy} from '@/lib/managed-liquidity-custody';
import {observeLiquidityPositionAtBlock} from '@/lib/managed-liquidity-position';

const RELEASE_ABI=parseAbi(['function releaseToTreasury()']);
const signature=(s:string)=>keccak256(new TextEncoder().encode(s));
const APPROVAL=signature('Approval(address,address,uint256)'),TRANSFER=signature('Transfer(address,address,uint256)'),RELEASED=signature('PositionReleased(uint256,address)');
const zero='0x'+'0'.repeat(40),word=(s:string)=>'0x'+BigInt(s).toString(16).padStart(64,'0'),topic=(s:string)=>'0x'+'0'.repeat(24)+s.slice(2).toLowerCase();
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v)&&!/^0x0{64}$/i.test(v);
const uint=(v:unknown,bits:number):v is bigint=>typeof v==='bigint'&&v>=0n&&v<1n<<BigInt(bits);
const json=(v:unknown)=>JSON.stringify(v);

/** Historical direct release only. Stable evidence ID needs downstream deduplication. */
export async function inspectLiquidityCustodyReleaseReceipt(clients:readonly [PublicClient,PublicClient],input:{policy:LPCustodyPolicy;transactionHash:Hex}){
 const copy=structuredClone(input);
 if(!copy||Object.keys(copy).sort().join()!=='policy,transactionHash'||!hash(copy.transactionHash))throw Error('Exact release input required');
 const p=copy.policy;validateLiquidityCustodyPolicy(p);
 if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Two distinct read clients required');
 const transactionHash=copy.transactionHash.toLowerCase() as Hex,data=encodeFunctionData({abi:RELEASE_ABI,functionName:'releaseToTreasury'});
 const start=Date.now();let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
 const time=()=>{const now=Date.now();if(ended||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>30_000)throw Error('Release read expired or clock moved backwards');last=now;return now;};
 const guarded=clients.map(c=>new Proxy(c,{get(target,key){const value=Reflect.get(target,key,target);if(!['getChainId','getBlockNumber','getBlock','getCode','getTransaction','getTransactionReceipt','readContract'].includes(String(key))||typeof value!=='function')return value;return async(...args:unknown[])=>{time();const result=await Reflect.apply(value,target,args);time();return result;};}})) as unknown as readonly [PublicClient,PublicClient];
 const observe=async(c:PublicClient,head:bigint)=>{
  if(await c.getChainId()!==97)throw Error('Release chain differs');
  const receipt=()=>c.getTransactionReceipt({hash:transactionHash}),r=await receipt();
  const normalize=(v:typeof r)=>{
   if(!same(v.transactionHash,transactionHash)||v.status!=='success'||!uint(v.blockNumber,64)||v.blockNumber===0n||head<v.blockNumber+20n||!hash(v.blockHash)||!same(v.from,p.governor)||!same(v.to,p.custody.address)||!Number.isSafeInteger(v.transactionIndex)||v.transactionIndex<0||!Array.isArray(v.logs)||v.logs.length!==3)throw Error('Direct confirmed release receipt required');
   const expected=[{address:p.manager.address,topics:[APPROVAL,topic(p.custody.address),topic(zero),word(p.positionId)]},{address:p.manager.address,topics:[TRANSFER,topic(p.custody.address),topic(p.treasury),word(p.positionId)]},{address:p.custody.address,topics:[RELEASED,word(p.positionId),topic(p.treasury)]}];
   for(const [i,l]of v.logs.entries()){
    const e=expected[i];if(!same(l.transactionHash,transactionHash)||!same(l.blockHash,v.blockHash)||l.blockNumber!==v.blockNumber||l.transactionIndex!==v.transactionIndex||l.removed!==false||!same(l.address,e.address)||l.data!=='0x'||!Array.isArray(l.topics)||l.topics.length!==e.topics.length||l.topics.some((t,j)=>!same(t,e.topics[j]))||!Number.isSafeInteger(l.logIndex)||l.logIndex<0||l.logIndex>99999999||(i&&l.logIndex!==v.logs[i-1].logIndex+1))throw Error('Canonical release log binding differs');
   }
   return [transactionHash,v.status,v.blockNumber.toString(),v.blockHash.toLowerCase(),v.transactionIndex,v.from.toLowerCase(),v.to?.toLowerCase(),v.logs.map(l=>[l.address.toLowerCase(),l.logIndex,l.topics.map(t=>t.toLowerCase()),l.data])];
  };
  const original=normalize(r),block=()=>c.getBlock({blockNumber:r.blockNumber}),b=await block();
  if(b.number!==r.blockNumber||!same(b.hash,r.blockHash)||!uint(b.timestamp,256)||b.timestamp*1000n>BigInt(time())||!Array.isArray(b.transactions)||!same(b.transactions[r.transactionIndex],transactionHash))throw Error('Release block differs');
  const tx=await c.getTransaction({hash:transactionHash});
  if(!same(tx.hash,transactionHash)||tx.blockNumber!==r.blockNumber||!same(tx.blockHash,r.blockHash)||tx.transactionIndex!==r.transactionIndex||tx.chainId!==97||!same(tx.from,p.governor)||!same(tx.to,p.custody.address)||tx.value!==0n||!same(tx.input,data))throw Error('Direct governor release transaction differs');
  // Reuse the actual position engine at the RECEIPT height; never fabricate heads.
  const position=await observeLiquidityPositionAtBlock(c,{...p,owner:p.treasury},r.blockNumber);
  if(!same(position.blockHash,r.blockHash)||position.blockTimestamp!==b.timestamp.toString()||position.approved!==zero||position.tickLower!==p.tickLower||position.tickUpper!==p.tickUpper||position.liquidityUnits!==p.expectedLiquidity)throw Error('Released position differs');
  const code=await c.getCode({address:p.custody.address,blockNumber:r.blockNumber});
  if(!code||!/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code)||!same(keccak256(code),p.custody.codeHash))throw Error('Custody runtime differs');
  const read=(functionName:string)=>c.readContract({address:p.custody.address,abi:LP_CUSTODY_READ_ABI,functionName,blockNumber:r.blockNumber} as never) as Promise<unknown>;
  const [governor,guardian,treasury,paused,held,released,raw]=await Promise.all(['governor','guardian','treasury','paused','held','released','policy'].map(read));
  if(!same(governor,p.governor)||!same(guardian,p.guardian)||!same(treasury,p.treasury)||typeof paused!=='boolean'||held!==false||released!==true||!raw||typeof raw!=='object')throw Error('Released custody state differs');
  const stored=raw as Record<string,unknown>;
  for(const name of ['manager','factory','pool','token0','token1'] as const){const pin=stored[name] as Record<string,unknown>;if(!pin||!same(pin.target,p[name].address)||!same(pin.codeHash,p[name].codeHash))throw Error('Stored release route differs');}
  if(stored.positionId!==BigInt(p.positionId)||stored.fee!==p.fee||stored.tickLower!==p.tickLower||stored.tickUpper!==p.tickUpper||stored.expectedLiquidity!==BigInt(p.expectedLiquidity))throw Error('Stored release position differs');
  const again=normalize(await receipt()),after=await block();
  if(json(again)!==json(original)||after.number!==b.number||after.hash!==b.hash||after.timestamp!==b.timestamp||!same(after.transactions[r.transactionIndex],transactionHash)||await c.getChainId()!==97)throw Error('Release observation changed');
  return {chainId:97,custody:p.custody.address.toLowerCase(),governor:p.governor.toLowerCase(),guardian:p.guardian.toLowerCase(),treasury:p.treasury.toLowerCase(),transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash.toLowerCase(),blockTimestamp:b.timestamp.toString(),releaseLogIndex:r.logs[2].logIndex,evidenceId:`97:${p.custody.address.toLowerCase()}:${transactionHash}:${r.logs[2].logIndex}`,receiptConsistencyDigest:keccak256(new TextEncoder().encode(json(original))),held:false,released:true,pausedAtBlock:paused,position};
 };
 try{
  time();return await Promise.race([(async()=>{
   const heads=await Promise.all(guarded.map(c=>c.getBlockNumber({cacheTime:0})));
   if(heads.some(h=>!uint(h,64)||h<21n)||(heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n)throw Error('Release heads differ');
   const head=heads[0]<heads[1]?heads[0]:heads[1],results=await Promise.all(guarded.map(c=>observe(c,head)));
   if(json(results[0])!==json(results[1]))throw Error('Release providers disagree');
   return Object.freeze({...results[0],observedAtMs:time(),source:'isolated-liquidity-custody-release-rpc-observation',currentAuthorization:null,treasuryControlVerified:false,projectConsentVerified:false,capitalOriginVerified:false,preReleaseStateVerified:false,independentProvidersVerified:false,finalityVerified:false,executionAuthorized:false,fullManagedLiquidityReadiness:false});
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Release observation timed out')),30_000);})]);
 }finally{ended=true;clearTimeout(timer);}
}
