import { encodeFunctionData, keccak256, parseAbi, type PublicClient, type Hex } from "viem";
import { WORK_ESCROW_READ_ABI, type WorkJobPolicy } from "@/lib/work-escrow-observation";

const RESOLVE = parseAbi(["function resolve(uint256 id,uint128 workerAmount)"]);
const DECLINE = parseAbi(["function decline(uint256 id)"]);
const WAIVE = parseAbi(["function waivePayment(uint256 id,uint256 expectedRevision)"]);
const DECLINED = keccak256(new TextEncoder().encode("JobDeclined(uint256,address)"));
const WAIVED = keccak256(new TextEncoder().encode("PaymentWaived(uint256,address,uint256)"));
const CANCEL = parseAbi(["function cancel(uint256 id)"]);
const PAY = parseAbi(["function approvePayment(uint256 id)"]);
const BATCH_PAY = parseAbi(["function approveResultsMany((uint256 id,uint256 revision,bytes32 resultHash)[] approvals)"]);
const RESULT_PAY = parseAbi(["function approveResult(uint256 id,uint256 revision,bytes32 resultHash)"]);
const APPROVED = keccak256(new TextEncoder().encode("ResultApproved(uint256,uint256,bytes32)"));
const SETTLED = keccak256(new TextEncoder().encode("JobSettled(uint256,uint256,uint256,address)"));
const TRANSFER = keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"));
const word = (v: bigint) => v.toString(16).padStart(64,"0");
const addr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v) && !/^0x0{40}$/.test(v);
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v) && !/^0x0{64}$/.test(v);
const same = (v: unknown,w: string) => typeof v === "string" && v.toLowerCase() === w;
const uint = (v: unknown,bits=256): v is bigint => typeof v === "bigint" && v >= 0n && v < 1n<<BigInt(bits);
const positive = (v: unknown,bits: number) => typeof v === "string" && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v)<1n<<BigInt(bits);
export type WorkPaymentPolicy = WorkJobPolicy & { transactionHash: Hex };
export type WorkExpiredCancellationPolicy = WorkPaymentPolicy & { caller: Hex };
export type WorkWorkerRefundPolicy = WorkPaymentPolicy & ({ refundKind: "decline" } | { refundKind: "waiver"; expectedRevision: string });
export type WorkArbitrationPolicy = WorkPaymentPolicy & { workerAmount: string };
export type WorkResultPaymentPolicy = WorkPaymentPolicy & { revision: string; resultHash: Hex };

/** Direct legacy whole-payment only. Explicit library read, never wallet/service authority. */
export async function inspectWorkPaymentReceipt(clients: readonly [PublicClient,PublicClient], input: WorkPaymentPolicy) {
  return inspectPayment(clients,input);
}

/** Separate opt-in direct result-bound whole payment. Legacy receipt shape stays exact. */
export async function inspectWorkResultPaymentReceipt(clients: readonly [PublicClient,PublicClient], input: WorkResultPaymentPolicy) {
  const q = structuredClone(input);
  if (!q || !positive(q.revision,256) || BigInt(q.revision)>32n || !hash(q.resultHash)) throw Error("Invalid result payment binding");
  const { revision,resultHash,...policy } = q;
  return inspectPayment(clients,policy,{revision,resultHash});
}

/** Direct original-client cancellation only; expired third-party refunds stay unsupported. */
export async function inspectWorkCancellationReceipt(clients: readonly [PublicClient,PublicClient], input: WorkPaymentPolicy) {
  return inspectPayment(clients,input,undefined,true);
}

/** Separate expired-job refund by a direct caller other than the original client. */
export async function inspectWorkExpiredCancellationReceipt(clients: readonly [PublicClient,PublicClient], input: WorkExpiredCancellationPolicy) {
  const q = structuredClone(input);
  if (!q || !addr(q.caller) || q.caller===q.client || q.caller===q.escrow) throw Error("Invalid expired cancellation caller");
  const { caller,...policy } = q;
  return inspectPayment(clients,policy,undefined,true,caller);
}

/** Explicit worker decline or revision-bound voluntary waiver, never a delivery verdict. */
export async function inspectWorkWorkerRefundReceipt(clients: readonly [PublicClient,PublicClient], input: WorkWorkerRefundPolicy) {
  const q = structuredClone(input) as WorkPaymentPolicy & {refundKind:unknown;expectedRevision?:unknown};
  if (!q || (q.refundKind!=="decline" && q.refundKind!=="waiver")) throw Error("Invalid worker refund kind");
  const kind=q.refundKind;
  if (kind==="decline" ? Object.hasOwn(q,"expectedRevision") : typeof q.expectedRevision!=="string" || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(q.expectedRevision)) throw Error("Invalid worker refund revision");
  const {refundKind,expectedRevision,...policy}=q;
  return inspectPayment(clients,policy,undefined,true,undefined,{kind,revision:kind==="decline"?"0":expectedRevision as string});
}

/** Direct fixed-arbitrator settlement observation, never a fairness or legal verdict. */
export async function inspectWorkArbitrationReceipt(clients: readonly [PublicClient,PublicClient], input: WorkArbitrationPolicy) {
  const q = structuredClone(input);
  if (!q || typeof q.workerAmount!=="string" || !/^(?:0|[1-9][0-9]{0,38})$/.test(q.workerAmount) || BigInt(q.workerAmount)>=1n<<128n) throw Error("Invalid arbitrated worker amount");
  const {workerAmount,...policy}=q;
  return inspectPayment(clients,policy,undefined,false,undefined,undefined,workerAmount);
}

export type WorkBatchResultPaymentPolicy = WorkPaymentPolicy & { approvals: readonly {id:string;revision:string;resultHash:Hex}[] };
/** One selected job in an exactly bound direct batch; other jobs are NOT validated. */
export async function inspectWorkBatchResultPaymentReceipt(clients: readonly [PublicClient,PublicClient], input: WorkBatchResultPaymentPolicy) {
  const {policy,result}=batchSelection(input);
  return inspectPayment(clients,policy,result);
}

function batchSelection(input: WorkBatchResultPaymentPolicy) {
  const q=structuredClone(input);
  if(!q || !Array.isArray(q.approvals) || q.approvals.length<1 || q.approvals.length>16)throw Error("Invalid result batch");
  let previous=0n;
  for(const a of q.approvals){
    if(!a || Object.keys(a).sort().join()!=="id,resultHash,revision" || !positive(a.id,256) || BigInt(a.id)<=previous
      || !positive(a.revision,256) || BigInt(a.revision)>32n || !hash(a.resultHash))throw Error("Invalid result batch binding");
    previous=BigInt(a.id);
  }
  const index=q.approvals.findIndex(a=>a.id===q.jobId);if(index<0)throw Error("Selected job absent from batch");
  const {approvals,...policy}=q, selected=approvals[index];
  validateWorkPaymentPolicy(policy);
  return {policy,result:{revision:selected.revision,resultHash:selected.resultHash,batch:{approvals,index}}};
}

export function validateWorkPaymentPolicy(p: WorkPaymentPolicy) {
  if (!p || Object.keys(p).sort().join() !== "amount,arbitrator,asset,assetCodeHash,chainId,client,escrow,escrowCodeHash,governor,guardian,jobId,maxPerJob,termsHash,transactionHash,worker"
    || p.chainId !== 97 || ![p.escrow,p.asset,p.governor,p.guardian,p.arbitrator,p.client,p.worker].every(addr)
    || new Set([p.escrow,p.asset,p.governor,p.guardian,p.arbitrator]).size !== 5 || p.client===p.worker
    || [p.escrow,p.arbitrator].includes(p.client) || [p.escrow,p.arbitrator].includes(p.worker)
    || ![p.escrowCodeHash,p.assetCodeHash,p.termsHash,p.transactionHash].every(hash) || !positive(p.jobId,256)
    || !positive(p.amount,128) || !positive(p.maxPerJob,128) || BigInt(p.amount)>BigInt(p.maxPerJob)) throw Error("Invalid work payment policy");
}

/** All call entries, one coherent receipt, no ledger or execution authority. */
export async function inspectAllWorkBatchResultPayments(clients: readonly [PublicClient,PublicClient], inputs: readonly WorkBatchResultPaymentPolicy[]) {
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>16)throw Error("Invalid whole batch policies");
  const selections=inputs.map(input=>batchSelection(input));
  const first=selections[0],common=["chainId","escrow","escrowCodeHash","governor","guardian","arbitrator","client","transactionHash"] as const;
  const binding=(s:typeof first)=>JSON.stringify([common.map(k=>s.policy[k]),s.result.batch.approvals.map(a=>[a.id,a.revision,a.resultHash])]);
  const expected=binding(first),assets=new Map<string,string>();
  for(const [i,s]of selections.entries()){
    if(selections.length!==s.result.batch.approvals.length||s.result.batch.index!==i||binding(s)!==expected)throw Error("Incomplete or differing batch coverage");
    const assetBinding=JSON.stringify([s.policy.assetCodeHash,s.policy.maxPerJob]);
    if(assets.has(s.policy.asset)&&assets.get(s.policy.asset)!==assetBinding)throw Error("Differing batch asset policy");
    assets.set(s.policy.asset,assetBinding);
  }
  if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error("Two distinct read clients required");
  const start=Date.now();let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined,receiptDigest:Hex|undefined;
  const clock=()=>{const now=Date.now();if(ended||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>20000)throw Error("Batch observation ended, expired or clock moved backwards");last=now;return now;};
  type Receipt=Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>;
  const fingerprint=(r:Receipt)=>{
    if(!r||!Array.isArray(r.logs)||r.logs.length!==3*selections.length||!uint(r.blockNumber,64)||!Number.isSafeInteger(r.transactionIndex)||r.transactionIndex<0)throw Error("Invalid batch receipt framing");
    const hex=(v:unknown)=>{if(typeof v!=="string")throw Error("Invalid receipt field");return v.toLowerCase();};
    const logs=r.logs.map(l=>{
      if(!Array.isArray(l.topics)||l.topics.length!==3||[0,1,2].some(i=>!Object.hasOwn(l.topics,i)||typeof l.topics[i]!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(l.topics[i]))
        ||typeof l.data!=="string"||!/^0x(?:[0-9a-fA-F]{64}){1,2}$/.test(l.data)||!uint(l.blockNumber,64))throw Error("Invalid batch log framing");
      return [hex(l.address),hex(l.transactionHash),hex(l.blockHash),l.blockNumber.toString(),l.transactionIndex,l.logIndex,l.removed,l.topics.map(hex),hex(l.data)];
    });
    return keccak256(new TextEncoder().encode(JSON.stringify([hex(r.transactionHash),r.status,hex(r.blockHash),r.blockNumber.toString(),hex(r.from),hex(r.to),r.transactionIndex,logs])));
  };
  const methods=new Set(["getChainId","getBlockNumber","getBlock","getTransactionReceipt","getTransaction","getCode","readContract"]);
  const guarded=clients.map(client=>new Proxy(client,{get(target,key){const value=Reflect.get(target,key,target);
    if(typeof key!=="string"||!methods.has(key)||typeof value!=="function")return value;
    return async(...args:unknown[])=>{clock();const valueOut=await value.apply(target,args);clock();
      if(key==="getTransactionReceipt"){const digest=fingerprint(valueOut);if(receiptDigest!==undefined&&receiptDigest!==digest)throw Error("Batch receipt observations differ");receiptDigest=digest;}
      return valueOut;
    };
  }})) as [PublicClient,PublicClient];
  try{
    clock();const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Batch observation timed out")),20000);});
    return await Promise.race([(async()=>{
      const payments=await Promise.all(selections.map(s=>inspectPayment(guarded,s.policy,s.result)));clock();
      if(!receiptDigest||new Set(payments.map(p=>p.evidenceId)).size!==payments.length
        ||payments.some(p=>p.blockNumber!==payments[0].blockNumber||p.blockHash!==payments[0].blockHash||p.blockTimestamp!==payments[0].blockTimestamp))throw Error("Batch snapshots differ");
      return {chainId:97,escrow:first.policy.escrow,transactionHash:first.policy.transactionHash,payments,receiptConsistencyDigest:receiptDigest,
        allCallEntriesObserved:true,observedAtMs:clock(),source:"isolated-all-job-work-result-batch-rpc-observation",currentAuthorization:null,
        independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,partyIdentityVerified:false,workDeliveryVerified:false,
        globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false};
    })(),deadline]);
  }finally{ended=true;clearTimeout(timer);}
}

async function inspectPayment(clients: readonly [PublicClient,PublicClient], input: WorkPaymentPolicy, result?: {revision:string;resultHash:Hex;batch?:{approvals:readonly {id:string;revision:string;resultHash:Hex}[];index:number}}, cancellation=false, expiryCaller?: Hex, workerRefund?: {kind:"decline"|"waiver";revision:string}, arbitrationWorker?: string) {
  const p = structuredClone(input);
  validateWorkPaymentPolicy(p);
  if (!Array.isArray(clients) || clients.length!==2 || clients[0]===clients[1]) throw Error("Two distinct read clients required");
  const arbitration=arbitrationWorker===undefined?undefined:{worker:BigInt(arbitrationWorker),refund:BigInt(p.amount)-BigInt(arbitrationWorker)};
  if(arbitration && arbitration.refund<0n)throw Error("Arbitrated amount exceeds principal");
  const caller=arbitration?p.arbitrator:workerRefund?p.worker:expiryCaller??p.client;
  const start=Date.now(); let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
  const clock=()=>{const now=Date.now();if(ended || !Number.isSafeInteger(start) || start<0 || !Number.isSafeInteger(now) || now<last || now-start>20_000)throw Error("Payment read ended, expired or clock moved backwards");last=now;return now;};
  const action=async<T>(fn:()=>Promise<T>)=>{clock();const r=await fn();clock();return r;};
  const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
  const observe=async(c:PublicClient,head:bigint)=>{
    if(await action(()=>c.getChainId())!==97)throw Error("Wrong payment chain");
    const receipt=()=>action(()=>c.getTransactionReceipt({hash:p.transactionHash}));
    const r=await receipt();
    if(!same(r.transactionHash,p.transactionHash)||r.status!=="success"||!hash(r.blockHash)||!uint(r.blockNumber,64)||r.blockNumber===0n||head<r.blockNumber+20n
      ||!same(r.from,caller)||!same(r.to,p.escrow)||!Number.isSafeInteger(r.transactionIndex)||r.transactionIndex<0||!Array.isArray(r.logs)||r.logs.length!==(result?.batch?3*result.batch.approvals.length:arbitration?(arbitration.worker>0n&&arbitration.refund>0n?3:2):((result||workerRefund)?3:2)))throw Error("Direct confirmed whole-payment receipt required");
    const block=()=>action(()=>c.getBlock({blockNumber:r.blockNumber}));const b=await block();
    if(b.number!==r.blockNumber||!same(b.hash,r.blockHash)||!uint(b.timestamp)||b.timestamp*1000n>BigInt(clock())||!Array.isArray(b.transactions)||!same(b.transactions[r.transactionIndex],p.transactionHash))throw Error("Payment block differs");
    const tx=await action(()=>c.getTransaction({hash:p.transactionHash}));
    if(!same(tx.hash,p.transactionHash)||!same(tx.blockHash,r.blockHash)||tx.blockNumber!==r.blockNumber||tx.transactionIndex!==r.transactionIndex||tx.chainId!==97
      ||!same(tx.from,caller)||!same(tx.to,p.escrow)||tx.value!==0n||!same(tx.input,arbitration
        ? encodeFunctionData({abi:RESOLVE,functionName:"resolve",args:[BigInt(p.jobId),arbitration.worker]})
        : workerRefund
        ? (workerRefund.kind==="decline"?encodeFunctionData({abi:DECLINE,functionName:"decline",args:[BigInt(p.jobId)]}):encodeFunctionData({abi:WAIVE,functionName:"waivePayment",args:[BigInt(p.jobId),BigInt(workerRefund.revision)]}))
        : result?.batch
        ? encodeFunctionData({abi:BATCH_PAY,functionName:"approveResultsMany",args:[result.batch.approvals.map(a=>({id:BigInt(a.id),revision:BigInt(a.revision),resultHash:a.resultHash}))]})
        : result
        ? encodeFunctionData({abi:RESULT_PAY,functionName:"approveResult",args:[BigInt(p.jobId),BigInt(result.revision),result.resultHash]})
        : (cancellation?encodeFunctionData({abi:CANCEL,functionName:"cancel",args:[BigInt(p.jobId)]}):encodeFunctionData({abi:PAY,functionName:"approvePayment",args:[BigInt(p.jobId)]}))))throw Error("Direct payment transaction differs");
    for(const [address,pin]of [[p.escrow,p.escrowCodeHash],[p.asset,p.assetCodeHash]] as const){const code=await action(()=>c.getCode({address,blockNumber:r.blockNumber}));if(!code||!/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code)||keccak256(code)!==pin)throw Error("Payment runtime differs");}
    const read=(functionName:string,args:readonly unknown[]=[])=>action(()=>c.readContract({address:p.escrow,abi:WORK_ESCROW_READ_ABI,functionName,args,blockNumber:r.blockNumber} as never)) as Promise<unknown>;
    const [gov,guard,arb,pin,cap,job]=await Promise.all([read("governor"),read("guardian"),read("arbitrator"),read("assetCodeHash",[p.asset]),read("maxPerJob",[p.asset]),read("jobs",[BigInt(p.jobId)])]);
    if(!same(gov,p.governor)||!same(guard,p.guardian)||!same(arb,p.arbitrator)||pin!==p.assetCodeHash||cap!==BigInt(p.maxPerJob)
      ||!Array.isArray(job)||job.length!==8||!same(job[0],p.client)||!same(job[1],p.worker)||!same(job[2],p.asset)||job[3]!==BigInt(p.amount)
      ||!uint(job[4],64)||job[4]===0n||!uint(job[5],64)||job[5]<=job[4]||job[6]!==p.termsHash||job[7]!==4)throw Error("Settled job or policy differs");
    if(expiryCaller && b.timestamp<=job[4])throw Error("Cancellation was not after acceptance expiry");
    if(workerRefund && await read("latestResultRevision",[BigInt(p.jobId)])!==BigInt(workerRefund.revision))throw Error("Stored worker refund revision differs");
    if(result && (await read("latestResultRevision",[BigInt(p.jobId)])!==BigInt(result.revision)
      || await read("resultHashes",[BigInt(p.jobId),BigInt(result.revision)])!==result.resultHash))throw Error("Stored result binding differs");
    for(const l of r.logs){if(!same(l.transactionHash,p.transactionHash)||!same(l.blockHash,r.blockHash)||l.blockNumber!==r.blockNumber||l.transactionIndex!==r.transactionIndex
      ||l.removed!==false||!Number.isSafeInteger(l.logIndex)||l.logIndex<0||!Array.isArray(l.topics)||(result?.batch&&(l.topics.length!==3||typeof l.data!=="string"||!/^0x(?:[0-9a-fA-F]{64}){1,2}$/.test(l.data)))||[0,1,2].some(i=>!Object.hasOwn(l.topics,i)||typeof l.topics[i]!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(l.topics[i])))throw Error("Payment log binding differs");}
    const offset=result?.batch?result.batch.index*3:0;
    const transfer=r.logs[offset],settled=arbitration?r.logs[r.logs.length-1]:r.logs[offset+1];
    const topics=[TRANSFER,"0x"+"0".repeat(24)+p.escrow.slice(2),"0x"+"0".repeat(24)+(cancellation?p.client:p.worker).slice(2)];
    const settlementTopics=[SETTLED,"0x"+word(BigInt(p.jobId)),"0x"+"0".repeat(24)+caller.slice(2)];
    if(arbitration){
      const payouts=([[arbitration.worker,p.worker],[arbitration.refund,p.client]] as const).filter(([amount])=>amount>0n);
      for(let i=0;i<payouts.length;i++){
        const [amount,recipient]=payouts[i],l=r.logs[i],expected=[TRANSFER,"0x"+"0".repeat(24)+p.escrow.slice(2),"0x"+"0".repeat(24)+recipient.slice(2)];
        if(!same(l.address,p.asset)||l.topics.length!==3||l.topics.some((t,j)=>!same(t,expected[j]))||!same(l.data,"0x"+word(amount))||r.logs[i+1].logIndex!==l.logIndex+1)throw Error("Canonical arbitrated transfer differs");
      }
      if(!same(settled.address,p.escrow)||settled.topics.length!==3||settled.topics.some((t,i)=>!same(t,settlementTopics[i]))
        || !same(settled.data,"0x"+word(arbitration.worker)+word(arbitration.refund)))throw Error("Canonical arbitration settlement differs");
    }else
    if(!same(transfer.address,p.asset)||!same(settled.address,p.escrow)||transfer.topics.length!==3||settled.topics.length!==3
      ||transfer.topics.some((t,i)=>!same(t,topics[i]))||settled.topics.some((t,i)=>!same(t,settlementTopics[i]))
      ||!same(transfer.data,"0x"+word(BigInt(p.amount)))||!same(settled.data,"0x"+word(cancellation?0n:BigInt(p.amount))+word(cancellation?BigInt(p.amount):0n))||settled.logIndex!==transfer.logIndex+1)throw Error("Canonical payment events differ");
    if(result){
      const approval=r.logs[offset+2],topics=[APPROVED,"0x"+word(BigInt(p.jobId)),"0x"+word(BigInt(result.revision))];
      if(!same(approval.address,p.escrow)||approval.topics.length!==3||approval.topics.some((t,i)=>!same(t,topics[i]))
        || !same(approval.data,result.resultHash)||approval.logIndex!==settled.logIndex+1)throw Error("Canonical result approval differs");
    }
    if(workerRefund){
      const refunded=r.logs[2],topics=[workerRefund.kind==="decline"?DECLINED:WAIVED,"0x"+word(BigInt(p.jobId)),"0x"+"0".repeat(24)+p.worker.slice(2)];
      if(!same(refunded.address,p.escrow)||refunded.topics.length!==3||refunded.topics.some((t,i)=>!same(t,topics[i]))
        || !same(refunded.data,workerRefund.kind==="decline"?"0x":"0x"+word(BigInt(workerRefund.revision)))||refunded.logIndex!==settled.logIndex+1)throw Error("Canonical worker refund differs");
    }
    const again=await receipt(),after=await block();
    if(!Array.isArray(again.logs)||again.logs.some(l=>!Array.isArray(l.topics)||l.topics.length!==3||[0,1,2].some(i=>!Object.hasOwn(l.topics,i))))throw Error("Payment reread has missing own topics");
    const selected=(v:typeof r)=>({hash:v.transactionHash,status:v.status,block:v.blockNumber,blockHash:v.blockHash,to:v.to,from:v.from,index:v.transactionIndex,logs:v.logs});
    if(stringify(selected(again))!==stringify(selected(r))||after.number!==b.number||after.hash!==b.hash||after.timestamp!==b.timestamp||!same(after.transactions[r.transactionIndex],p.transactionHash)||await action(()=>c.getChainId())!==97)throw Error("Payment observation changed");
    return {...(workerRefund?{workerRefund:{kind:workerRefund.kind,revision:workerRefund.kind==="waiver"?workerRefund.revision:null}}:{}),...(expiryCaller?{cancellationCaller:expiryCaller}:{}),...(result?{approvedResult:{revision:result.revision,resultHash:result.resultHash}}:{}),chainId:97,escrow:p.escrow,asset:p.asset,client:p.client,worker:p.worker,jobId:p.jobId,termsHash:p.termsHash,
      workerPaid:arbitration?arbitration.worker.toString():cancellation?"0":p.amount,clientRefund:arbitration?arbitration.refund.toString():cancellation?p.amount:"0",transactionHash:p.transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash,blockTimestamp:b.timestamp.toString(),settlementLogIndex:settled.logIndex,
      evidenceId:`97:${p.escrow}:${p.transactionHash}:${settled.logIndex}`};
  };
  try {clock();return await Promise.race([(async()=>{
    const heads=await Promise.all(clients.map(c=>action(()=>c.getBlockNumber({cacheTime:0}))));
    if(heads.some(h=>!uint(h,64)||h<21n)||(heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n)throw Error("Payment heads differ");
    const head=heads[0]<heads[1]?heads[0]:heads[1],results=await Promise.all(clients.map(c=>observe(c,head)));
    if(stringify(results[0])!==stringify(results[1]))throw Error("Payment providers disagree");
    return {...results[0],observedAtMs:clock(),source:result?.batch?"isolated-selected-batch-work-result-payment-rpc-observation":arbitration?"isolated-direct-work-arbitration-rpc-observation":workerRefund?"isolated-worker-work-refund-rpc-observation":expiryCaller?"isolated-expired-work-cancellation-rpc-observation":cancellation?"isolated-direct-work-cancellation-rpc-observation":result?"isolated-direct-work-result-payment-rpc-observation":"isolated-direct-work-payment-rpc-observation",...(result?.batch?{selectedBatchResultPaymentObserved:true,batchJobCount:result.batch.approvals.length,batchJobIndex:result.batch.index,otherBatchJobsVerified:false}:arbitration?{directArbitrationObserved:true,disputeFairnessVerified:false}:workerRefund?{directWorkerRefundObserved:true}:cancellation?{directCancellationObserved:true}:{directPaymentObserved:true}),currentAuthorization:null,
      independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,partyIdentityVerified:false,workDeliveryVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false};
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Payment observation timed out")),20_000);})]);}
  finally{ended=true;clearTimeout(timer);}
}
