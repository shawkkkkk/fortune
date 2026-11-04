import test from 'node:test';import assert from 'node:assert/strict';
import {keccak256,parseAbi,encodeFunctionData} from 'viem';
import {inspectAllWorkBatchWaivers} from '../../lib/work-batch-waiver-receipts.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),word=n=>h(n).slice(2),code='0x60006000f3',pin=keccak256(code),sig=s=>keccak256(new TextEncoder().encode(s));
function fixture(count=2){
 const waivers=Array.from({length:count},(_,i)=>({id:String(i+1),expectedRevision:String(i%3)}));
 const policies=waivers.map((w,i)=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),arbitrator:a(4),worker:a(6),client:a(20+i),asset:a(7+i%2),assetCodeHash:pin,maxPerJob:'2000',amount:String(100*(i+1)),jobId:w.id,termsHash:h(i+100),transactionHash:h(9),waivers:structuredClone(waivers)}));
 const binding={blockHash:h(80),blockNumber:80n,transactionHash:h(9),transactionIndex:0,removed:false};
 const receipt={transactionHash:h(9),status:'success',blockHash:h(80),blockNumber:80n,transactionIndex:0,from:a(6),to:a(1),logs:policies.flatMap((p,i)=>[
 {...binding,address:p.asset,topics:[sig('Transfer(address,address,uint256)'),h(1),h(20+i)],data:h(p.amount),logIndex:3+i*3},
 {...binding,address:p.escrow,topics:[sig('JobSettled(uint256,uint256,uint256,address)'),h(i+1),h(6)],data:'0x'+word(0)+word(p.amount),logIndex:4+i*3},
 {...binding,address:p.escrow,topics:[sig('PaymentWaived(uint256,address,uint256)'),h(i+1),h(6)],data:h(i%3),logIndex:5+i*3}])};
 const block={number:80n,hash:h(80),timestamp:BigInt(Math.floor(Date.now()/1000)-60),transactions:[h(9)]};
 const tx={hash:h(9),blockHash:h(80),blockNumber:80n,transactionIndex:0,chainId:97,from:a(6),to:a(1),value:0n,input:encodeFunctionData({abi:parseAbi(['function waivePaymentsMany((uint256 id,uint256 expectedRevision)[] waivers)']),functionName:'waivePaymentsMany',args:[waivers.map(w=>({id:BigInt(w.id),expectedRevision:BigInt(w.expectedRevision)}))]})};
 const client=()=>({getChainId:async()=>97,getBlockNumber:async()=>100n,getBlock:async()=>structuredClone(block),getTransactionReceipt:async()=>structuredClone(receipt),getTransaction:async()=>structuredClone(tx),getCode:async()=>code,readContract:async q=>{
 assert.equal(q.blockNumber,80n);const p=policies[Number(q.args?.[0]??1n)-1];
 if(q.functionName==='jobs')return [p.client,p.worker,p.asset,BigInt(p.amount),10n,20n,p.termsHash,4];if(q.functionName==='latestResultRevision')return BigInt(p.waivers[Number(p.jobId)-1].expectedRevision);
 return {governor:a(2),guardian:a(3),arbitrator:a(4),assetCodeHash:pin,maxPerJob:2000n}[q.functionName];}});
 return {policies,receipt,block,tx,clients:[client(),client()]};
}
test('whole waiver observes 1/2/16 complete entries across clients/assets with stable receipt and separate units',async()=>{
 for(const count of [1,2,16]){const f=fixture(count),x=await inspectAllWorkBatchWaivers(f.clients,f.policies),again=await inspectAllWorkBatchWaivers(f.clients,f.policies);
 assert.equal(x.allCallEntriesObserved,true);assert.equal(x.refunds.length,count);assert.equal(new Set(x.refunds.map(r=>r.evidenceId)).size,count);assert.equal(x.receiptConsistencyDigest,again.receiptConsistencyDigest);assert.deepEqual(x.refunds.map(r=>r.evidenceId),again.refunds.map(r=>r.evidenceId));
 assert.deepEqual(x.refunds.map(r=>r.clientRefund),f.policies.map(p=>p.amount));assert.equal(x.executionAuthorized,false);assert.equal(x.currentAuthorization,null);assert.equal(x.fullSyndicateReadiness,false);assert.ok(x.refunds.every(r=>r.otherBatchJobsVerified===false));}
});
test('complete waiver policy and asset preflight rejects omissions, order, aliases and late bad fields with zero RPC',async()=>{
 const f=fixture(3),p=f.policies;let calls=0;const c={getBlockNumber:async()=>{calls++;}};
 for(const inputs of [[],Array(17),Array(3),p.slice(0,2),[p[1],p[0],p[2]],[p[0],p[0],p[2]],[p[0],p[1],{...p[2],amount:'0'}],[p[0],p[1],{...p[2],worker:a(90)}],[p[0],p[1],{...p[2],assetCodeHash:h(99)}],[p[0],p[1],{...p[2],transactionHash:h(99)}],p.map(p=>({...p,waivers:[{id:'01',expectedRevision:'0'}]}))])await assert.rejects(inspectAllWorkBatchWaivers([c,{}],inputs));assert.equal(calls,0);
});
test('whole waiver validates later job values, all receipt observations and own framing',async()=>{
 for(const mutate of [f=>f.receipt.logs[3].data=h(99),f=>f.receipt.logs[5].data=h(99),f=>f.receipt.logs[4].topics[1]=h(99),f=>f.receipt.logs.pop(),f=>delete f.receipt.logs[5].topics[0]]){const f=fixture();mutate(f);await assert.rejects(inspectAllWorkBatchWaivers(f.clients,f.policies));}
 const f=fixture();for(const c of f.clients){const old=c.getTransactionReceipt;let n=0;c.getTransactionReceipt=async()=>{const r=await old();if(++n>1)r.logs[3].data=h(42);return r;};}await assert.rejects(inspectAllWorkBatchWaivers(f.clients,f.policies));
 const g=fixture();for(const c of g.clients){const old=c.getTransactionReceipt;let n=0;c.getTransactionReceipt=async()=>({...await old(),gasUsed:BigInt(++n)});}await inspectAllWorkBatchWaivers(g.clients,g.policies);
});
test('whole waiver preserves original receivers and rejects intermediate clock rollback',async()=>{
 const f=fixture();for(const c of f.clients)for(const k of ['getChainId','getBlockNumber','getBlock','getTransactionReceipt','getTransaction','getCode','readContract']){const old=c[k];c[k]=function(...args){assert.equal(this,c);return old.apply(c,args);};}await inspectAllWorkBatchWaivers(f.clients,f.policies);
 const original=Date.now;let now=original();Date.now=()=>now;try{const g=fixture();g.clients[0].getCode=async()=>{now--;return code;};await assert.rejects(inspectAllWorkBatchWaivers(g.clients,g.policies),/clock (?:reversed|moved backwards)/);}finally{Date.now=original;}
});
test('whole waiver real shared20sec timeout and failed peer fence late follow-on reads',{timeout:25000},async()=>{
 const f=fixture();let releases=[],follow=0;f.clients[1].getBlockNumber=()=>new Promise(r=>releases.push(r));f.clients[1].getChainId=async()=>{follow++;return 97;};await assert.rejects(inspectAllWorkBatchWaivers(f.clients,f.policies),/timed out/);for(const r of releases)r(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
 const g=fixture();let late=[];g.clients[0].getBlockNumber=async()=>{throw Error('peer');};g.clients[1].getBlockNumber=()=>new Promise(r=>late.push(r));g.clients[1].getChainId=async()=>{follow++;return 97;};await assert.rejects(inspectAllWorkBatchWaivers(g.clients,g.policies));for(const r of late)r(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});
