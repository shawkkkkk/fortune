// Compiled contracts -> one zero-account LOCAL VM -> actual viem HTTP/ABI calls.
// Fresh loopback transport only; fixed local impersonation, no keys or public RPC.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,keccak256,toHex,decodeEventLog,decodeFunctionData} from 'viem';
import {bscTestnet} from 'viem/chains';

const GOV='0x0000000000000000000000000000000000009001';
const GUARD='0x0000000000000000000000000000000000009002';
const ARB='0x0000000000000000000000000000000000009003';
const CLIENT='0x0000000000000000000000000000000000001001';
const SECOND='0x0000000000000000000000000000000000001003';
const WORKER='0x0000000000000000000000000000000000001002';
const artifact=(file,name)=>JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`,import.meta.url),'utf8'));
const report=resolve('.tmp/work-batch-waiver-runtime.json');
rmSync(report,{force:true});
let node,stage='startup';
try{
 const work=artifact('FortuneTestnetWorkEscrow.sol','FortuneTestnetWorkEscrow');
 const asset=artifact('FortuneTestnetCounterEscrow.t.sol','CounterAssetMock');
 // Reject stale copied artifacts before local execution, including transitive owned sources.
 for(const item of [work,asset]){
  const metadata=typeof item.metadata==='string'?JSON.parse(item.metadata):item.metadata;
  for(const [path,source] of Object.entries(metadata.sources)){
   if(!/^(src|test)\//.test(path))continue;
   assert.equal(keccak256(toHex(readFileSync(new URL(`../${path}`,import.meta.url)))),source.keccak256);
  }
 }
 const binary=process.env.FORTUNE_ANVIL_BIN;assert.ok(binary);
 const version=spawnSync(binary,['--version'],{encoding:'utf8'});
 assert.equal(version.status,0);assert.match(version.stdout,/Version: 1\.7\.1/);
 const lease=createServer();lease.listen(0,'127.0.0.1');await once(lease,'listening');
 const port=lease.address().port;await new Promise(r=>lease.close(r));
 node=spawn(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','97','--accounts','0','--quiet'],{stdio:'ignore'});
 let failed=false;node.on('error',()=>{failed=true;});
 const transport=()=>http(`http://127.0.0.1:${port}`,{timeout:5000,retryCount:0});
 const rpc=createPublicClient({transport:transport(),chain:bscTestnet});let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  try{if(await rpc.getChainId()===97){ready=true;break;}}catch{}
  if(failed||node.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(ready);assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 const actors=[GOV,CLIENT,SECOND,WORKER];
 for(const who of actors){
  await rpc.request({method:'anvil_impersonateAccount',params:[who]});
  await rpc.request({method:'anvil_setBalance',params:[who,toHex(100n*10n**18n)]});
 }
 const wallet=who=>createWalletClient({account:who,transport:transport(),chain:bscTestnet});
 const receipt=async(hash,success=true)=>{
  const r=await rpc.waitForTransactionReceipt({hash,pollingInterval:20,timeout:15000});
  assert.equal(r.status,success?'success':'reverted');
  if(!success)assert.deepEqual(r.logs,[]);
  return r;
 };
 const deploy=async(a,args=[])=>{
  const r=await receipt(await wallet(GOV).deployContract({abi:a.abi,bytecode:a.bytecode.object,args,gas:10000000n}));
  assert.ok(r.contractAddress);return r.contractAddress;
 };
 const write=(who,address,a,functionName,args=[],success=true)=>wallet(who).writeContract({address,abi:a.abi,functionName,args,gas:5000000n}).then(hash=>receipt(hash,success));
 const read=(address,a,functionName,args=[])=>rpc.readContract({address,abi:a.abi,functionName,args});
 stage='local deployment and pinned assets';
 const token=await deploy(asset),second=await deploy(asset);
 const pins=await Promise.all([token,second].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).map(async token=>({token,codeHash:keccak256(await rpc.getCode({address:token})),maxPerJob:1000n})));
 const escrow=await deploy(work,[GOV,GUARD,ARB,pins]);
 assert.equal(await read(escrow,work,'paused'),true);
 await write(GOV,escrow,work,'setPaused',[false]);
 const keys=['0x'+'11'.repeat(32),'0x'+'22'.repeat(32)],resultHash='0x'+'33'.repeat(32);
 const jobs=[];
 stage='mixed-client and asset funding';
 for(const [i,client,paymentToken,amount] of [[0,CLIENT,token,100n],[1,SECOND,second,30n]]){
  await write(GOV,paymentToken,asset,'mint',[client,1000n]);
  await write(client,paymentToken,asset,'approve',[escrow,amount]);
  const id=await read(escrow,work,'nextJob'),at=(await rpc.getBlock()).timestamp;
  await write(client,escrow,work,'fundWithId',[keys[i],WORKER,paymentToken,amount,keys[i],at+100n,at+200n]);
  await write(WORKER,escrow,work,'accept',[id]);jobs.push({id,client,paymentToken,amount});
 }
 await write(WORKER,escrow,work,'submitResult',[jobs[1].id,0n,resultHash]);
 const waivers=[{id:jobs[0].id,expectedRevision:0n},{id:jobs[1].id,expectedRevision:1n}];
 const financialState=async()=>({
  jobs:await Promise.all(jobs.map(j=>read(escrow,work,'jobs',[j.id]))),
  revisions:await Promise.all(jobs.map(j=>read(escrow,work,'latestResultRevision',[j.id]))),
  result:await read(escrow,work,'resultHashes',[jobs[1].id,1n]),
  fundingIds:await Promise.all(jobs.map((j,i)=>read(escrow,work,'fundingJobs',[j.client,keys[i]]))),
  liabilities:await Promise.all(jobs.map(j=>read(escrow,work,'reserved',[j.paymentToken]))),
  balances:await Promise.all(jobs.map(j=>Promise.all([CLIENT,SECOND,WORKER,escrow].map(who=>read(j.paymentToken,asset,'balanceOf',[who]))))),
 });
 const accepted=await financialState();
 assert.deepEqual(accepted.liabilities,[100n,30n]);
 assert.deepEqual(accepted.revisions,[0n,1n]);assert.equal(accepted.result,resultHash);
 stage='stale revision and foreign caller rejection';
 await write(WORKER,escrow,work,'waivePaymentsMany',[[waivers[0],{...waivers[1],expectedRevision:0n}]],false);
 assert.deepEqual(await financialState(),accepted);
 await write(CLIENT,escrow,work,'waivePaymentsMany',[waivers],false);
 assert.deepEqual(await financialState(),accepted);
 stage='paused batch rejection';
 await write(GOV,escrow,work,'setPaused',[true]);
 await write(WORKER,escrow,work,'waivePaymentsMany',[waivers],false);
 assert.deepEqual(await financialState(),accepted);
 await write(GOV,escrow,work,'setPaused',[false]);
 stage='late inexact second-asset transfer rollback';
 await write(GOV,second,asset,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await assert.rejects(rpc.simulateContract({address:escrow,abi:work.abi,functionName:'waivePaymentsMany',args:[waivers],account:WORKER}),
  error=>error?.walk?.(cause=>cause.data?.errorName==='InexactTransfer')?.data?.errorName==='InexactTransfer');
 const failedReceipt=await write(WORKER,escrow,work,'waivePaymentsMany',[waivers],false);
 assert.deepEqual(await financialState(),accepted);
 stage='exact original batch retry and canonical receipts';
 await write(GOV,second,asset,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const paid=await write(WORKER,escrow,work,'waivePaymentsMany',[waivers]);
 const failedTx=await rpc.getTransaction({hash:failedReceipt.transactionHash}),paidTx=await rpc.getTransaction({hash:paid.transactionHash});
 assert.equal(paidTx.input,failedTx.input);assert.equal(paidTx.value,0n);
 assert.equal(paidTx.from.toLowerCase(),WORKER);assert.equal(paidTx.to.toLowerCase(),escrow.toLowerCase());
 const decoded=decodeFunctionData({abi:work.abi,data:paidTx.input});
 assert.equal(decoded.functionName,'waivePaymentsMany');assert.deepEqual(decoded.args,[waivers]);
 assert.equal(paid.logs.length,6);
 for(let i=0;i<jobs.length;i++){
  const j=jobs[i],[transfer,settled,waived]=paid.logs.slice(i*3,i*3+3);
  assert.deepEqual([transfer.address,settled.address,waived.address].map(a=>a.toLowerCase()),[j.paymentToken,escrow,escrow].map(a=>a.toLowerCase()));
  const a=decodeEventLog({abi:asset.abi,topics:transfer.topics,data:transfer.data});
  assert.equal(a.eventName,'Transfer');assert.equal(a.args.from.toLowerCase(),escrow.toLowerCase());assert.equal(a.args.to.toLowerCase(),j.client);assert.equal(a.args.value,j.amount);
  const b=decodeEventLog({abi:work.abi,topics:settled.topics,data:settled.data});
  assert.equal(b.eventName,'JobSettled');assert.deepEqual(b.args,{id:j.id,workerAmount:0n,clientRefund:j.amount,settledBy:WORKER});
  const c=decodeEventLog({abi:work.abi,topics:waived.topics,data:waived.data});
  assert.equal(c.eventName,'PaymentWaived');assert.deepEqual(c.args,{id:j.id,worker:WORKER,resultRevision:waivers[i].expectedRevision});
  assert.equal(settled.logIndex,transfer.logIndex+1);assert.equal(waived.logIndex,settled.logIndex+1);
 }
 const refunded=await financialState();
 assert.deepEqual(refunded.liabilities,[0n,0n]);
 assert.deepEqual(refunded.balances,[[1000n,0n,0n,0n],[0n,1000n,0n,0n]]);
 assert.deepEqual(refunded.revisions,accepted.revisions);assert.equal(refunded.result,accepted.result);
 assert.deepEqual(refunded.fundingIds,accepted.fundingIds);
 for(let i=0;i<jobs.length;i++)assert.deepEqual(refunded.jobs[i],[...accepted.jobs[i].slice(0,7),4]);
 // BEGIN selected batch waiver receipt integration (snapshot-restored, no extra financial transaction).
 stage='selected batch waiver receipt observation';
 await import('../../scripts/register-ts.mjs');
 const {inspectWorkBatchWaiverReceipt,inspectWorkWorkerRefundReceipt}=await import('../../lib/work-payment-receipt.ts');
 const snapshot=await rpc.request({method:'evm_snapshot'});
 const readState=async()=>({height:await rpc.getBlockNumber({cacheTime:0}),financial:await financialState(),
  nonces:await Promise.all(actors.map(async address=>[await rpc.getTransactionCount({address,blockTag:'latest'}),await rpc.getTransactionCount({address,blockTag:'pending'})]))});
 const originalReadState=await readState();
 try{
  await rpc.request({method:'anvil_mine',params:['0x14']});
  const before=await readState(),clients=[createPublicClient({transport:transport(),chain:bscTestnet}),createPublicClient({transport:transport(),chain:bscTestnet})];
  const common={chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),governor:GOV,guardian:GUARD,arbitrator:ARB,worker:WORKER,maxPerJob:'1000',transactionHash:paid.transactionHash,
   waivers:waivers.map(a=>({id:a.id.toString(),expectedRevision:a.expectedRevision.toString()}))};
  for(const [i,j]of jobs.entries()){
   const policy={...common,jobId:j.id.toString(),asset:j.paymentToken.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:j.paymentToken})),client:j.client,amount:j.amount.toString(),termsHash:keys[i]};
   const x=await inspectWorkBatchWaiverReceipt(clients,policy),again=await inspectWorkBatchWaiverReceipt(clients,policy);
   assert.equal(x.clientRefund,j.amount.toString());assert.equal(x.workerPaid,'0');assert.equal(x.batchJobIndex,i);assert.equal(x.batchJobCount,2);
   assert.equal(x.workerRefund.revision,String(i));assert.equal(x.settlementLogIndex,paid.logs[i*3+1].logIndex);assert.equal(x.evidenceId,again.evidenceId);
   assert.equal(x.selectedBatchWorkerRefundObserved,true);assert.equal(x.otherBatchJobsVerified,false);assert.equal(x.currentAuthorization,null);assert.equal(x.executionAuthorized,false);
   await assert.rejects(inspectWorkBatchWaiverReceipt(clients,{...policy,amount:(j.amount+1n).toString()}));
   const {waivers:ignored,...direct}=policy;await assert.rejects(inspectWorkWorkerRefundReceipt(clients,{...direct,refundKind:'waiver',expectedRevision:String(i)}));
  }
  // BEGIN complete batch waiver observation.
  const {inspectAllWorkBatchWaivers}=await import('../../lib/work-batch-waiver-receipts.ts');
  const allPolicies=await Promise.all(jobs.map(async(j,i)=>({...common,jobId:j.id.toString(),asset:j.paymentToken.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:j.paymentToken})),client:j.client,amount:j.amount.toString(),termsHash:keys[i]})));
  const whole=await inspectAllWorkBatchWaivers(clients,allPolicies),wholeAgain=await inspectAllWorkBatchWaivers(clients,allPolicies);
  assert.equal(whole.allCallEntriesObserved,true);assert.equal(whole.refunds.length,2);assert.equal(new Set(whole.refunds.map(r=>r.evidenceId)).size,2);
  assert.deepEqual(whole.refunds.map(r=>r.clientRefund),jobs.map(j=>j.amount.toString()));assert.deepEqual(whole.refunds.map(r=>r.asset),jobs.map(j=>j.paymentToken.toLowerCase()));
  assert.equal(whole.receiptConsistencyDigest,wholeAgain.receiptConsistencyDigest);assert.deepEqual(whole.refunds.map(r=>r.evidenceId),wholeAgain.refunds.map(r=>r.evidenceId));
  assert.equal(whole.currentAuthorization,null);assert.equal(whole.executionAuthorized,false);assert.equal(whole.fullSyndicateReadiness,false);
  await assert.rejects(inspectAllWorkBatchWaivers(clients,[allPolicies[0]]));
  await assert.rejects(inspectAllWorkBatchWaivers(clients,[allPolicies[0],{...allPolicies[1],amount:(jobs[1].amount+1n).toString()}]));
  // BEGIN durable waiver observations.
  const {WorkWaiverObservationBook:Book}=await import('../../scripts/work-waiver-observation-book.mjs');
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortune-waiver-book-')),file=path.join(dir,'book.sqlite');
  const scope=Object.fromEntries(['chainId','escrow','escrowCodeHash','governor','guardian','arbitrator','worker'].map(k=>[k,common[k]]));let book;
  try{
   Book.initialize(file,scope,{enabled:true});book=new Book(file,scope,{enabled:true,readOnly:false});const head=book.read().head;
   const inserted=await book.capture(clients,allPolicies,head),view=book.read();assert.equal(inserted.inserted,true);assert.equal(view.total,1);
   assert.deepEqual(view.entries[0].observation.refunds.map(r=>r.clientRefund),jobs.map(j=>j.amount.toString()));
   book.close();book=new Book(file,scope,{enabled:true,readOnly:false});const replay=await book.capture(clients,allPolicies,head);
   assert.equal(replay.inserted,false);assert.equal(replay.digest,inserted.digest);assert.equal(replay.recordedAtMs,inserted.recordedAtMs);assert.equal(replay.readerObservedAtMs,inserted.readerObservedAtMs);assert.deepEqual(book.read(),view);
   await assert.rejects(book.capture(clients,[allPolicies[0],{...allPolicies[1],amount:(jobs[1].amount+1n).toString()}],head));assert.deepEqual(book.read(),view);
  }finally{book?.close();fs.rmSync(dir,{recursive:true,force:true});}
  // END durable waiver observations.
  // END complete batch waiver observation.
  assert.deepEqual(await readState(),before);
 }finally{assert.equal(await rpc.request({method:'evm_revert',params:[snapshot]}),true);}
 assert.deepEqual(await readState(),originalReadState);
 assert.deepEqual(await financialState(),refunded);
 // END selected batch waiver receipt integration.
 stage='settled batch replay rejection';
 await write(WORKER,escrow,work,'waivePaymentsMany',[waivers],false);
 assert.deepEqual(await financialState(),refunded);
 for(const who of actors)await rpc.request({method:'anvil_stopImpersonatingAccount',params:[who]});
 assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 const result={durableWaiverBatchCaptured:true,durableWaiverReopenReplayImmutable:true,durableWaiverLateFailureNoWrite:true,wholeBatchWaiverReceiptObserved:true,wholeBatchWaiverDigestReplayStable:true,wholeBatchWaiverLatePolicyRejectedReadOnly:true,selectedBatchWaiverReceiptObserved:true,selectedBatchWaiverReplayStable:true,selectedBatchWaiverWrongAmountAndDirectRouteRejected:true,selectedBatchWaiverReadsPreserveState:true,compiledBatchWaiverObserved:true,mixedClientAssetRefundsMatched:true,staleRevisionAndForeignCallerRejected:true,
  pausedBatchRejected:true,lateTransferRolledBackWholeBatch:true,exactCalldataRetryMatched:true,canonicalSixLogReceiptMatched:true,
  originalResultAndFundingHistoryPreserved:true,successfulReplayRejected:true,ownedCompiledSourcesMatched:true,
  generatedAccounts:0,privateKeysUsed:false,publicBroadcasts:false,executionAuthorized:false,deployedToPublicNetwork:false,
  independentProvidersVerified:false,fullSyndicateReadiness:false};
 mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}catch{
 console.error(`Local batch waiver verification failed at ${stage}; no public transaction was submitted.`);process.exitCode=1;
}finally{
 if(node&&node.exitCode===null){node.kill('SIGTERM');const force=setTimeout(()=>node.kill('SIGKILL'),3000);await once(node,'exit').catch(()=>{});clearTimeout(force);}
}
