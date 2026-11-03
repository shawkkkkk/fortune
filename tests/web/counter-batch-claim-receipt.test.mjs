import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, keccak256, parseAbi } from 'viem';
import { inspectCounterBatchClaimReceipt } from '../../lib/counter-batch-claim-receipt.ts';
import { inspectCounterClaimReceipt } from '../../lib/counter-claim-receipt.ts';
const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const sig=s=>keccak256(new TextEncoder().encode(s)),code='0x6000';
function fixture(count=2){
 const claims=Array.from({length:count},(_,i)=>({round:String(i+1),asset:a(20+i%2),assetCodeHash:keccak256(code),amount:String(i+8)}));
 const p={chainId:97,escrow:a(1),escrowCodeHash:keccak256(code),governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:keccak256(code),recipient:a(6),caller:a(7),transactionHash:h(9),claims};
 const binding={blockNumber:80n,blockHash:h(80),transactionHash:h(9),transactionIndex:0,removed:false};
 const r={...binding,status:'success',from:p.caller,to:p.escrow,logs:claims.flatMap((q,i)=>[
  {...binding,address:q.asset,topics:[sig('Transfer(address,address,uint256)'),h(1),h(6)],data:h(q.amount),logIndex:4+i*2},
  {...binding,address:p.escrow,topics:[sig('Claimed(uint256,address,address,uint256)'),h(q.round),h(6),h(20+i%2)],data:h(q.amount),logIndex:5+i*2}])};
 const tx={hash:h(9),blockNumber:80n,blockHash:h(80),transactionIndex:0,chainId:97,from:p.caller,to:p.escrow,value:0n,
  input:encodeFunctionData({abi:parseAbi(['function claimMany(uint256[],address)']),functionName:'claimMany',args:[claims.map(q=>BigInt(q.round)),p.recipient]})};
 const block={number:80n,hash:h(80),timestamp:1n,transactions:[h(9)]};
 const rounds=claims.map(q=>[q.asset,100n,100n-BigInt(q.amount),h(33)]);
 const clients=[1,2].map(marker=>({marker,getBlockNumber:async function(){assert.ok(this.marker);return 100n;},getChainId:async()=>97,
  getTransactionReceipt:async()=>structuredClone(r),getTransaction:async()=>structuredClone(tx),getBlock:async()=>structuredClone(block),getCode:async()=>code,
  readContract:async q=>({governor:p.governor,guardian:p.guardian,launchToken:p.launchToken,assetCodeHash:keccak256(code),claimable:0n,rounds:rounds[Number(q.args?.[0])-1]})[q.functionName]}));
 return {p,r,tx,block,rounds,clients};
}
test('complete 1/2/32-entry batch observations retain separate units, stable IDs/digest and no authority',async()=>{
 for(const n of [1,2,32]){const f=fixture(n),x=await inspectCounterBatchClaimReceipt(f.clients,f.p);assert.equal(x.allCallEntriesObserved,true);assert.equal(x.claims.length,n);
  assert.deepEqual(x.claims.map(c=>[c.round,c.asset,c.amount]),f.p.claims.map(c=>[c.round,c.asset,c.amount]));assert.equal(new Set(x.claims.map(c=>c.evidenceId)).size,n);
  const replay=await inspectCounterBatchClaimReceipt(f.clients,f.p);assert.equal(replay.receiptConsistencyDigest,x.receiptConsistencyDigest);assert.deepEqual(replay.claims,x.claims);
  assert.equal(x.currentAuthorization,null);for(const k of ['independentProvidersVerified','finalityVerified','holderEligibilityVerified','feeFundingVerified','capitalOriginVerified','prePostBalancesVerified','globalSolvencyVerified','executionAuthorized','fullCounterReadiness'])assert.equal(x[k],false);
  assert.equal(x.total,undefined);assert.equal(x.directClaimObserved,undefined);
 }
 const f=fixture(1),{claims,...base}=f.p;await assert.rejects(inspectCounterClaimReceipt(f.clients,{...base,...claims[0]}));
 f.tx.input=encodeFunctionData({abi:parseAbi(['function claim(uint256,address)']),functionName:'claim',args:[1n,f.p.recipient]});await assert.rejects(inspectCounterBatchClaimReceipt(f.clients,f.p));
});
test('all bounded dense entry policies and consistent repeated asset pins validate before any RPC',async()=>{
 let calls=0;const clients=[{getBlockNumber:async()=>{calls++;return 100n;}},{}];
 for(const change of [p=>p.chainId=56,p=>p.claims=[],p=>p.claims=Array(2),p=>p.claims=Array(33).fill(p.claims[0]),p=>p.claims.reverse(),p=>p.claims[1].round='1',p=>p.claims[1].round='02',p=>p.claims[1].amount='0',p=>p.claims[1].amount=9,p=>p.claims[1].amount=(1n<<256n).toString(),p=>p.claims[1].extra=true,p=>p.claims[1].asset=p.launchToken,p=>{p.claims[1].asset=p.claims[0].asset;p.claims[1].assetCodeHash=h(1);},p=>p.extra=true]){
  const p=fixture().p;change(p);await assert.rejects(inspectCounterBatchClaimReceipt(clients,p));
 }
 const f=fixture(11);f.p.claims.forEach((q,i)=>q.asset=a(20+i));await assert.rejects(inspectCounterBatchClaimReceipt(clients,f.p));assert.equal(calls,0);
});
test('omitted entries, later wrong payouts/state and canonical receipt/transaction mutations fail closed',async()=>{
 for(const change of [f=>f.p.claims.pop(),f=>f.tx.input+='00',f=>f.tx.value=1n,f=>f.tx.from=a(8),f=>f.tx.blockHash=h(81),f=>f.r.logs.pop(),f=>f.r.logs.push({...f.r.logs[3]}),f=>f.r.logs[2].data=h(99),f=>f.r.logs[3].topics[2]=h(7),f=>f.r.logs[3].topics[3]=h(20),f=>f.r.logs[2].topics[1]=h(7),f=>f.r.logs[3].data+='00',f=>f.r.logs[2].removed=true,f=>f.r.logs[3].logIndex++,f=>f.r.logs[0].transactionIndex=1,f=>f.r.logs.reverse(),f=>f.rounds[1][0]=a(20),f=>f.rounds[1][1]=8n,f=>f.rounds[1][2]=99n,f=>f.rounds[1][3]=h(0),f=>f.clients[1].getBlockNumber=async()=>111n,f=>f.block.transactions=[h(8)],f=>f.clients[0].getCode=async q=>q.address===a(21)?'0x6001':code]){
  const f=fixture();change(f);await assert.rejects(inspectCounterBatchClaimReceipt(f.clients,f.p));
 }
 const f=fixture(),read=f.clients[1].readContract;f.clients[1].readContract=async q=>q.functionName==='claimable'&&q.args[0]===2n?9n:read(q);await assert.rejects(inspectCounterBatchClaimReceipt(f.clients,f.p));
});
test('one coherent receipt/header, immutable copied policy and monotonic full-read clock are required',async()=>{
 const f=fixture();let count=0;f.clients[0].getTransactionReceipt=async()=>{const r=structuredClone(f.r);if(count++)r.logs.forEach(l=>l.logIndex++);return r;};await assert.rejects(inspectCounterBatchClaimReceipt(f.clients,f.p));
 const g=fixture();let blocks=0;g.clients[1].getBlock=async()=>({...g.block,timestamp:blocks++?2n:1n});await assert.rejects(inspectCounterBatchClaimReceipt(g.clients,g.p));
 const stable=fixture();let receipts=0;stable.clients[0].getTransactionReceipt=async()=>({...structuredClone(stable.r),gasUsed:BigInt(++receipts)});assert.equal((await inspectCounterBatchClaimReceipt(stable.clients,stable.p)).claims.length,2);
 const copied=fixture();copied.clients[0].getTransaction=async()=>{copied.p.claims[1].amount='999';return copied.tx;};assert.equal((await inspectCounterBatchClaimReceipt(copied.clients,copied.p)).claims[1].amount,'9');
 const real=Date.now;try{let now=10000;Date.now=()=>now;const h=fixture();h.clients[0].getTransaction=async()=>{now=12000;return h.tx;};h.clients[0].getCode=async()=>{now=11000;return code;};await assert.rejects(inspectCounterBatchClaimReceipt(h.clients,h.p),/clock/);}finally{Date.now=real;}
});
test('one real20sec budget and failed-peer fences cover the entire batch',{timeout:25000},async()=>{
 const f=fixture(32);let release,follow=0;f.clients[1].getBlockNumber=()=>new Promise(r=>release=r);f.clients[1].getChainId=async()=>{follow++;return 97;};await assert.rejects(inspectCounterBatchClaimReceipt(f.clients,f.p),/timed out/);release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
 const g=fixture();let delayed;g.clients[0].getBlockNumber=async()=>{throw Error('peer');};g.clients[1].getBlockNumber=()=>new Promise(r=>delayed=r);g.clients[1].getChainId=async()=>{follow++;return 97;};await assert.rejects(inspectCounterBatchClaimReceipt(g.clients,g.p));delayed(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});
