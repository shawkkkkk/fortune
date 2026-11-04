import {keccak256,type Hex,type PublicClient} from 'viem';
import {inspectWorkBatchWaiverReceipt,validateWorkPaymentPolicy,type WorkBatchWaiverPolicy} from '@/lib/work-payment-receipt';

/** Complete ordered coverage of one direct batch, never a consumed ledger or execution permission. */
export async function inspectAllWorkBatchWaivers(clients:readonly [PublicClient,PublicClient],inputs:readonly WorkBatchWaiverPolicy[]){
 if(!Array.isArray(inputs)||inputs.length<1||inputs.length>16)throw Error('Invalid whole waiver policies');
 const policies:WorkBatchWaiverPolicy[]=[];
 for(let i=0;i<inputs.length;i++){
  if(!Object.hasOwn(inputs,i))throw Error('Missing own waiver policy');
  const q=structuredClone(inputs[i]);
  if(!q||!Array.isArray(q.waivers)||q.waivers.length!==inputs.length)throw Error('Incomplete waiver coverage');
  const {waivers,...policy}=q;validateWorkPaymentPolicy(policy);let previous=0n;
  for(let j=0;j<waivers.length;j++){
   const w=waivers[j];if(!Object.hasOwn(waivers,j)||!w||Object.keys(w).sort().join()!=='expectedRevision,id'
    ||typeof w.id!=='string'||! /^[1-9][0-9]{0,77}$/.test(w.id)||BigInt(w.id)>=1n<<256n||BigInt(w.id)<=previous
    ||typeof w.expectedRevision!=='string'||! /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(w.expectedRevision))throw Error('Invalid waiver binding');
   previous=BigInt(w.id);
  }
  if(waivers[i].id!==policy.jobId)throw Error('Waiver policies must cover every ordered entry');policies.push(q);
 }
 const first=policies[0],common=['chainId','escrow','escrowCodeHash','governor','guardian','arbitrator','worker','transactionHash'] as const;
 const binding=(p:WorkBatchWaiverPolicy)=>JSON.stringify([common.map(k=>p[k]),p.waivers.map(w=>[w.id,w.expectedRevision])]);
 const expected=binding(first),assets=new Map<string,string>();
 for(const p of policies){if(binding(p)!==expected)throw Error('Differing waiver batch policy');
  const pin=JSON.stringify([p.assetCodeHash,p.maxPerJob]);if(assets.has(p.asset)&&assets.get(p.asset)!==pin)throw Error('Differing waiver asset policy');assets.set(p.asset,pin);
 }
 if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Two distinct read clients required');
 const start=Date.now();let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined,digest:Hex|undefined;
 const clock=()=>{const now=Date.now();if(ended||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>20000)throw Error('Whole waiver read ended, expired or clock reversed');last=now;return now;};
 type Receipt=Awaited<ReturnType<PublicClient['getTransactionReceipt']>>;
 const hex=(v:unknown)=>{if(typeof v!=='string')throw Error('Invalid receipt field');return v.toLowerCase();};
 const uint=(v:unknown):v is bigint=>typeof v==='bigint'&&v>=0n&&v<1n<<64n;
 const fingerprint=(r:Receipt)=>{
  if(!r||!Array.isArray(r.logs)||r.logs.length!==3*policies.length||!uint(r.blockNumber)||!Number.isSafeInteger(r.transactionIndex)||r.transactionIndex<0)throw Error('Invalid waiver receipt framing');
  const logs=[];for(let i=0;i<r.logs.length;i++){
   const l=r.logs[i];if(!Object.hasOwn(r.logs,i)||!l||!Array.isArray(l.topics)||l.topics.length!==3
    ||[0,1,2].some(j=>!Object.hasOwn(l.topics,j)||typeof l.topics[j]!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(l.topics[j]))
    ||typeof l.data!=='string'||!/^0x(?:[0-9a-fA-F]{64}){1,2}$/.test(l.data)||!uint(l.blockNumber))throw Error('Invalid waiver log framing');
   logs.push([hex(l.address),hex(l.transactionHash),hex(l.blockHash),l.blockNumber.toString(),l.transactionIndex,l.logIndex,l.removed,l.topics.map(hex),hex(l.data)]);
  }
  return keccak256(new TextEncoder().encode(JSON.stringify([hex(r.transactionHash),r.status,hex(r.blockHash),r.blockNumber.toString(),hex(r.from),hex(r.to),r.transactionIndex,logs])));
 };
 const methods=new Set(['getChainId','getBlockNumber','getBlock','getTransactionReceipt','getTransaction','getCode','readContract']);
 const guarded=clients.map(client=>new Proxy(client,{get(target,key){const value=Reflect.get(target,key,target);if(typeof key!=='string'||!methods.has(key)||typeof value!=='function')return value;
  return async(...args:unknown[])=>{clock();const out=await value.apply(target,args);clock();if(key==='getTransactionReceipt'){
   const next=fingerprint(out);if(digest!==undefined&&digest!==next)throw Error('Waiver receipt observations differ');digest=next;
  }return out;};
 }})) as [PublicClient,PublicClient];
 try{clock();const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Whole waiver observation timed out')),20000);});
  return await Promise.race([(async()=>{
   const refunds=await Promise.all(policies.map(p=>inspectWorkBatchWaiverReceipt(guarded,p)));clock();
   if(!digest||new Set(refunds.map(r=>r.evidenceId)).size!==refunds.length||refunds.some(r=>r.blockNumber!==refunds[0].blockNumber||r.blockHash!==refunds[0].blockHash||r.blockTimestamp!==refunds[0].blockTimestamp))throw Error('Waiver snapshots differ');
   return {chainId:97,escrow:first.escrow,transactionHash:first.transactionHash,refunds,receiptConsistencyDigest:digest,allCallEntriesObserved:true,
    observedAtMs:clock(),source:'isolated-all-job-work-waiver-batch-rpc-observation',currentAuthorization:null,
    independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,partyIdentityVerified:false,workDeliveryVerified:false,
    globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false};
  })(),deadline]);
 }finally{ended=true;clearTimeout(timer);}
}
