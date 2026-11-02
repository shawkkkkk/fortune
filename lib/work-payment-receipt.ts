import { encodeFunctionData, keccak256, parseAbi, type PublicClient, type Hex } from "viem";
import { WORK_ESCROW_READ_ABI, type WorkJobPolicy } from "@/lib/work-escrow-observation";

const CANCEL = parseAbi(["function cancel(uint256 id)"]);
const PAY = parseAbi(["function approvePayment(uint256 id)"]);
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

async function inspectPayment(clients: readonly [PublicClient,PublicClient], input: WorkPaymentPolicy, result?: {revision:string;resultHash:Hex}, cancellation=false) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== "amount,arbitrator,asset,assetCodeHash,chainId,client,escrow,escrowCodeHash,governor,guardian,jobId,maxPerJob,termsHash,transactionHash,worker"
    || p.chainId !== 97 || ![p.escrow,p.asset,p.governor,p.guardian,p.arbitrator,p.client,p.worker].every(addr)
    || new Set([p.escrow,p.asset,p.governor,p.guardian,p.arbitrator]).size !== 5 || p.client===p.worker
    || [p.escrow,p.arbitrator].includes(p.client) || [p.escrow,p.arbitrator].includes(p.worker)
    || ![p.escrowCodeHash,p.assetCodeHash,p.termsHash,p.transactionHash].every(hash) || !positive(p.jobId,256)
    || !positive(p.amount,128) || !positive(p.maxPerJob,128) || BigInt(p.amount)>BigInt(p.maxPerJob)) throw Error("Invalid work payment policy");
  if (!Array.isArray(clients) || clients.length!==2 || clients[0]===clients[1]) throw Error("Two distinct read clients required");
  const start=Date.now(); let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
  const clock=()=>{const now=Date.now();if(ended || !Number.isSafeInteger(start) || start<0 || !Number.isSafeInteger(now) || now<last || now-start>20_000)throw Error("Payment read ended, expired or clock moved backwards");last=now;return now;};
  const action=async<T>(fn:()=>Promise<T>)=>{clock();const r=await fn();clock();return r;};
  const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
  const observe=async(c:PublicClient,head:bigint)=>{
    if(await action(()=>c.getChainId())!==97)throw Error("Wrong payment chain");
    const receipt=()=>action(()=>c.getTransactionReceipt({hash:p.transactionHash}));
    const r=await receipt();
    if(!same(r.transactionHash,p.transactionHash)||r.status!=="success"||!hash(r.blockHash)||!uint(r.blockNumber,64)||r.blockNumber===0n||head<r.blockNumber+20n
      ||!same(r.from,p.client)||!same(r.to,p.escrow)||!Number.isSafeInteger(r.transactionIndex)||r.transactionIndex<0||!Array.isArray(r.logs)||r.logs.length!==(result?3:2))throw Error("Direct confirmed whole-payment receipt required");
    const block=()=>action(()=>c.getBlock({blockNumber:r.blockNumber}));const b=await block();
    if(b.number!==r.blockNumber||!same(b.hash,r.blockHash)||!uint(b.timestamp)||b.timestamp*1000n>BigInt(clock())||!Array.isArray(b.transactions)||!same(b.transactions[r.transactionIndex],p.transactionHash))throw Error("Payment block differs");
    const tx=await action(()=>c.getTransaction({hash:p.transactionHash}));
    if(!same(tx.hash,p.transactionHash)||!same(tx.blockHash,r.blockHash)||tx.blockNumber!==r.blockNumber||tx.transactionIndex!==r.transactionIndex||tx.chainId!==97
      ||!same(tx.from,p.client)||!same(tx.to,p.escrow)||tx.value!==0n||!same(tx.input,result
        ? encodeFunctionData({abi:RESULT_PAY,functionName:"approveResult",args:[BigInt(p.jobId),BigInt(result.revision),result.resultHash]})
        : (cancellation?encodeFunctionData({abi:CANCEL,functionName:"cancel",args:[BigInt(p.jobId)]}):encodeFunctionData({abi:PAY,functionName:"approvePayment",args:[BigInt(p.jobId)]}))))throw Error("Direct payment transaction differs");
    for(const [address,pin]of [[p.escrow,p.escrowCodeHash],[p.asset,p.assetCodeHash]] as const){const code=await action(()=>c.getCode({address,blockNumber:r.blockNumber}));if(!code||!/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code)||keccak256(code)!==pin)throw Error("Payment runtime differs");}
    const read=(functionName:string,args:readonly unknown[]=[])=>action(()=>c.readContract({address:p.escrow,abi:WORK_ESCROW_READ_ABI,functionName,args,blockNumber:r.blockNumber} as never)) as Promise<unknown>;
    const [gov,guard,arb,pin,cap,job]=await Promise.all([read("governor"),read("guardian"),read("arbitrator"),read("assetCodeHash",[p.asset]),read("maxPerJob",[p.asset]),read("jobs",[BigInt(p.jobId)])]);
    if(!same(gov,p.governor)||!same(guard,p.guardian)||!same(arb,p.arbitrator)||pin!==p.assetCodeHash||cap!==BigInt(p.maxPerJob)
      ||!Array.isArray(job)||job.length!==8||!same(job[0],p.client)||!same(job[1],p.worker)||!same(job[2],p.asset)||job[3]!==BigInt(p.amount)
      ||!uint(job[4],64)||job[4]===0n||!uint(job[5],64)||job[5]<=job[4]||job[6]!==p.termsHash||job[7]!==4)throw Error("Settled job or policy differs");
    if(result && (await read("latestResultRevision",[BigInt(p.jobId)])!==BigInt(result.revision)
      || await read("resultHashes",[BigInt(p.jobId),BigInt(result.revision)])!==result.resultHash))throw Error("Stored result binding differs");
    for(const l of r.logs){if(!same(l.transactionHash,p.transactionHash)||!same(l.blockHash,r.blockHash)||l.blockNumber!==r.blockNumber||l.transactionIndex!==r.transactionIndex
      ||l.removed!==false||!Number.isSafeInteger(l.logIndex)||l.logIndex<0||!Array.isArray(l.topics)||l.topics.some(t=>typeof t!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(t)))throw Error("Payment log binding differs");}
    const [transfer,settled]=r.logs;
    const topics=[TRANSFER,"0x"+"0".repeat(24)+p.escrow.slice(2),"0x"+"0".repeat(24)+(cancellation?p.client:p.worker).slice(2)];
    const settlementTopics=[SETTLED,"0x"+word(BigInt(p.jobId)),"0x"+"0".repeat(24)+p.client.slice(2)];
    if(!same(transfer.address,p.asset)||!same(settled.address,p.escrow)||transfer.topics.length!==3||settled.topics.length!==3
      ||transfer.topics.some((t,i)=>!same(t,topics[i]))||settled.topics.some((t,i)=>!same(t,settlementTopics[i]))
      ||!same(transfer.data,"0x"+word(BigInt(p.amount)))||!same(settled.data,"0x"+word(cancellation?0n:BigInt(p.amount))+word(cancellation?BigInt(p.amount):0n))||settled.logIndex!==transfer.logIndex+1)throw Error("Canonical payment events differ");
    if(result){
      const approval=r.logs[2],topics=[APPROVED,"0x"+word(BigInt(p.jobId)),"0x"+word(BigInt(result.revision))];
      if(!same(approval.address,p.escrow)||approval.topics.length!==3||approval.topics.some((t,i)=>!same(t,topics[i]))
        || !same(approval.data,result.resultHash)||approval.logIndex!==settled.logIndex+1)throw Error("Canonical result approval differs");
    }
    const again=await receipt(),after=await block();
    const selected=(v:typeof r)=>({hash:v.transactionHash,status:v.status,block:v.blockNumber,blockHash:v.blockHash,to:v.to,from:v.from,index:v.transactionIndex,logs:v.logs});
    if(stringify(selected(again))!==stringify(selected(r))||after.number!==b.number||after.hash!==b.hash||after.timestamp!==b.timestamp||!same(after.transactions[r.transactionIndex],p.transactionHash)||await action(()=>c.getChainId())!==97)throw Error("Payment observation changed");
    return {...(result?{approvedResult:{revision:result.revision,resultHash:result.resultHash}}:{}),chainId:97,escrow:p.escrow,asset:p.asset,client:p.client,worker:p.worker,jobId:p.jobId,termsHash:p.termsHash,
      workerPaid:cancellation?"0":p.amount,clientRefund:cancellation?p.amount:"0",transactionHash:p.transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash,blockTimestamp:b.timestamp.toString(),settlementLogIndex:settled.logIndex,
      evidenceId:`97:${p.escrow}:${p.transactionHash}:${settled.logIndex}`};
  };
  try {clock();return await Promise.race([(async()=>{
    const heads=await Promise.all(clients.map(c=>action(()=>c.getBlockNumber({cacheTime:0}))));
    if(heads.some(h=>!uint(h,64)||h<21n)||(heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n)throw Error("Payment heads differ");
    const head=heads[0]<heads[1]?heads[0]:heads[1],results=await Promise.all(clients.map(c=>observe(c,head)));
    if(stringify(results[0])!==stringify(results[1]))throw Error("Payment providers disagree");
    return {...results[0],observedAtMs:clock(),source:cancellation?"isolated-direct-work-cancellation-rpc-observation":result?"isolated-direct-work-result-payment-rpc-observation":"isolated-direct-work-payment-rpc-observation",...(cancellation?{directCancellationObserved:true}:{directPaymentObserved:true}),currentAuthorization:null,
      independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,partyIdentityVerified:false,workDeliveryVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false};
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Payment observation timed out")),20_000);})]);}
  finally{ended=true;clearTimeout(timer);}
}
