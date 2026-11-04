import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, keccak256, parseAbi } from 'viem';
import { inspectCounterClaimReceipt } from '../../lib/counter-claim-receipt.ts';
const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'), h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const sig=s=>keccak256(new TextEncoder().encode(s)), code='0x6000';
function fixture(){
 const p={chainId:97,escrow:a(1),escrowCodeHash:keccak256(code),governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:keccak256(code),asset:a(5),assetCodeHash:keccak256(code),recipient:a(6),caller:a(7),round:'1',amount:'8',transactionHash:h(9)};
 const binding={blockNumber:80n,blockHash:h(80),transactionHash:h(9),transactionIndex:0,removed:false};
 const r={...binding,status:'success',from:p.caller,to:p.escrow,logs:[
  {...binding,address:p.asset,topics:[sig('Transfer(address,address,uint256)'),h(1),h(6)],data:h(8),logIndex:4},
  {...binding,address:p.escrow,topics:[sig('Claimed(uint256,address,address,uint256)'),h(1),h(6),h(5)],data:h(8),logIndex:5}]};
 const tx={hash:h(9),blockNumber:80n,blockHash:h(80),transactionIndex:0,chainId:97,from:p.caller,to:p.escrow,value:0n,
  input:encodeFunctionData({abi:parseAbi(['function claim(uint256,address)']),functionName:'claim',args:[1n,p.recipient]})};
 const block={number:80n,hash:h(80),timestamp:1n,transactions:[h(9)]};
 const state={governor:p.governor,guardian:p.guardian,launchToken:p.launchToken,assetCodeHash:p.assetCodeHash,rounds:[p.asset,33n,25n,h(33)],claimable:0n};
 const clients=[1,2].map(marker=>({marker,getBlockNumber:async function(){assert.ok(this.marker);return 100n;},getChainId:async()=>97,
  getTransactionReceipt:async()=>structuredClone(r),getTransaction:async()=>structuredClone(tx),getBlock:async q=>{assert.equal(q.blockNumber,80n);return structuredClone(block);},
  getCode:async q=>{assert.equal(q.blockNumber,80n);return code;},readContract:async q=>{assert.equal(q.blockNumber,80n);return structuredClone(state[q.functionName]);}}));
 return {p,r,tx,block,state,clients};
}
test('direct relayed Counter claim binds recipient/amount/round/receipt and stable evidence without authority',async()=>{
 const f=fixture(), x=await inspectCounterClaimReceipt(f.clients,f.p);
 assert.equal(x.amount,'8');assert.equal(x.recipient,f.p.recipient);assert.equal(x.caller,f.p.caller);assert.equal(x.claimLogIndex,5);
 assert.equal(x.roundFunded,'33');assert.equal(x.roundRemainingAtBlock,'25');assert.equal(x.directClaimObserved,true);
 assert.equal(x.evidenceId,`97:${f.p.escrow}:${f.p.transactionHash}:5`);assert.equal((await inspectCounterClaimReceipt(f.clients,f.p)).evidenceId,x.evidenceId);
 assert.equal(x.currentAuthorization,null);for(const k of ['independentProvidersVerified','finalityVerified','holderEligibilityVerified','feeFundingVerified','capitalOriginVerified','prePostBalancesVerified','globalSolvencyVerified','executionAuthorized','fullCounterReadiness'])assert.equal(x[k],false);
});
test('strict policy preflight rejects unsafe identities/amounts/mainnet before any RPC',async()=>{
 let reads=0;const c={getBlockNumber:async()=>{reads++;return 100n;}};
 for(const patch of [{chainId:56},{round:'01'},{round:1},{amount:'0'},{amount:(1n<<256n).toString()},{governor:a(3)},{asset:a(4)},{recipient:a(1)},{caller:a(1)},{transactionHash:h(0)},{assetCodeHash:'0x6000'},{extra:true}])await assert.rejects(inspectCounterClaimReceipt([c,{}],{...fixture().p,...patch}));
 await assert.rejects(inspectCounterClaimReceipt([c,c],fixture().p));assert.equal(reads,0);
});
test('direct binding rejects batch/outer calls, canonical-log and receipt-height state mutations',async()=>{
 const changes=[f=>f.r.status='reverted',f=>f.r.from=a(8),f=>f.r.to=a(8),f=>f.r.transactionHash=h(8),f=>f.r.transactionIndex=1,f=>f.r.blockNumber=81n,
  f=>f.tx.chainId=56,f=>f.tx.from=a(8),f=>f.tx.to=a(8),f=>f.tx.value=1n,f=>f.tx.input+='00',f=>f.tx.blockHash=h(81),f=>f.tx.transactionIndex=1,
  f=>f.tx.input=encodeFunctionData({abi:parseAbi(['function claimMany(uint256[],address)']),functionName:'claimMany',args:[[1n],f.p.recipient]}),
  f=>f.r.logs.push({...f.r.logs[1]}),f=>f.r.logs.pop(),f=>f.r.logs.reverse(),f=>f.r.logs[0].topics[2]=h(7),f=>f.r.logs[0].address=a(8),f=>f.r.logs[0].data=h(7),
  f=>f.r.logs[1].topics[1]=h(2),f=>f.r.logs[1].topics[2]=h(7),f=>f.r.logs[1].topics[3]=h(6),f=>f.r.logs[1].topics.push(h(1)),f=>f.r.logs[1].data+='00',
  f=>f.r.logs[1].removed=true,f=>f.r.logs[1].logIndex=6,f=>f.r.logs[0].blockHash=h(81),f=>f.r.logs[1].transactionHash=h(8),f=>f.r.logs[0].transactionIndex=1,
  f=>f.state.governor=a(8),f=>f.state.assetCodeHash=h(8),f=>f.state.claimable=8n,f=>f.state.rounds[0]=a(8),f=>f.state.rounds[1]=7n,f=>f.state.rounds[2]=26n,f=>f.state.rounds[3]=h(0),
  f=>f.block.timestamp=1n<<255n,f=>f.block.transactions=[h(8)],f=>f.clients[1].getCode=async()=>undefined,f=>f.clients[1].getBlockNumber=async()=>111n];
 for(const change of changes){const f=fixture();change(f);await assert.rejects(inspectCounterClaimReceipt(f.clients,f.p));}
});
test('receipt/header rereads, peer disagreements and intermediate backwards clocks reject',async()=>{
 for(const kind of ['receipt','header','peer']){const f=fixture();let reads=0;
  if(kind==='receipt')f.clients[0].getTransactionReceipt=async()=>{const r=structuredClone(f.r);if(reads++){r.logs[0].logIndex++;r.logs[1].logIndex++;}return r;};
  if(kind==='header')f.clients[1].getBlock=async()=>({...f.block,timestamp:reads++?2n:1n});
  if(kind==='peer')f.clients[1].readContract=async q=>q.functionName==='rounds'?[f.p.asset,34n,25n,h(33)]:f.state[q.functionName];
  await assert.rejects(inspectCounterClaimReceipt(f.clients,f.p));
 }
 const original=Date.now;try{const f=fixture();let now=10000;Date.now=()=>now;
  f.clients[0].getTransaction=async()=>{now=12000;return f.tx;};f.clients[0].getCode=async()=>{now=11000;return code;};await assert.rejects(inspectCounterClaimReceipt(f.clients,f.p),/clock/);
 }finally{Date.now=original;}
});
test('real shared deadline and failed peers fence late follow-on reads',{timeout:25000},async()=>{
 const f=fixture();let release,follow=0;f.clients[1].getBlockNumber=()=>new Promise(r=>release=r);f.clients[1].getChainId=async()=>{follow++;return 97;};
 await assert.rejects(inspectCounterClaimReceipt(f.clients,f.p),/timed out/);release(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
 const g=fixture();let delayed;g.clients[0].getBlockNumber=async()=>{throw Error('peer');};g.clients[1].getBlockNumber=()=>new Promise(r=>delayed=r);g.clients[1].getChainId=async()=>{follow++;return 97;};
 await assert.rejects(inspectCounterClaimReceipt(g.clients,g.p));delayed(100n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});

// Adapter arrays may be sparse even though JSON arrays cannot encode holes.
test('every claim topic slot must be an own value on initial receipts and rereads',async()=>{
 const rejected=[], accepted=[];
 for(const stage of ['initial','reread'])for(const peer of [0,1])for(const inherited of [false,true]){
  const shape=fixture();
  for(let log=0;log<shape.r.logs.length;log++)for(let slot=0;slot<shape.r.logs[log].topics.length;slot++){
   const f=fixture();let reads=0;
   f.clients[peer].getTransactionReceipt=async()=>{
    const r=structuredClone(f.r);
    if(stage==='initial'||reads>0){
     const topics=r.logs[log].topics,value=topics[slot];delete topics[slot];
     if(inherited){const proto=Object.create(Array.prototype);proto[slot]=value;Object.setPrototypeOf(topics,proto);}
    }
    reads++;return r;
   };
   const label=`${stage}/${peer}/${inherited?'inherited':'hole'}/${log}/${slot}`;
   try{await inspectCounterClaimReceipt(f.clients,f.p);accepted.push(label);}catch{rejected.push(label);}
  }
 }
 assert.ok(rejected.length>0);assert.deepEqual(accepted,[],'No absent topic slot may produce an observation');
 const f=fixture();assert.equal((await inspectCounterClaimReceipt(f.clients,f.p)).executionAuthorized,false);
});
