import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,keccak256} from 'viem';
import {buildCounterClaimBatch,COUNTER_CLAIM_ABI} from '../../lib/counter-claims.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x60006000f3',pin=keccak256(code);
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,recipient:a(9),rounds:['1','2'],assets:[{token:a(5),codeHash:pin}]});
function reader(timestamp=BigInt(Math.floor(Date.now()/1000)-60)) {return {
 async getChainId(){return 97;},async getBlockNumber(){return 100n;},async getBlock(){return {number:80n,hash:h(80),timestamp};},async getCode(){return code;},
 async readContract(q){assert.equal(q.blockNumber,80n);const p=policy();if(q.functionName==='rounds')return [a(5),100n,100n,h(1)];if(q.functionName==='claimable')return q.args[0]*10n;return {governor:p.governor,guardian:p.guardian,launchToken:p.launchToken,paused:false,assetCodeHash:pin,reserved:200n,balanceOf:200n}[q.functionName];}
};}
function clients(){const time=BigInt(Math.floor(Date.now()/1000)-60);return [reader(time),reader(time)];}
const override=(cs,name,v)=>{for(const c of cs){const r=c.readContract;c.readContract=async q=>q.functionName===name?v:r(q);}return cs;};
test('claim review binds recorded recipient/IDs in real ABI and reports exact selected liabilities without authority',async()=>{
 const x=await buildCounterClaimBatch(clients(),policy()),call=decodeFunctionData({abi:COUNTER_CLAIM_ABI,data:x.data});assert.equal(call.functionName,'claimMany');assert.deepEqual(call.args[0],[1n,2n]);assert.equal(call.args[1].toLowerCase(),a(9));assert.deepEqual(x.claims.map(r=>r.amount),['10','20']);assert.equal(x.backing[0].selectedAmount,'30');assert.equal(x.backing[0].selectedRemaining,'200');assert.equal(x.currentAuthorization,null);for(const k of ['snapshotBoundCalldata','independentProvidersVerified','globalSolvencyVerified','holderEligibilityVerified','feeFundingVerified','executionAuthorized','fullCounterReadiness'])assert.equal(x[k],false);
});
test('strict policy, sorted IDs and exact used-asset coverage reject ambiguous batches',async()=>{
 for(const p of [{...policy(),chainId:56},{...policy(),rounds:[]},{...policy(),rounds:['2','1']},{...policy(),rounds:['1','1']},{...policy(),rounds:['01']},{...policy(),rounds:[(1n<<256n).toString()]},{...policy(),rounds:Array.from({length:33},(_,i)=>String(i+1))},{...policy(),extra:true},{...policy(),recipient:a(1)},{...policy(),assets:[{token:a(5),codeHash:pin},{token:a(6),codeHash:pin}]}])await assert.rejects(buildCounterClaimBatch(clients(),p));
 const c=reader();await assert.rejects(buildCounterClaimBatch([c,c],policy()));
});
test('claimed/missing rounds, invalid backing, policy pins and paused state fail closed',async()=>{
 for(const [key,v]of [['claimable',0n],['claimable',101n],['rounds',[a(6),100n,100n,h(1)]],['rounds',[a(5),99n,100n,h(1)]],['rounds',[a(5),100n,100n,h(0)]],['reserved',199n],['balanceOf',199n],['reserved',-1n],['assetCodeHash',h(9)],['paused',true],['governor',a(99)]])await assert.rejects(buildCounterClaimBatch(override(clients(),key,v),policy()),undefined,key);
 const c=clients();c[0].getCode=async()=> '0x60016000f3';await assert.rejects(buildCounterClaimBatch(c,policy()),/runtime/);
});
test('provider disagreement, changing headers and stale completed observations reject',async()=>{
 const c=clients(),r=c[1].readContract;c[1].readContract=async q=>q.functionName==='claimable'?11n:r(q);await assert.rejects(buildCounterClaimBatch(c,policy()),/disagree/);
 for(const change of [b=>({...b,number:81n}),b=>({...b,timestamp:b.timestamp+1n}),b=>({...b,hash:h(81)})]){const c=clients(),get=c[0].getBlock;let calls=0;c[0].getBlock=async()=>{const b=await get();return ++calls===2?change(b):b;};await assert.rejects(buildCounterClaimBatch(c,policy()),/changed/);}
 const now=Date.now;let clock=now();Date.now=()=>clock;try{const ts=BigInt(Math.floor(clock/1000))-119n,c=[reader(ts),reader(ts)],r=c[0].readContract;c[0].readContract=async q=>{const x=await r(q);if(q.functionName==='balanceOf')clock+=2000;return x;};await assert.rejects(buildCounterClaimBatch(c,policy()),/Stale/);}finally{Date.now=now;}
});
test('failed peer and invalid clocks fence follow-on reads without starting new RPC',async()=>{
 const c=clients();let release,follow=0;c[0].getBlockNumber=async()=>{throw Error('peer failure');};c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getBlock=async()=>{follow++;return {};};await assert.rejects(buildCounterClaimBatch(c,policy()));release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
 const now=Date.now;try{Date.now=()=>-1;let calls=0;await assert.rejects(buildCounterClaimBatch([{getChainId:async()=>{calls++;return 97;}},{}],policy()));assert.equal(calls,0);}finally{Date.now=now;}
});
test('actual twenty-second wall deadline fences a hung peer after release', {timeout:25000},async()=>{
 const c=clients();let release,follow=0;c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getBlock=async()=>{follow++;return {};};await assert.rejects(buildCounterClaimBatch(c,policy()),/timed out/);release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});
