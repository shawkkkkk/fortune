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
const report=resolve('.tmp/work-batch-decline-runtime.json');
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
 const keys=['0x'+'11'.repeat(32),'0x'+'22'.repeat(32),'0x'+'33'.repeat(32)];
 const jobs=[];
 stage='mixed-client and asset funding';
 for(const [i,client,paymentToken,amount] of [[0,CLIENT,token,100n],[1,SECOND,second,30n]]){
  await write(GOV,paymentToken,asset,'mint',[client,1000n]);
  await write(client,paymentToken,asset,'approve',[escrow,amount]);
  const id=await read(escrow,work,'nextJob'),at=(await rpc.getBlock()).timestamp;
  await write(client,escrow,work,'fundWithId',[keys[i],WORKER,paymentToken,amount,keys[i],at+100n,at+200n]);
  jobs.push({id,client,paymentToken,amount});
 }
 const unselected=await read(escrow,work,'nextJob'),at=(await rpc.getBlock()).timestamp;
 await write(CLIENT,token,asset,'approve',[escrow,20n]);
 await write(CLIENT,escrow,work,'fundWithId',[keys[2],WORKER,token,20n,keys[2],at+100n,at+200n]);
 await write(WORKER,escrow,work,'accept',[unselected]);
 await write(WORKER,escrow,work,'submitResult',[unselected,0n,keys[2]]);
 const ids=jobs.map(j=>j.id);
 const financialState=async()=>({
  jobs:await Promise.all([...jobs.map(j=>j.id),unselected].map(id=>read(escrow,work,'jobs',[id]))),
  revisions:await Promise.all([...ids,unselected].map(id=>read(escrow,work,'latestResultRevision',[id]))),
  result:await read(escrow,work,'resultHashes',[unselected,1n]),
  fundingIds:await Promise.all([[CLIENT,keys[0]],[SECOND,keys[1]],[CLIENT,keys[2]]].map(args=>read(escrow,work,'fundingJobs',args))),
  nextJob:await read(escrow,work,'nextJob'),
  liabilities:await Promise.all([token,second].map(t=>read(escrow,work,'reserved',[t]))),
  balances:await Promise.all([token,second].map(t=>Promise.all([CLIENT,SECOND,WORKER,escrow].map(who=>read(t,asset,'balanceOf',[who]))))),
 });
 const funded=await financialState();assert.deepEqual(funded.liabilities,[120n,30n]);
 assert.deepEqual(funded.jobs.map(j=>j[7]),[1,1,2]);assert.deepEqual(funded.revisions,[0n,0n,1n]);
 stage='foreign worker, ordering, bounds and accepted job rejection';
 for(const [who,batch]of [[CLIENT,ids],[WORKER,[]],[WORKER,Array(17).fill(ids[0])],[WORKER,[0n,...ids]],[WORKER,[ids[0],ids[0]]],[WORKER,[ids[1],ids[0]]],[WORKER,[ids[0],unselected]]]){
  await write(who,escrow,work,'declineMany',[batch],false);assert.deepEqual(await financialState(),funded);
 }
 stage='paused batch rejection';
 await write(GOV,escrow,work,'setPaused',[true]);
 await write(WORKER,escrow,work,'declineMany',[ids],false);assert.deepEqual(await financialState(),funded);
 await write(GOV,escrow,work,'setPaused',[false]);
 stage='late inexact second-asset transfer rollback';
 await write(GOV,second,asset,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await assert.rejects(rpc.simulateContract({address:escrow,abi:work.abi,functionName:'declineMany',args:[ids],account:WORKER}),
  error=>error?.walk?.(cause=>cause.data?.errorName==='InexactTransfer')?.data?.errorName==='InexactTransfer');
 const failedReceipt=await write(WORKER,escrow,work,'declineMany',[ids],false);
 assert.deepEqual(await financialState(),funded);
 stage='exact original batch retry and canonical receipts';
 await write(GOV,second,asset,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const paid=await write(WORKER,escrow,work,'declineMany',[ids]);
 const failedTx=await rpc.getTransaction({hash:failedReceipt.transactionHash}),paidTx=await rpc.getTransaction({hash:paid.transactionHash});
 assert.equal(paidTx.input,failedTx.input);assert.equal(paidTx.value,0n);
 assert.equal(paidTx.from.toLowerCase(),WORKER);assert.equal(paidTx.to.toLowerCase(),escrow.toLowerCase());
 const decoded=decodeFunctionData({abi:work.abi,data:paidTx.input});
 assert.equal(decoded.functionName,'declineMany');assert.deepEqual(decoded.args,[ids]);
 assert.equal(paid.logs.length,6);
 for(let i=0;i<jobs.length;i++){
  const j=jobs[i],[transfer,settled,declined]=paid.logs.slice(i*3,i*3+3);
  assert.deepEqual([transfer.address,settled.address,declined.address].map(a=>a.toLowerCase()),[j.paymentToken,escrow,escrow].map(a=>a.toLowerCase()));
  const a=decodeEventLog({abi:asset.abi,topics:transfer.topics,data:transfer.data});
  assert.equal(a.eventName,'Transfer');assert.equal(a.args.from.toLowerCase(),escrow.toLowerCase());assert.equal(a.args.to.toLowerCase(),j.client);assert.equal(a.args.value,j.amount);
  const b=decodeEventLog({abi:work.abi,topics:settled.topics,data:settled.data});
  assert.equal(b.eventName,'JobSettled');assert.deepEqual(b.args,{id:j.id,workerAmount:0n,clientRefund:j.amount,settledBy:WORKER});
  const c=decodeEventLog({abi:work.abi,topics:declined.topics,data:declined.data});
  assert.equal(c.eventName,'JobDeclined');assert.deepEqual(c.args,{id:j.id,worker:WORKER});
  assert.equal(settled.logIndex,transfer.logIndex+1);assert.equal(declined.logIndex,settled.logIndex+1);
 }
 const refunded=await financialState();
 assert.deepEqual(refunded.liabilities,[20n,0n]);
 assert.deepEqual(refunded.balances,[[980n,0n,0n,20n],[0n,1000n,0n,0n]]);
 assert.deepEqual(refunded.revisions,funded.revisions);assert.equal(refunded.result,funded.result);
 assert.deepEqual(refunded.fundingIds,funded.fundingIds);assert.equal(refunded.nextJob,funded.nextJob);
 for(let i=0;i<jobs.length;i++)assert.deepEqual(refunded.jobs[i],[...funded.jobs[i].slice(0,7),4]);
 assert.deepEqual(refunded.jobs[2],funded.jobs[2]);
 // BEGIN selected decline receipt observation (snapshot restored).
 stage='selected decline receipt observation';
 await import('../../scripts/register-ts.mjs');
 const {inspectWorkBatchDeclineReceipt,inspectWorkWorkerRefundReceipt}=await import('../../lib/work-payment-receipt.ts');
 const snapshot=await rpc.request({method:'evm_snapshot'});
 const readState=async()=>({financial:await financialState(),head:await rpc.getBlockNumber({cacheTime:0}),nonces:await Promise.all(actors.map(address=>rpc.getTransactionCount({address,blockTag:'pending'})))});
 const original=await readState();
 try{
  await rpc.request({method:'anvil_mine',params:['0x14']});const before=await readState();
  const clients=[createPublicClient({transport:transport(),chain:bscTestnet}),createPublicClient({transport:transport(),chain:bscTestnet})];
  for(const [i,j]of jobs.entries()){
   const policy={chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),governor:GOV,guardian:GUARD,arbitrator:ARB,jobId:j.id.toString(),client:j.client,worker:WORKER,amount:j.amount.toString(),asset:j.paymentToken.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:j.paymentToken})),maxPerJob:'1000',termsHash:keys[i],transactionHash:paid.transactionHash,declineIds:ids.map(String)};
   const x=await inspectWorkBatchDeclineReceipt(clients,policy),again=await inspectWorkBatchDeclineReceipt(clients,policy);
   assert.equal(x.clientRefund,j.amount.toString());assert.equal(x.workerPaid,'0');assert.equal(x.batchJobIndex,i);assert.equal(x.batchJobCount,2);assert.equal(x.selectedBatchDeclineObserved,true);assert.equal(x.otherBatchJobsVerified,false);assert.equal(x.workerRefund.kind,'decline');assert.equal(x.workerRefund.revision,null);assert.equal(x.settlementLogIndex,paid.logs[i*3+1].logIndex);assert.equal(x.evidenceId,again.evidenceId);assert.equal(x.currentAuthorization,null);assert.equal(x.executionAuthorized,false);
   await assert.rejects(inspectWorkBatchDeclineReceipt(clients,{...policy,amount:(j.amount+1n).toString()}));
   const {declineIds,...direct}=policy;await assert.rejects(inspectWorkWorkerRefundReceipt(clients,{...direct,refundKind:'decline'}));
  }
  // BEGIN complete decline receipt coverage.
  const {inspectAllWorkBatchDeclines}=await import('../../lib/work-batch-decline-receipts.ts');
  const allPolicies=await Promise.all(jobs.map(async(j,i)=>({chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),governor:GOV,guardian:GUARD,arbitrator:ARB,jobId:j.id.toString(),client:j.client,worker:WORKER,amount:j.amount.toString(),asset:j.paymentToken.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:j.paymentToken})),maxPerJob:'1000',termsHash:keys[i],transactionHash:paid.transactionHash,declineIds:ids.map(String)})));
  const whole=await inspectAllWorkBatchDeclines(clients,allPolicies),wholeAgain=await inspectAllWorkBatchDeclines(clients,allPolicies);
  assert.equal(whole.allCallEntriesObserved,true);assert.equal(whole.refunds.length,2);
  assert.deepEqual(whole.refunds.map(r=>r.clientRefund),jobs.map(j=>j.amount.toString()));
  assert.deepEqual(whole.refunds.map(r=>r.settlementLogIndex),[paid.logs[1].logIndex,paid.logs[4].logIndex]);
  assert.deepEqual(whole.refunds.map(r=>r.evidenceId),wholeAgain.refunds.map(r=>r.evidenceId));
  assert.equal(new Set(whole.refunds.map(r=>r.evidenceId)).size,2);assert.equal(whole.receiptConsistencyDigest,wholeAgain.receiptConsistencyDigest);
  assert.ok(whole.refunds.every(r=>r.otherBatchJobsVerified===false&&r.workerPaid==='0'&&r.workerRefund.kind==='decline'&&r.workerRefund.revision===null));
  assert.equal(whole.currentAuthorization,null);assert.equal(whole.executionAuthorized,false);assert.equal(whole.fullSyndicateReadiness,false);
  await assert.rejects(inspectAllWorkBatchDeclines(clients,[allPolicies[0]]));
  await assert.rejects(inspectAllWorkBatchDeclines(clients,[allPolicies[0],{...allPolicies[1],amount:(jobs[1].amount+1n).toString()}]));
  // END complete decline receipt coverage.
  assert.deepEqual(await readState(),before);
 }finally{assert.equal(await rpc.request({method:'evm_revert',params:[snapshot]}),true);}
 assert.deepEqual(await readState(),original);
 // END selected decline receipt observation.
 stage='settled batch replay and old single-route rejection';
 await write(WORKER,escrow,work,'declineMany',[ids],false);
 await write(WORKER,escrow,work,'decline',[ids[0]],false);
 await write(WORKER,escrow,work,'accept',[ids[0]],false);
 await write(CLIENT,escrow,work,'cancel',[ids[0]],false);
 assert.deepEqual(await financialState(),refunded);
 for(const who of actors)await rpc.request({method:'anvil_stopImpersonatingAccount',params:[who]});
 assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 const result={wholeDeclineCoverageObserved:true,wholeDeclineReplayStable:true,wholeDeclineIncompleteAndBadPolicyRejected:true,selectedDeclineReceiptObserved:true,selectedDeclineReplayStable:true,selectedDeclineWrongPolicyAndDirectRouteRejected:true,selectedDeclineReadsPreserveState:true,compiledBatchDeclineObserved:true,mixedClientAssetRefundsMatched:true,
  callerBoundsOrderingAndAcceptedJobRejected:true,pausedBatchRejected:true,lateTransferRolledBackWholeBatch:true,
  exactCalldataRetryMatched:true,canonicalSixLogReceiptMatched:true,unselectedAcceptedLiabilityPreserved:true,
  originalTermsFundingAndResultHistoryPreserved:true,successfulReplayAndOldRoutesRejected:true,ownedCompiledSourcesMatched:true,
  generatedAccounts:0,privateKeysUsed:false,publicBroadcasts:false,executionAuthorized:false,deployedToPublicNetwork:false,
  independentProvidersVerified:false,fullSyndicateReadiness:false};
 mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}catch{
 console.error(`Local batch decline verification failed at ${stage}; no public transaction was submitted.`);process.exitCode=1;
}finally{
 if(node&&node.exitCode===null){node.kill('SIGTERM');const force=setTimeout(()=>node.kill('SIGKILL'),3000);await once(node,'exit').catch(()=>{});clearTimeout(force);}
}
