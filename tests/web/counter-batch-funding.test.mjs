import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,keccak256} from 'viem';
import {buildCounterBatchFunding,COUNTER_BATCH_FUNDING_ABI} from '../../lib/counter-batch-funding.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),tick=()=>new Promise(r=>setImmediate(r));
function policy(){return {chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,
 payoutAsset:a(5),payoutAssetCodeHash:pin,accounts:[a(11),a(12)],minimumHolding:'1',payoutBudget:'34'};}
function reader({balances=[10n,30n],supply=40n,excluded=[],timestamp=BigInt(Math.floor(Date.now()/1000)-60)}={}){
 return {async getChainId(){return 97;},async getBlockNumber(){return 100n;},async getBlock(){return {number:80n,hash:h(80),timestamp};},async getCode(){return code;},
  async readContract({functionName,args,blockNumber}){
   assert.ok(blockNumber===80n || blockNumber===81n);
   const p=policy();const fixed={governor:p.governor,guardian:p.guardian,launchToken:p.launchToken,paused:true,nextRound:1n,assetCodeHash:pin,totalSupply:supply};
   if(functionName==='balanceOf')return balances[args[0]===a(11)?0:1];
   if(functionName==='excluded')return excluded.includes(args[0]);
   if(Object.hasOwn(fixed,functionName))return fixed[functionName];throw Error('Unexpected fixture read');
  }};
}
function readers(options={}){const timestamp=BigInt(Math.floor(Date.now()/1000)-60);return [reader({...options,timestamp}),reader({...options,timestamp})];}

const batch=()=>{const {payoutAsset,payoutAssetCodeHash,payoutBudget,...base}=policy();return {...base,payouts:[{token:a(5),codeHash:pin,budget:'34'},{token:a(6),codeHash:pin,budget:'80'}]};};

test('actual allocation engines produce separately conserved, consecutive snapshot-bound batch bytes',async()=>{
 const r=await buildCounterBatchFunding(readers(),batch()),call=decodeFunctionData({abi:COUNTER_BATCH_FUNDING_ABI,data:r.data});
 assert.equal(call.functionName,'fundSnapshotBatch');assert.deepEqual(call.args[0].map(x=>[x.token.toLowerCase(),x.recipients.map(x=>x.toLowerCase()),x.amounts]),[[a(5),[a(11),a(12)],[8n,25n]],[a(6),[a(11),a(12)],[20n,60n]]]);
 assert.deepEqual(r.rounds.map(x=>[x.expectedRound,x.fundedAmount,x.unallocatedDust]),[['1','33','1'],['2','80','0']]);
 assert.deepEqual(call.args[1],{expectedRound:1n,blockNumber:80n,blockHash:h(80),deadline:BigInt(r.blockTimestamp)+120n});
 assert.equal(r.currentAuthorization,null);assert.equal(r.roundAndSnapshotBound,true);
 for(const k of ['executionAuthorized','fullCounterReadiness','feeFundingVerified','capitalOriginVerified','finalityVerified','independentProvidersVerified','holderEligibilityPolicyApproved','completeHolderIndexVerified'])assert.equal(r[k],false);
});
test('every policy including late assets fails before RPC; client identity and literal sorted bounds',async()=>{
 let calls=0;const c={getChainId(){calls++;throw Error('No RPC');}};
 for(const mutate of [p=>p.payouts.pop(),p=>p.payouts.reverse(),p=>p.payouts[1]=p.payouts[0],p=>p.payouts[1].budget='0',p=>p.payouts[1].token=a(4),p=>p.payouts[1].codeHash=h(0),p=>p.payouts[1].extra=true,p=>p.accounts=[],p=>p.extra=true,p=>p.payouts=Array(11).fill(p.payouts[0])]){const p=batch();mutate(p);await assert.rejects(buildCounterBatchFunding([c,{}],p));}
 await assert.rejects(buildCounterBatchFunding([c,c],batch()));assert.equal(calls,0);
 const cs=readers();for(const c of cs)for(const k of Object.keys(c)){const fn=c[k];c[k]=async function(...args){assert.equal(this,c);return fn(...args);};}await buildCounterBatchFunding(cs,batch());
});
test('ten independent assets work and each later supply/runtime/round failure rejects the whole review',async()=>{
 const p=batch();p.payouts=Array.from({length:10},(_,i)=>({token:a(100+i),codeHash:pin,budget:'34'}));
 assert.equal((await buildCounterBatchFunding(readers(),p)).rounds.length,10);
 for(const [name,v] of [['totalSupply',41n],['nextRound',(1n<<256n)-2n],['assetCodeHash',h(1)]]){const cs=readers();for(const c of cs){const fn=c.readContract;c.readContract=async q=>q.functionName===name?v:fn(q);}await assert.rejects(buildCounterBatchFunding(cs,batch()));}
});
test('moving snapshot heights or rounds between nested allocations are rejected',async()=>{
 const cs=readers();for(const c of cs){let heads=0;c.getBlockNumber=async()=>++heads===1?100n:101n;const block=c.getBlock;c.getBlock=async q=>({...await block(),number:q.blockNumber,hash:h(Number(q.blockNumber))});}
 await assert.rejects(buildCounterBatchFunding(cs,batch()),/snapshots disagree/);
});
test('outer final header reread rejects changes after all individual readers complete',async()=>{
 const cs=readers();for(const c of cs){const fn=c.getBlock;let reads=0;c.getBlock=async()=>({...await fn(),...(++reads===5?{timestamp:1n}:{})});}
 await assert.rejects(buildCounterBatchFunding(cs,batch()),/snapshot changed/);
});
test('failed nested reader fences late calls across the entire batch',async()=>{
 const cs=readers();let entered,release,follow=0;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 cs[0].getCode=async()=>{await waiting;throw Error('peer failed');};cs[1].getBlock=async()=>{entered();await gate;return {number:80n,hash:h(80),timestamp:BigInt(Math.floor(Date.now()/1000)-60)};};cs[1].getCode=async()=>{follow++;return code;};
 try{await assert.rejects(buildCounterBatchFunding(cs,batch()));}finally{release();await tick();await tick();}assert.equal(follow,0);
});
test('outer completion rechecks age and safe monotonic clocks',async()=>{
 const real=Date.now,base=real();let now=base;Date.now=()=>now;
 try{const cs=readers();for(const c of cs){let n=0;c.getBlock=async()=>{if(++n===5)now=base+2000;return {number:80n,hash:h(80),timestamp:BigInt(Math.floor(base/1000)-119)};};}await assert.rejects(buildCounterBatchFunding(cs,batch()),/Stale/);
 now=-1;let reads=0;const c={getChainId(){reads++;}};await assert.rejects(buildCounterBatchFunding([c,{}],batch()),/clock/);assert.equal(reads,0);
 }finally{Date.now=real;}
});
test('actual shared twenty-second timer fences hung nested work',{timeout:30000},async()=>{
 let release,follow=0;const cs=readers(),gate=new Promise(r=>release=r);cs[0].getChainId=async()=>{await gate;return 97;};cs[0].getBlockNumber=async()=>{follow++;return 100n;};
 try{await assert.rejects(buildCounterBatchFunding(cs,batch()),/timed out/);}finally{release();await tick();await tick();}assert.equal(follow,0);
});
