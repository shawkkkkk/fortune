import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {inspectWorkEscrowJob} from '../../lib/work-escrow-observation.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x60006000f3',pin=keccak256(code);
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),arbitrator:a(4),jobId:'1',client:a(5),worker:a(6),termsHash:h(1),amount:'100',asset:a(7),assetCodeHash:pin,maxPerJob:'1000'});
function reader(timestamp) {return {
 async getChainId(){return 97;},async getBlockNumber(){return 100n;},async getBlock(){return {number:80n,hash:h(80),timestamp};},async getCode(){return code;},
 async readContract(q){assert.equal(q.blockNumber,80n);const p=policy();if(q.functionName==='jobs')return [p.client,p.worker,p.asset,100n,10n,20n,p.termsHash,2];if(q.functionName==='resultHashes')return h(Number(q.args[1])+10);return {governor:p.governor,guardian:p.guardian,arbitrator:p.arbitrator,paused:false,nextJob:2n,latestResultRevision:2n,disputedResultRevision:0n,assetCodeHash:pin,maxPerJob:1000n,reserved:150n,balanceOf:150n}[q.functionName];}
};}
function clients(){const time=BigInt(Math.floor(Date.now()/1000)-60);return [reader(time),reader(time)];}
const override=(cs,name,v)=>{for(const c of cs){const r=c.readContract;c.readContract=async q=>q.functionName===name?v:r(q);}return cs;};
const job=state=>[a(5),a(6),a(7),100n,10n,20n,h(1),state];
test('work observer returns pinned terms, ordered result history and selected backing without payment inference',async()=>{
 const x=await inspectWorkEscrowJob(clients(),policy());assert.equal(x.job.state,'Accepted');assert.deepEqual(x.results,[{revision:1,resultHash:h(11)},{revision:2,resultHash:h(12)}]);assert.deepEqual(x.backing,{selectedOutstanding:'100',reserved:'150',reportedBalance:'150',maxPerJob:'1000'});assert.equal(x.blockNumber,'80');assert.equal(x.currentAuthorization,null);
 for(const k of ['workerPaid','clientRefund','settlementTransaction'])assert.equal(x[k],null);
 for(const k of ['settlementReceiptVerified','workDeliveryVerified','partyIdentityVerified','disputeFairnessVerified','capitalOriginVerified','independentProvidersVerified','finalityVerified','globalSolvencyVerified','executionAuthorized','fullSyndicateReadiness'])assert.equal(x[k],false);
 for(const state of [1,2,3,4]){const c=override(clients(),'jobs',job(state));override(c,'paused',true);override(c,'latestResultRevision',state===1?0n:2n);override(c,'disputedResultRevision',state>=3?2n:0n);if(state===4){override(c,'reserved',0n);override(c,'balanceOf',0n);}const r=await inspectWorkEscrowJob(c,policy());assert.equal(r.paused,true);assert.equal(r.job.state,['','Funded','Accepted','Disputed','Settled'][state]);assert.equal(r.backing.selectedOutstanding,state===4?'0':'100');assert.equal(r.workerPaid,null);}
 const all=override(clients(),'latestResultRevision',32n);assert.equal((await inspectWorkEscrowJob(all,policy())).results.length,32);
 const legacy=override(clients(),'jobs',job(3));assert.equal((await inspectWorkEscrowJob(legacy,policy())).disputedResultRevision,'0');
});
test('exact policy and provider preflight reject before RPC',async()=>{
 let calls=0;const c={getChainId:async()=>{calls++;return 97;}};
 for(const p of [null,{...policy(),extra:true},{...policy(),chainId:56},{...policy(),jobId:'01'},{...policy(),jobId:(1n<<256n).toString()},{...policy(),amount:'0'},{...policy(),amount:'1001'},{...policy(),maxPerJob:(1n<<128n).toString()},{...policy(),client:a(6)},{...policy(),worker:a(4)},{...policy(),asset:a(3)},{...policy(),termsHash:h(0)}])await assert.rejects(inspectWorkEscrowJob([c,{}],p));
 await assert.rejects(inspectWorkEscrowJob([c,c],policy()));assert.equal(calls,0);
});
test('missing, foreign, malformed jobs, histories and insufficient reported backing fail closed',async()=>{
 for(const [name,v]of [['jobs',job(0)],['jobs',job(5)],['jobs',[...job(2).slice(0,7),'2']],['jobs',[a(9),...job(2).slice(1)]],['jobs',[...job(2).slice(0,4),20n,10n,h(1),2]],['nextJob',1n],['governor',a(9)],['guardian',a(9)],['arbitrator',a(9)],['paused',0],['assetCodeHash',h(9)],['maxPerJob',999n],['reserved',99n],['reserved',UINT_OVERFLOW()],['balanceOf',149n],['latestResultRevision',33n],['latestResultRevision',-1n],['disputedResultRevision',1n],['resultHashes',h(0)],['resultHashes',h(9)]])await assert.rejects(inspectWorkEscrowJob(override(clients(),name,v),policy()),undefined,name);
 for(const cs of [override(override(clients(),'jobs',job(1)),'latestResultRevision',1n),override(clients(),'disputedResultRevision',2n)])await assert.rejects(inspectWorkEscrowJob(cs,policy()));
 for(const code of ['0x','0x1','0x60016000f3','0x'+'aa'.repeat(131073)]){const c=clients();c[0].getCode=async()=>code;await assert.rejects(inspectWorkEscrowJob(c,policy()),/runtime/);}
});
function UINT_OVERFLOW(){return 1n<<256n;}
test('same-height state/header/provider disagreement and changing final headers reject',async()=>{
 for(const change of [c=>{c.getChainId=async()=>56;},c=>{c.getBlockNumber=async()=>111n;},c=>{c.getBlockNumber=async()=>20n;},c=>{c.getBlock=async()=>({number:80n,hash:h(80),timestamp:-1n});},c=>{const r=c.readContract;c.readContract=async q=>q.functionName==='reserved'?151n:r(q);},c=>{const r=c.getBlock;c.getBlock=async()=>({...await r(),timestamp:(await r()).timestamp+1n});}]){const c=clients();change(c[1]);await assert.rejects(inspectWorkEscrowJob(c,policy()));}
 for(const change of [b=>({...b,number:81n}),b=>({...b,hash:h(81)}),b=>({...b,timestamp:b.timestamp+1n})]){const c=clients(),r=c[0].getBlock;let reads=0;c[0].getBlock=async()=>{const b=await r();return ++reads===2?change(b):b;};await assert.rejects(inspectWorkEscrowJob(c,policy()),/changed/);}
});
test('future and zero-hash snapshot headers reject',async()=>{
 const ts=BigInt(Math.floor(Date.now()/1000))+10n;await assert.rejects(inspectWorkEscrowJob([reader(ts),reader(ts)],policy()),/Stale/);const c=clients(),r=c[0].getBlock;c[0].getBlock=async()=>({...await r(),hash:h(0)});await assert.rejects(inspectWorkEscrowJob(c,policy()),/snapshot block/);
});
test('staleness during own reads or waiting for peer and backwards clocks reject',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now;
 try{
  for(const mode of ['own','peer']){const ts=BigInt(Math.floor(now/1000))-119n,c=[reader(ts),reader(ts)];let release;
   if(mode==='peer'){const r=c[0].getBlock;c[0].getBlock=async()=>{const b=await r();if(!release){await new Promise(resolve=>release=resolve);}return b;};const r1=c[1].getBlock;let n=0;c[1].getBlock=async()=>{const b=await r1();if(++n===2){now+=2000;release();}return b;};}
   else {const r=c[0].readContract;c[0].readContract=async q=>{const v=await r(q);if(q.functionName==='balanceOf')now+=2000;return v;};}
   await assert.rejects(inspectWorkEscrowJob(c,policy()),/Stale/);
  }
  const c=clients(),r=c[0].getCode;c[0].getCode=async q=>{const x=await r(q);now--;return x;};await assert.rejects(inspectWorkEscrowJob(c,policy()),/clock/);
  let calls=0;Date.now=()=>-1;await assert.rejects(inspectWorkEscrowJob([{getChainId:async()=>{calls++;return 97;}},{}],policy()));assert.equal(calls,0);
 }finally{Date.now=original;}
});
test('failed peer fences late work and preserves original method receiver',async()=>{
 const c=clients();let release,follow=0;c[0].getBlockNumber=async()=>{throw Error('peer failure');};c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getBlock=async()=>{follow++;return {};};await assert.rejects(inspectWorkEscrowJob(c,policy()));release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
 const r=clients();for(const c of r){c.getChainId=async function(){assert.equal(this,c);return 97;};}await inspectWorkEscrowJob(r,policy());
});
test('real twenty-second deadline fences a released hung read without follow-on RPC',{timeout:25000},async()=>{
 const c=clients();let release,follow=0;c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getBlock=async()=>{follow++;return {};};await assert.rejects(inspectWorkEscrowJob(c,policy()),/timed out/);release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});
