import {encodeFunctionData,keccak256,parseAbi,type Hex,type PublicClient} from "viem";
import {WORK_ESCROW_READ_ABI} from "@/lib/work-escrow-observation";
import {validateWorkPaymentPolicy,type WorkPaymentPolicy} from "@/lib/work-payment-receipt";
const ABI=parseAbi([
 "function fund(address worker,address token,uint128 amount,bytes32 termsHash,uint64 acceptBy,uint64 deliverBy)",
 "function fundWithId(bytes32 fundingId,address worker,address token,uint128 amount,bytes32 termsHash,uint64 acceptBy,uint64 deliverBy)",
 "function fundingJobs(address,bytes32) view returns(uint256)",
]);
const sig=(s:string)=>keccak256(new TextEncoder().encode(s));
const TRANSFER=sig("Transfer(address,address,uint256)"),FUNDED=sig("JobFunded(uint256,address,address,address,uint256,bytes32,uint64,uint64)"),BOUND=sig("FundingBound(uint256,address,bytes32)");
const word=(v:bigint)=>v.toString(16).padStart(64,"0");
const same=(v:unknown,w:string)=>typeof v==="string"&&v.toLowerCase()===w;
const uint=(v:unknown,bits=256):v is bigint=>typeof v==="bigint"&&v>=0n&&v<1n<<BigInt(bits);
const hash=(v:unknown):v is Hex=>typeof v==="string"&&/^0x[0-9a-f]{64}$/.test(v)&&!/^0x0+$/.test(v);
const positive=(v:unknown)=>typeof v==="string"&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<1n<<64n;
export type WorkFundingPolicy=WorkPaymentPolicy & {acceptBy:string;deliverBy:string;fundingId:Hex|null};
/** Historical direct funding only. No current consent, capital-origin or execution authority. */
export async function inspectWorkFundingReceipt(clients:readonly [PublicClient,PublicClient],input:WorkFundingPolicy){
 const q=structuredClone(input);if(!q||!positive(q.acceptBy)||!positive(q.deliverBy)||BigInt(q.deliverBy)<=BigInt(q.acceptBy)||(q.fundingId!==null&&!hash(q.fundingId)))throw Error("Invalid funding terms");
 const {acceptBy,deliverBy,fundingId,...p}=q;validateWorkPaymentPolicy(p);
 if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error("Two distinct read clients required");
 const start=Date.now();let last=start,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
 const clock=()=>{const now=Date.now();if(ended||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>20000)throw Error("Funding read ended, expired or clock moved backwards");last=now;return now;};
 const action=async<T>(fn:()=>Promise<T>)=>{clock();const r=await fn();clock();return r;};
 const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
 const observe=async(c:PublicClient,head:bigint)=>{
  if(await action(()=>c.getChainId())!==97)throw Error("Wrong funding chain");
  const receipt=()=>action(()=>c.getTransactionReceipt({hash:p.transactionHash})),r=await receipt();
  if(!same(r.transactionHash,p.transactionHash)||r.status!=="success"||!hash(r.blockHash)||!uint(r.blockNumber,64)||r.blockNumber===0n||head<r.blockNumber+20n||!same(r.from,p.client)||!same(r.to,p.escrow)||!Number.isSafeInteger(r.transactionIndex)||r.transactionIndex<0||!Array.isArray(r.logs)||r.logs.length!==(fundingId===null?2:3))throw Error("Direct confirmed funding receipt required");
  const block=()=>action(()=>c.getBlock({blockNumber:r.blockNumber})),b=await block();
  if(b.number!==r.blockNumber||!same(b.hash,r.blockHash)||!uint(b.timestamp)||b.timestamp*1000n>BigInt(clock())||!Array.isArray(b.transactions)||!same(b.transactions[r.transactionIndex],p.transactionHash)||BigInt(acceptBy)<=b.timestamp||BigInt(acceptBy)>b.timestamp+86400n||BigInt(deliverBy)>b.timestamp+604800n)throw Error("Funding block or deadlines differ");
  const args=[p.worker,p.asset,BigInt(p.amount),p.termsHash,BigInt(acceptBy),BigInt(deliverBy)] as const;
  const data=fundingId===null?encodeFunctionData({abi:ABI,functionName:"fund",args}):encodeFunctionData({abi:ABI,functionName:"fundWithId",args:[fundingId,...args]});
  const tx=await action(()=>c.getTransaction({hash:p.transactionHash}));
  if(!same(tx.hash,p.transactionHash)||!same(tx.blockHash,r.blockHash)||tx.blockNumber!==r.blockNumber||tx.transactionIndex!==r.transactionIndex||tx.chainId!==97||!same(tx.from,p.client)||!same(tx.to,p.escrow)||tx.value!==0n||!same(tx.input,data))throw Error("Direct funding transaction differs");
  for(const [address,pin]of [[p.escrow,p.escrowCodeHash],[p.asset,p.assetCodeHash]] as const){const code=await action(()=>c.getCode({address,blockNumber:r.blockNumber}));if(!code||!/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code)||keccak256(code)!==pin)throw Error("Funding runtime differs");}
  const read=(functionName:string,args:readonly unknown[]=[])=>action(()=>c.readContract({address:p.escrow,abi:[...WORK_ESCROW_READ_ABI,...ABI],functionName,args,blockNumber:r.blockNumber} as never)) as Promise<unknown>;
  const [gov,guard,arb,pin,cap,job]=await Promise.all([read("governor"),read("guardian"),read("arbitrator"),read("assetCodeHash",[p.asset]),read("maxPerJob",[p.asset]),read("jobs",[BigInt(p.jobId)])]);
  if(!same(gov,p.governor)||!same(guard,p.guardian)||!same(arb,p.arbitrator)||pin!==p.assetCodeHash||cap!==BigInt(p.maxPerJob)||!Array.isArray(job)||job.length!==8||!same(job[0],p.client)||!same(job[1],p.worker)||!same(job[2],p.asset)||job[3]!==BigInt(p.amount)||job[4]!==BigInt(acceptBy)||job[5]!==BigInt(deliverBy)||job[6]!==p.termsHash||!Number.isInteger(job[7])||job[7]<1||job[7]>4)throw Error("Funded job or policy differs");
  if(fundingId!==null&&await read("fundingJobs",[p.client,fundingId])!==BigInt(p.jobId))throw Error("Stored funding ID differs");
  for(const l of r.logs)if(!same(l.transactionHash,p.transactionHash)||!same(l.blockHash,r.blockHash)||l.blockNumber!==r.blockNumber||l.transactionIndex!==r.transactionIndex||l.removed!==false||!Number.isSafeInteger(l.logIndex)||l.logIndex<0||!Array.isArray(l.topics)||l.topics.some(t=>typeof t!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(t)))throw Error("Funding log binding differs");
  const transfer=r.logs[0],funded=r.logs[1],transferTopics=[TRANSFER,"0x"+"0".repeat(24)+p.client.slice(2),"0x"+"0".repeat(24)+p.escrow.slice(2)],fundedTopics=[FUNDED,"0x"+word(BigInt(p.jobId)),"0x"+"0".repeat(24)+p.client.slice(2),"0x"+"0".repeat(24)+p.worker.slice(2)];
  const fundedData="0x"+"0".repeat(24)+p.asset.slice(2)+word(BigInt(p.amount))+p.termsHash.slice(2)+word(BigInt(acceptBy))+word(BigInt(deliverBy));
  if(!same(transfer.address,p.asset)||transfer.topics.length!==3||transfer.topics.some((t,i)=>!same(t,transferTopics[i]))||!same(transfer.data,"0x"+word(BigInt(p.amount)))||!same(funded.address,p.escrow)||funded.topics.length!==4||funded.topics.some((t,i)=>!same(t,fundedTopics[i]))||!same(funded.data,fundedData)||funded.logIndex!==transfer.logIndex+1)throw Error("Canonical funding events differ");
  if(fundingId!==null){const bound=r.logs[2],topics=[BOUND,"0x"+word(BigInt(p.jobId)),"0x"+"0".repeat(24)+p.client.slice(2),fundingId];if(!same(bound.address,p.escrow)||bound.topics.length!==4||bound.topics.some((t,i)=>!same(t,topics[i]))||bound.data!=="0x"||bound.logIndex!==funded.logIndex+1)throw Error("Canonical funding ID event differs");}
  const again=await receipt(),after=await block();const selected=(v:typeof r)=>({hash:v.transactionHash,status:v.status,block:v.blockNumber,blockHash:v.blockHash,to:v.to,from:v.from,index:v.transactionIndex,logs:v.logs});
  if(stringify(selected(again))!==stringify(selected(r))||after.number!==b.number||after.hash!==b.hash||after.timestamp!==b.timestamp||!same(after.transactions[r.transactionIndex],p.transactionHash)||await action(()=>c.getChainId())!==97)throw Error("Funding observation changed");
  return {chainId:97,escrow:p.escrow,asset:p.asset,client:p.client,worker:p.worker,jobId:p.jobId,termsHash:p.termsHash,principal:p.amount,acceptBy,deliverBy,fundingId,transactionHash:p.transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash,blockTimestamp:b.timestamp.toString(),fundingLogIndex:funded.logIndex,evidenceId:`97:${p.escrow}:${p.transactionHash}:${funded.logIndex}`};
 };
 try{clock();return await Promise.race([(async()=>{const heads=await Promise.all(clients.map(c=>action(()=>c.getBlockNumber({cacheTime:0}))));if(heads.some(h=>!uint(h,64)||h<21n)||(heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n)throw Error("Funding heads differ");const head=heads[0]<heads[1]?heads[0]:heads[1],results=await Promise.all(clients.map(c=>observe(c,head)));if(stringify(results[0])!==stringify(results[1]))throw Error("Funding providers disagree");return {...results[0],observedAtMs:clock(),source:"isolated-direct-work-funding-rpc-observation",directFundingObserved:true,currentAuthorization:null,independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,partyIdentityVerified:false,workDeliveryVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullSyndicateReadiness:false};})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Funding observation timed out")),20000);})]);}finally{ended=true;clearTimeout(timer);}
}
