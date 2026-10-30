import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,keccak256} from 'viem';
import {buildCounterAllocation,buildCounterSnapshotFunding,COUNTER_ALLOCATION_ABI} from '../../lib/counter-allocation.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),tick=()=>new Promise(r=>setImmediate(r));
function policy(){return {chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,
 payoutAsset:a(5),payoutAssetCodeHash:pin,accounts:[a(11),a(12)],minimumHolding:'1',payoutBudget:'34'};}
function reader({balances=[10n,30n],supply=40n,excluded=[],timestamp=BigInt(Math.floor(Date.now()/1000)-60)}={}){
 return {async getChainId(){return 97;},async getBlockNumber(){return 100n;},async getBlock(){return {number:80n,hash:h(80),timestamp};},async getCode(){return code;},
  async readContract({functionName,args,blockNumber}){
   assert.equal(blockNumber,80n);
   const p=policy();const fixed={governor:p.governor,guardian:p.guardian,launchToken:p.launchToken,paused:true,nextRound:1n,assetCodeHash:pin,totalSupply:supply};
   if(functionName==='balanceOf')return balances[args[0]===a(11)?0:1];
   if(functionName==='excluded')return excluded.includes(args[0]);
   if(Object.hasOwn(fixed,functionName))return fixed[functionName];throw Error('Unexpected fixture read');
  }};
}
function readers(options={}){const timestamp=BigInt(Math.floor(Date.now()/1000)-60);return [reader({...options,timestamp}),reader({...options,timestamp})];}

test('actual allocation calldata conserves funded units and exposes dust without approving eligibility',async()=>{
 const result=await buildCounterAllocation(readers(),policy());
 assert.deepEqual(result.allocations,[{recipient:a(11),amount:'8'},{recipient:a(12),amount:'25'}]);
 assert.equal(result.fundedAmount,'33');assert.equal(result.unallocatedDust,'1');assert.equal(result.eligibleUnits,'40');
 const call=decodeFunctionData({abi:COUNTER_ALLOCATION_ABI,data:result.data});
 assert.equal(call.functionName,'fundRound');assert.deepEqual([call.args[0].toLowerCase(),call.args[1].map(x=>x.toLowerCase()),call.args[2]],[a(5),[a(11),a(12)],[8n,25n]]);
 for(const key of ['executionAuthorized','holderEligibilityPolicyApproved','independentProvidersVerified','feeFundingVerified','completeHolderIndexVerified','fullCounterReadiness'])assert.equal(result[key],false);
});

test('explicit minimums and escrow exclusions affect denominator, never supply-coverage accounting',async()=>{
 let r=await buildCounterAllocation(readers(),{...policy(),minimumHolding:'11'});
 assert.deepEqual(r.allocations,[{recipient:a(12),amount:'34'}]);assert.equal(r.unallocatedDust,'0');
 r=await buildCounterAllocation(readers({excluded:[a(12)]}),policy());assert.equal(r.eligibleUnits,'10');assert.deepEqual(r.allocations,[{recipient:a(11),amount:'34'}]);
 await assert.rejects(buildCounterAllocation(readers(),{...policy(),payoutBudget:'1'}),/zero/);
});

test('missing supply, provider divergence and malformed observations fail closed',async()=>{
 await assert.rejects(buildCounterAllocation(readers({supply:41n}),policy()),/cover/);
 const cs=readers();cs[1]=reader({balances:[30n,10n],timestamp:BigInt(Math.floor(Date.now()/1000)-60)});await assert.rejects(buildCounterAllocation(cs,policy()),/disagree/);
 for(const [name,value] of [['paused',false],['governor',a(99)],['assetCodeHash',h(1)],['nextRound',0n],['totalSupply',0n],['balanceOf',-1n],['excluded',0]]){
  const cs=readers();for(const c of cs){const read=c.readContract;c.readContract=async q=>q.functionName===name?value:read(q);}
  await assert.rejects(buildCounterAllocation(cs,policy()));
 }
 await assert.rejects(buildCounterAllocation(readers({excluded:[a(11),a(12)]}),policy()),/eligible/);
 await assert.rejects(buildCounterAllocation(readers(),{...policy(),payoutBudget:'1'}),/zero/);
});

test('strict bounded request validation occurs before any RPC and preserves client identity',async()=>{
 let reads=0;const c={getChainId(){reads++;throw Error('No RPC allowed');}};
 const bad=[{...policy(),accounts:[a(12),a(11)]},{...policy(),accounts:[a(11),a(11)]},{...policy(),accounts:[]},{...policy(),accounts:Array(129).fill(a(11))},
  {...policy(),payoutBudget:'01'},{...policy(),minimumHolding:'0'},{...policy(),payoutBudget:String(1n<<256n)},{...policy(),chainId:1},{...policy(),extra:true},{...policy(),payoutAsset:a(4)}];
 for(const p of bad)await assert.rejects(buildCounterAllocation([c,{}],p));
 await assert.rejects(buildCounterAllocation([c,c],policy()),/distinct/);assert.equal(reads,0);
 const cs=readers();for(const c of cs)for(const k of Object.keys(c)){const fn=c[k];c[k]=async function(...args){assert.equal(this,c);return fn(...args);};}
 await buildCounterAllocation(cs,policy());
});

test('checked number/hash/timestamp, code and common-confirmed-head fences reject changes',async()=>{
 for(const mutate of [
  c=>{c.getChainId=async()=>1;},c=>{c.getBlockNumber=async()=>20n;},c=>{c.getBlockNumber=async()=>111n;},c=>{c.getCode=async()=>undefined;},
  c=>{let n=0;const fn=c.getBlock;c.getBlock=async()=>({...await fn(),...(++n===2?{timestamp:1n}: {})});},
  c=>{const fn=c.getBlock;c.getBlock=async()=>({...await fn(),hash:h(81)});},
  c=>{const fn=c.getBlock;c.getBlock=async()=>({...await fn(),number:81n});},
 ]){const cs=readers();mutate(cs[1]);await assert.rejects(buildCounterAllocation(cs,policy()));}
});

test('completion rejects a snapshot that ages while the other reader finishes',async()=>{
 const real=Date.now,base=real();let now=base;Date.now=()=>now;
 try{const cs=readers({timestamp:BigInt(Math.floor(base/1000)-119)});
  // Explicitly share exact fixture time; every reader must use the same block.
  for(const c of cs){const fn=c.getBlock;c.getBlock=async()=>({...await fn(),timestamp:BigInt(Math.floor(base/1000)-119)});}
  const read=cs[1].readContract;cs[1].readContract=async q=>{const v=await read(q);if(q.functionName==='excluded')now=base+2000;return v;};
  await assert.rejects(buildCounterAllocation(cs,policy()),/Stale/);
 }finally{Date.now=real;}
});

test('peer failure fences delayed RPC continuations',async()=>{
 let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const cs=readers();let follow=0;
 cs[0].getCode=async()=>{await waiting;throw Error('fixture peer failed');};
 const block=cs[1].getBlock;cs[1].getBlock=async()=>{entered();await gate;return block();};
 const getCode=cs[1].getCode;cs[1].getCode=async q=>{follow++;return getCode(q);};
 try{await assert.rejects(buildCounterAllocation(cs,policy()));}finally{release();await tick();await tick();}assert.equal(follow,0);
});

test('real twenty-second wall timer settles a hung chain read and prevents late follow-ons',{timeout:30000},async()=>{
 let release;const gate=new Promise(r=>release=r),cs=readers();let follow=0;
 cs[0].getChainId=async()=>{await gate;return 97;};cs[0].getBlockNumber=async()=>{follow++;return 100n;};
 let watchdog;try{await assert.rejects(Promise.race([buildCounterAllocation(cs,policy()),new Promise((_,reject)=>watchdog=setTimeout(()=>reject(Error('missing engine timer')),25000))]),/timed out/);}
 finally{clearTimeout(watchdog);release();await tick();await tick();}assert.equal(follow,0);
});


test('maximum uint256 pro-rata multiplication stays exact without float conversion',async()=>{
 const max=(1n<<256n)-1n;const r=await buildCounterAllocation(readers({balances:[max-1n,1n],supply:max}),{...policy(),payoutBudget:String(max)});
 assert.equal(r.fundedAmount,String(max));assert.equal(r.unallocatedDust,'0');assert.deepEqual(r.allocations,[{recipient:a(11),amount:String(max-1n)},{recipient:a(12),amount:'1'}]);
});

test('clock rollback above the start is rejected',async()=>{
 const real=Date.now;let now=100000,calls=0;Date.now=()=>now;
 try{const cs=readers();for(const c of cs){c.getChainId=async()=>{now=++calls===1?100100:100050;return 97;};}
  await assert.rejects(buildCounterAllocation(cs,policy()),/clock|backwards/);
 }finally{Date.now=real;}
});


test('optional funding bytes bind the observed round, block hash and fixed snapshot expiry',async()=>{
 const cs=readers(),result=await buildCounterSnapshotFunding(cs,policy());
 const call=decodeFunctionData({abi:COUNTER_ALLOCATION_ABI,data:result.data});
 assert.equal(call.functionName,'fundSnapshotRound');
 assert.deepEqual(call.args[3],{expectedRound:1n,blockNumber:80n,blockHash:h(80),deadline:BigInt(result.blockTimestamp)+120n});
 assert.equal(result.deadline,String(BigInt(result.blockTimestamp)+120n));assert.equal(result.roundAndSnapshotBound,true);
 assert.deepEqual(call.args[2],[8n,25n]);assert.equal(result.unallocatedDust,'1');
 for(const key of ['executionAuthorized','holderEligibilityPolicyApproved','independentProvidersVerified','feeFundingVerified','completeHolderIndexVerified','fullCounterReadiness'])assert.equal(result[key],false);
 await assert.rejects(buildCounterSnapshotFunding(readers({supply:41n}),policy()),/cover/);
});
