// Actual compiled escrow -> zero-account LOCAL EVM -> viem HTTP/ABI -> receipts/state.
// All writes use a fresh loopback URL and local VM impersonation. No fork or keys.
import assert from 'node:assert/strict';
import {inspectWorkFundingReceipt} from '../../lib/work-funding-receipt.ts';
import {DatabaseSync} from 'node:sqlite';
import {WorkBatchObservationBook} from '../../scripts/work-batch-observation-book.mjs';
import {readFileSync,writeFileSync,mkdirSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,keccak256,toHex,decodeEventLog,decodeFunctionData} from 'viem';
import {bscTestnet} from 'viem/chains';
import {inspectAllWorkBatchResultPayments,inspectWorkBatchResultPaymentReceipt,inspectWorkPaymentReceipt,inspectWorkResultPaymentReceipt,inspectWorkCancellationReceipt,inspectWorkExpiredCancellationReceipt,inspectWorkWorkerRefundReceipt,inspectWorkArbitrationReceipt} from '../../lib/work-payment-receipt.ts';
import {inspectWorkEscrowJob} from '../../lib/work-escrow-observation.ts';


const GOV='0x0000000000000000000000000000000000009001',GUARD='0x0000000000000000000000000000000000009002',ARB='0x0000000000000000000000000000000000009003';
const CLIENT='0x0000000000000000000000000000000000001001',WORKER='0x0000000000000000000000000000000000001002';
const artifact=(file,name)=>JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`,import.meta.url),'utf8'));
const escrowArtifact=artifact('FortuneTestnetWorkEscrow.sol','FortuneTestnetWorkEscrow');
const assetArtifact=artifact('FortuneTestnetCounterEscrow.t.sol','CounterAssetMock');
const report=resolve('.tmp/work-escrow-runtime.json');rmSync(report,{force:true});
let node,stage='startup';
try{
 const binary=process.env.FORTUNE_ANVIL_BIN;assert.ok(binary);
 const version=spawnSync(binary,['--version'],{encoding:'utf8'});assert.equal(version.status,0);assert.match(version.stdout,/Version: 1\.7\.1/);
 const lease=createServer();lease.listen(0,'127.0.0.1');await once(lease,'listening');const port=lease.address().port;await new Promise(r=>lease.close(r));
 node=spawn(binary,['--timestamp',String(Math.floor(Date.now()/1000)-60),'--host','127.0.0.1','--port',String(port),'--chain-id','97','--accounts','0','--quiet'],{stdio:'ignore'});
 let failed=false;node.on('error',()=>{failed=true;});
 const transport=()=>http(`http://127.0.0.1:${port}`,{timeout:5000,retryCount:0});
 const rpc=createPublicClient({transport:transport(),chain:bscTestnet});let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  try{if(await rpc.getChainId()===97){ready=true;break;}}catch{}
  if(failed||node.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(ready);assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 for(const who of [GOV,GUARD,ARB,CLIENT,WORKER]){await rpc.request({method:'anvil_impersonateAccount',params:[who]});await rpc.request({method:'anvil_setBalance',params:[who,toHex(100n*10n**18n)]});}
 const wallet=who=>createWalletClient({account:who,transport:transport(),chain:bscTestnet});
 const receipt=async(hash,success=true)=>{const r=await rpc.waitForTransactionReceipt({hash,pollingInterval:20,timeout:15000});assert.equal(r.status,success?'success':'reverted');return r;};
 const deploy=async(a,args=[])=>{const r=await receipt(await wallet(GOV).deployContract({abi:a.abi,bytecode:a.bytecode.object,args,gas:10000000n}));assert.ok(r.contractAddress);return r.contractAddress;};
 const write=(who,address,a,functionName,args=[],success=true)=>wallet(who).writeContract({address,abi:a.abi,functionName,args,gas:5000000n}).then(hash=>receipt(hash,success));
 const read=(address,a,functionName,args=[])=>rpc.readContract({address,abi:a.abi,functionName,args});
 stage='deploy isolated work escrow and synthetic asset';
 const token=await deploy(assetArtifact),secondToken=await deploy(assetArtifact);
 const assets=await Promise.all([token,secondToken].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).map(async token=>({token,codeHash:keccak256(await rpc.getCode({address:token})),maxPerJob:1000n})));
 const escrow=await deploy(escrowArtifact,[GOV,GUARD,ARB,assets]);
 const observers=[rpc,createPublicClient({transport:transport(),chain:bscTestnet})];
 const policyFor=async(id,amount)=>({chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),governor:GOV,guardian:GUARD,arbitrator:ARB,jobId:id.toString(),client:CLIENT,worker:WORKER,asset:token.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:token})),maxPerJob:'1000',amount:amount.toString(),termsHash:'0x'+'11'.repeat(32)});
 const observe=async(id,amount,state)=>{
  await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
  const policy=await policyFor(id,amount),observation=await inspectWorkEscrowJob(observers,policy);
  assert.equal(observation.job.state,state);assert.equal(observation.workerPaid,null);assert.equal(observation.settlementReceiptVerified,false);assert.equal(observation.executionAuthorized,false);
  const dir=mkdtempSync(join(tmpdir(),'fortune-work-job-')),path=join(dir,'policy.json'),bytes=JSON.stringify(policy);writeFileSync(path,bytes);
  try{
   const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/work-job-http.mjs','scripts/inspect-work-job.mjs',path],{env:{...process.env,FORTUNE_WORK_JOB_READ_ENABLED:'true',FORTUNE_WORK_READ_RPC_URL:'https://work-one.invalid',FORTUNE_WORK_SECONDARY_RPC_URL:'https://work-two.invalid',FORTUNE_TEST_WORK_RPC:`http://127.0.0.1:${port}`}});
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
   try{const [status]=await once(child,'exit');assert.equal(status,0,err);}finally{clearTimeout(timer);}
   const result=JSON.parse(out);assert.equal(result.policySha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(result.executionAuthorized,false);assert.equal(result.fullSyndicateReadiness,false);assert.equal(result.currentAuthorization,null);
   // Separate calls have their own original observation times; all same-block data must match.
   assert.deepEqual({...result.observation,observedAtMs:0},{...observation,observedAtMs:0});
  }finally{rmSync(dir,{recursive:true,force:true});}
  return observation;
 };
 assert.equal(await read(escrow,escrowArtifact,'paused'),true);
 await write(GUARD,escrow,escrowArtifact,'setPaused',[false],false);
 await write(GOV,escrow,escrowArtifact,'setPaused',[false]);
 await write(GOV,token,assetArtifact,'mint',[CLIENT,2000n]);
 const fundingId='0x'+'22'.repeat(32);let firstFundingArgs;
 const fundedReceipts=new Map();
 const fund=async(amount,paymentToken=token)=>{const id=await read(escrow,escrowArtifact,'nextJob');const at=(await rpc.getBlock()).timestamp;
  await write(CLIENT,paymentToken,assetArtifact,'approve',[escrow,amount]);
  const args=[WORKER,paymentToken,amount,'0x'+'11'.repeat(32),at+100n,at+200n];
  if(id===1n){firstFundingArgs=[fundingId,...args];fundedReceipts.set(id,{receipt:await write(CLIENT,escrow,escrowArtifact,'fundWithId',firstFundingArgs),args});
   assert.equal(await read(escrow,escrowArtifact,'fundingJobs',[CLIENT,fundingId]),id);
   await write(CLIENT,token,assetArtifact,'approve',[escrow,1000n]);
   await write(CLIENT,escrow,escrowArtifact,'fundWithId',firstFundingArgs,false);
   assert.equal(await read(escrow,escrowArtifact,'nextJob'),2n);assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),amount);
  }else fundedReceipts.set(id,{receipt:await write(CLIENT,escrow,escrowArtifact,'fund',args),args});return id;};
 // BEGIN additive funding receipt observer drill.
 const observeFunding=async(id,amount,bound)=>{
  const saved=fundedReceipts.get(id),q={...await policyFor(id,amount),transactionHash:saved.receipt.transactionHash,acceptBy:saved.args[4].toString(),deliverBy:saved.args[5].toString(),fundingId:bound?fundingId:null};
  const state=async()=>({head:await rpc.getBlockNumber({cacheTime:0}),nonces:await Promise.all(['latest','pending'].map(blockTag=>rpc.getTransactionCount({address:CLIENT,blockTag}))),balances:await Promise.all([CLIENT,escrow].map(who=>read(token,assetArtifact,'balanceOf',[who]))),reserved:await read(escrow,escrowArtifact,'reserved',[token])});
  const before=await state(),x=await inspectWorkFundingReceipt(observers,q);
  assert.equal(x.principal,amount.toString());assert.equal(x.fundingId,q.fundingId);assert.equal(x.transactionHash,saved.receipt.transactionHash);assert.equal(x.currentAuthorization,null);assert.equal(x.executionAuthorized,false);
  assert.equal((await inspectWorkFundingReceipt(observers,q)).evidenceId,x.evidenceId);
  await assert.rejects(inspectWorkFundingReceipt(observers,{...q,amount:(amount-1n).toString()}));
  await assert.rejects(inspectWorkFundingReceipt(observers,{...q,fundingId:bound?null:fundingId}));
  // BEGIN additive funding CLI drill.
  const dir=mkdtempSync(join(tmpdir(),'fortune-work-funding-')),path=join(dir,'policy.json');
  const run=async policy=>{
   const bytes=JSON.stringify(policy);writeFileSync(path,bytes);
   const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/work-job-http.mjs','scripts/inspect-work-funding.mjs',path],{env:{...process.env,FORTUNE_WORK_FUNDING_READ_ENABLED:'true',FORTUNE_WORK_READ_RPC_URL:'https://work-one.invalid',FORTUNE_WORK_SECONDARY_RPC_URL:'https://work-two.invalid',FORTUNE_TEST_WORK_RPC:`http://127.0.0.1:${port}`}});
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
   try{const [status]=await once(child,'exit');return {status,out,err,sha:createHash('sha256').update(bytes).digest('hex')};}finally{clearTimeout(timer);}
  };
  try{
   const first=await run(q);assert.equal(first.status,0,first.err);const result=JSON.parse(first.out);assert.equal(result.policySha256,first.sha);assert.equal(result.currentAuthorization,null);assert.equal(result.executionAuthorized,false);assert.equal(result.fullSyndicateReadiness,false);
   assert.deepEqual({...result.observation,observedAtMs:0},{...x,observedAtMs:0});
   const replay=await run(q);assert.equal(replay.status,0,replay.err);assert.equal(JSON.parse(replay.out).observation.evidenceId,x.evidenceId);
   for(const wrong of [{...q,amount:(amount-1n).toString()},{...q,fundingId:bound?null:fundingId}]){const r=await run(wrong);assert.equal(r.status,1);assert.equal(r.out,'');assert.match(r.err,/Work funding receipt unavailable/);}
  }finally{rmSync(dir,{recursive:true,force:true});}
  // END additive funding CLI drill.
  assert.deepEqual(await state(),before);
 };
 // END additive funding receipt observer drill.
 stage='client payment after explicit worker acceptance';
 const one=await fund(100n);await observe(one,100n,'Funded');await observeFunding(one,100n,true);await write(WORKER,escrow,escrowArtifact,'accept',[one]);
 await observe(one,100n,'Accepted');
 await write(GUARD,escrow,escrowArtifact,'setPaused',[true]);
 assert.equal((await observe(one,100n,'Accepted')).paused,true);
 await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one],false);
 await write(GOV,escrow,escrowArtifact,'setPaused',[false]);
 const paid=await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one]);
 const events=paid.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(events.length,1);assert.equal(events[0].eventName,'JobSettled');assert.equal(events[0].args.id,one);assert.equal(events[0].args.workerAmount,100n);assert.equal(events[0].args.clientRefund,0n);assert.equal(events[0].args.settledBy.toLowerCase(),CLIENT);
 const settledObservation=await observe(one,100n,'Settled');assert.equal(settledObservation.backing.selectedOutstanding,'0');
 const paymentPolicy={...await policyFor(one,100n),transactionHash:paid.transactionHash};
 const payment=await inspectWorkPaymentReceipt(observers,paymentPolicy);assert.equal(payment.workerPaid,'100');assert.equal(payment.clientRefund,'0');assert.equal(payment.directPaymentObserved,true);assert.equal(payment.executionAuthorized,false);
 const paymentCli=async(policy)=>{
  const dir=mkdtempSync(join(tmpdir(),'fortune-work-payment-')),path=join(dir,'policy.json'),bytes=JSON.stringify(policy);writeFileSync(path,bytes);
  try{const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/work-job-http.mjs','scripts/inspect-work-payment.mjs',path],{env:{...process.env,FORTUNE_WORK_PAYMENT_READ_ENABLED:'true',FORTUNE_WORK_READ_RPC_URL:'https://work-one.invalid',FORTUNE_WORK_SECONDARY_RPC_URL:'https://work-two.invalid',FORTUNE_TEST_WORK_RPC:`http://127.0.0.1:${port}`}});
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
   try{const [status]=await once(child,'exit');return {status,out,err,sha:createHash('sha256').update(bytes).digest('hex')};}finally{clearTimeout(timer);}
  }finally{rmSync(dir,{recursive:true,force:true});}
 };
 const cliPayment=await paymentCli(paymentPolicy);assert.equal(cliPayment.status,0,cliPayment.err);const cliPaid=JSON.parse(cliPayment.out);assert.equal(cliPaid.policySha256,cliPayment.sha);assert.equal(cliPaid.currentAuthorization,null);assert.equal(cliPaid.executionAuthorized,false);assert.deepEqual({...cliPaid.observation,observedAtMs:0},{...payment,observedAtMs:0});
 const retryCliPayment=await paymentCli(paymentPolicy);assert.equal(retryCliPayment.status,0,retryCliPayment.err);assert.equal(JSON.parse(retryCliPayment.out).observation.evidenceId,payment.evidenceId);
 const foreignCliPayment=await paymentCli({...paymentPolicy,amount:'99'});assert.equal(foreignCliPayment.status,1);assert.equal(foreignCliPayment.out,'');assert.match(foreignCliPayment.err,/Work payment receipt unavailable/);
 const repeatedPayment=await inspectWorkPaymentReceipt(observers,paymentPolicy);assert.equal(repeatedPayment.evidenceId,payment.evidenceId);
 await assert.rejects(inspectWorkPaymentReceipt(observers,{...paymentPolicy,amount:'99'}));
 await assert.rejects(inspectWorkEscrowJob(observers,{...await policyFor(one,100n),termsHash:'0x'+'99'.repeat(32)}));
 await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one],false);
 await write(CLIENT,escrow,escrowArtifact,'fundWithId',firstFundingArgs,false);
 assert.equal(await read(token,assetArtifact,'allowance',[CLIENT,escrow]),1000n);
 assert.equal(await read(escrow,escrowArtifact,'fundingJobs',[CLIENT,fundingId]),one);
 assert.equal(await read(escrow,escrowArtifact,'nextJob'),2n);
 stage='unaccepted cancellation and arbitrated dispute';
 const two=await fund(50n);const cancelled=await write(CLIENT,escrow,escrowArtifact,'cancel',[two]);
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 await observeFunding(two,50n,false);
 const cancelPolicy={...await policyFor(two,50n),transactionHash:cancelled.transactionHash};
 const cancellation=await inspectWorkCancellationReceipt(observers,cancelPolicy);assert.equal(cancellation.workerPaid,'0');assert.equal(cancellation.clientRefund,'50');assert.equal(cancellation.directCancellationObserved,true);assert.equal(cancellation.executionAuthorized,false);
 assert.equal((await inspectWorkCancellationReceipt(observers,cancelPolicy)).evidenceId,cancellation.evidenceId);
 await assert.rejects(inspectWorkCancellationReceipt(observers,{...cancelPolicy,amount:'49'}));
 await assert.rejects(inspectWorkPaymentReceipt(observers,cancelPolicy));
 await assert.rejects(inspectWorkCancellationReceipt(observers,paymentPolicy));
 const three=await fund(100n);await write(WORKER,escrow,escrowArtifact,'accept',[three]);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[three,0n,'0x'+'55'.repeat(32)]);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[three,1n,'0x'+'66'.repeat(32)]);
 await write(WORKER,escrow,escrowArtifact,'dispute',[three]);
 const disputedObservation=await observe(three,100n,'Disputed');assert.equal(disputedObservation.results.length,2);assert.equal(disputedObservation.disputedResultRevision,'0');
 await write(GOV,escrow,escrowArtifact,'resolve',[three,60n],false);
 await write(GOV,token,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(ARB,escrow,escrowArtifact,'resolve',[three,60n],false);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),100n);assert.equal((await read(escrow,escrowArtifact,'jobs',[three]))[7],3);
 assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),100n);
 await write(GOV,token,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const arbitratedSplit=await write(ARB,escrow,escrowArtifact,'resolve',[three,60n]);
 stage='separate compiled arbitration zero/full boundary receipts';
 const edgeToken=await deploy(assetArtifact),edgePin=keccak256(await rpc.getCode({address:edgeToken}));
 const edgeEscrow=await deploy(escrowArtifact,[GOV,GUARD,ARB,[{token:edgeToken,codeHash:edgePin,maxPerJob:1000n}]]);
 await write(GOV,edgeEscrow,escrowArtifact,'setPaused',[false]);await write(GOV,edgeToken,assetArtifact,'mint',[CLIENT,20n]);await write(CLIENT,edgeToken,assetArtifact,'approve',[edgeEscrow,20n]);
 for(const workerAmount of [0n,10n]){
  const id=await read(edgeEscrow,escrowArtifact,'nextJob'),at=(await rpc.getBlock()).timestamp;
  await write(CLIENT,edgeEscrow,escrowArtifact,'fund',[WORKER,edgeToken,10n,'0x'+'11'.repeat(32),at+100n,at+200n]);await write(WORKER,edgeEscrow,escrowArtifact,'accept',[id]);await write(CLIENT,edgeEscrow,escrowArtifact,'dispute',[id]);
  const resolved=await write(ARB,edgeEscrow,escrowArtifact,'resolve',[id,workerAmount]);await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
  const policy={...await policyFor(id,10n),escrow:edgeEscrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:edgeEscrow})),asset:edgeToken.toLowerCase(),assetCodeHash:edgePin,transactionHash:resolved.transactionHash,workerAmount:workerAmount.toString()};
  const observed=await inspectWorkArbitrationReceipt(observers,policy);assert.equal(observed.workerPaid,workerAmount.toString());assert.equal(observed.clientRefund,(10n-workerAmount).toString());assert.equal(resolved.logs.length,2);assert.equal(observed.executionAuthorized,false);
 }
 assert.equal(await read(edgeToken,assetArtifact,'balanceOf',[CLIENT]),10n);assert.equal(await read(edgeToken,assetArtifact,'balanceOf',[WORKER]),10n);assert.equal(await read(edgeEscrow,escrowArtifact,'reserved',[edgeToken]),0n);
 stage='expired unaccepted job returns only client funding';
 const four=await fund(30n);await rpc.request({method:'evm_increaseTime',params:[101]});await rpc.request({method:'evm_mine'});
 await write(WORKER,escrow,escrowArtifact,'accept',[four],false);const expiredRefund=await write(GOV,escrow,escrowArtifact,'cancel',[four]);
 stage='append-only result revisions and revision-bound client payment';
 const five=await fund(20n),resultA='0x'+'33'.repeat(32),resultB='0x'+'44'.repeat(32);
 await write(WORKER,escrow,escrowArtifact,'accept',[five]);
 await write(CLIENT,escrow,escrowArtifact,'submitResult',[five,0n,resultA],false);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[five,0n,resultA]);
 const submitted=await write(WORKER,escrow,escrowArtifact,'submitResult',[five,1n,resultB]);
 const submission=decodeEventLog({abi:escrowArtifact.abi,data:submitted.logs[0].data,topics:submitted.logs[0].topics});
 assert.equal(submission.eventName,'ResultSubmitted');assert.equal(submission.args.id,five);assert.equal(submission.args.worker.toLowerCase(),WORKER);assert.equal(submission.args.revision,2n);assert.equal(submission.args.resultHash,resultB);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[five,1n]),resultA);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[five,0n,resultB],false);
 await write(CLIENT,escrow,escrowArtifact,'approveResult',[five,1n,resultA],false);
 await write(CLIENT,escrow,escrowArtifact,'approveResult',[five,2n,resultA],false);
 await write(GOV,token,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(CLIENT,escrow,escrowArtifact,'approveResult',[five,2n,resultB],false);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),20n);assert.equal(await read(escrow,escrowArtifact,'latestResultRevision',[five]),2n);
 assert.equal((await read(escrow,escrowArtifact,'jobs',[five]))[7],2);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),160n);
 await write(GOV,token,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const approved=await write(CLIENT,escrow,escrowArtifact,'approveResult',[five,2n,resultB]);
 const approval=approved.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(approval.length,2);assert.equal(approval[0].eventName,'JobSettled');assert.equal(approval[0].args.workerAmount,20n);assert.equal(approval[0].args.settledBy.toLowerCase(),CLIENT);
 assert.equal(approval[1].eventName,'ResultApproved');assert.equal(approval[1].args.id,five);assert.equal(approval[1].args.revision,2n);assert.equal(approval[1].args.resultHash,resultB);
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 const resultPaymentPolicy={...await policyFor(five,20n),transactionHash:approved.transactionHash,revision:'2',resultHash:resultB};
 // The PREEXISTING101sec expiry jump can put this local receipt in the future.
 // Wait for REAL host time before starting the unchanged20sec reader; never alter its clock/header gates.
 const resultReceiptAt=Number((await rpc.getBlock({blockNumber:approved.blockNumber})).timestamp)*1000;
 assert.ok(Number.isSafeInteger(resultReceiptAt));let fixtureNow=Date.now();const fixtureWaitDeadline=fixtureNow+60000;
 assert.ok(resultReceiptAt-fixtureNow<=60000,'fixture timestamp outside bounded wall wait');
 while(fixtureNow<resultReceiptAt){await new Promise(r=>setTimeout(r,Math.min(5000,resultReceiptAt-fixtureNow)));const now=Date.now();assert.ok(Number.isSafeInteger(now)&&now>=fixtureNow&&now<=fixtureWaitDeadline,'fixture wait clock invalid or expired');fixtureNow=now;}
 const expiryPolicy={...await policyFor(four,30n),transactionHash:expiredRefund.transactionHash,caller:GOV};
 const expiry=await inspectWorkExpiredCancellationReceipt(observers,expiryPolicy);assert.equal(expiry.workerPaid,'0');assert.equal(expiry.clientRefund,'30');assert.equal(expiry.cancellationCaller,GOV);assert.equal(expiry.executionAuthorized,false);
 assert.equal((await inspectWorkExpiredCancellationReceipt(observers,expiryPolicy)).evidenceId,expiry.evidenceId);
 await assert.rejects(inspectWorkExpiredCancellationReceipt(observers,{...expiryPolicy,caller:WORKER}));
 const {caller,...expiredBase}=expiryPolicy;await assert.rejects(inspectWorkCancellationReceipt(observers,expiredBase));
 await assert.rejects(inspectWorkExpiredCancellationReceipt(observers,{...cancelPolicy,caller:GOV}));
 const arbitrationPolicy={...await policyFor(three,100n),transactionHash:arbitratedSplit.transactionHash,workerAmount:'60'};
 const arbitration=await inspectWorkArbitrationReceipt(observers,arbitrationPolicy);assert.equal(arbitration.workerPaid,'60');assert.equal(arbitration.clientRefund,'40');assert.equal(arbitration.directArbitrationObserved,true);assert.equal(arbitration.disputeFairnessVerified,false);assert.equal(arbitration.executionAuthorized,false);
 assert.equal((await inspectWorkArbitrationReceipt(observers,arbitrationPolicy)).evidenceId,arbitration.evidenceId);
 await assert.rejects(inspectWorkArbitrationReceipt(observers,{...arbitrationPolicy,workerAmount:'59'}));
 const {workerAmount,...arbitrationBase}=arbitrationPolicy;await assert.rejects(inspectWorkPaymentReceipt(observers,arbitrationBase));await assert.rejects(inspectWorkCancellationReceipt(observers,arbitrationBase));
 await assert.rejects(inspectWorkArbitrationReceipt(observers,{...paymentPolicy,workerAmount:'100'}));
 const resultPayment=await inspectWorkResultPaymentReceipt(observers,resultPaymentPolicy);assert.deepEqual(resultPayment.approvedResult,{revision:'2',resultHash:resultB});assert.equal(resultPayment.workerPaid,'20');assert.equal(resultPayment.executionAuthorized,false);
 assert.equal((await inspectWorkResultPaymentReceipt(observers,resultPaymentPolicy)).evidenceId,resultPayment.evidenceId);
 await assert.rejects(inspectWorkResultPaymentReceipt(observers,{...resultPaymentPolicy,revision:'1'}));
 await assert.rejects(inspectWorkPaymentReceipt(observers,{...await policyFor(five,20n),transactionHash:approved.transactionHash}));
 await write(CLIENT,escrow,escrowArtifact,'approveResult',[five,2n,resultB],false);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[five,2n,resultA],false);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[five,1n]),resultA);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[escrow]),0n);assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1820n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),180n);
 stage='worker waiver refunds only original client with current result revision';
 const six=await fund(15n);await write(WORKER,escrow,escrowArtifact,'accept',[six]);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[six,0n,resultA]);
 await write(CLIENT,escrow,escrowArtifact,'waivePayment',[six,1n],false);
 await write(WORKER,escrow,escrowArtifact,'waivePayment',[six,0n],false);
 await write(GOV,token,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(WORKER,escrow,escrowArtifact,'waivePayment',[six,1n],false);
 assert.equal((await read(escrow,escrowArtifact,'jobs',[six]))[7],2);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),15n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1805n);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[six,1n]),resultA);
 await write(GOV,token,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const waived=await write(WORKER,escrow,escrowArtifact,'waivePayment',[six,1n]);
 const waiverEvents=waived.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(waiverEvents.length,2);assert.equal(waiverEvents[0].eventName,'JobSettled');
 assert.equal(waiverEvents[0].args.id,six);assert.equal(waiverEvents[0].args.workerAmount,0n);assert.equal(waiverEvents[0].args.clientRefund,15n);assert.equal(waiverEvents[0].args.settledBy.toLowerCase(),WORKER);
 assert.equal(waiverEvents[1].eventName,'PaymentWaived');assert.equal(waiverEvents[1].args.id,six);assert.equal(waiverEvents[1].args.worker.toLowerCase(),WORKER);assert.equal(waiverEvents[1].args.resultRevision,1n);
 const transfer=waived.logs.find(l=>l.address.toLowerCase()===token.toLowerCase());
 const paidBack=decodeEventLog({abi:assetArtifact.abi,data:transfer.data,topics:transfer.topics});
 assert.equal(paidBack.eventName,'Transfer');assert.equal(paidBack.args.from.toLowerCase(),escrow.toLowerCase());assert.equal(paidBack.args.to.toLowerCase(),CLIENT);assert.equal(paidBack.args.value,15n);
 await write(WORKER,escrow,escrowArtifact,'waivePayment',[six,1n],false);
 await write(CLIENT,escrow,escrowArtifact,'approvePayment',[six],false);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[six,1n]),resultA);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1820n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),180n);
 stage='worker decline';
 const seven=await fund(25n);
 await write(CLIENT,escrow,escrowArtifact,'decline',[seven],false);
 await write(GOV,token,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(WORKER,escrow,escrowArtifact,'decline',[seven],false);
 assert.equal((await read(escrow,escrowArtifact,'jobs',[seven]))[7],1);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),25n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1795n);
 await write(GOV,token,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const declined=await write(WORKER,escrow,escrowArtifact,'decline',[seven]);
 const declineEvents=declined.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(declineEvents.length,2);assert.equal(declineEvents[0].eventName,'JobSettled');
 assert.equal(declineEvents[0].args.id,seven);assert.equal(declineEvents[0].args.workerAmount,0n);assert.equal(declineEvents[0].args.clientRefund,25n);assert.equal(declineEvents[0].args.settledBy.toLowerCase(),WORKER);
 assert.equal(declineEvents[1].eventName,'JobDeclined');assert.equal(declineEvents[1].args.id,seven);assert.equal(declineEvents[1].args.worker.toLowerCase(),WORKER);
 const declineTransfer=declined.logs.find(l=>l.address.toLowerCase()===token.toLowerCase());
 const declinedRefund=decodeEventLog({abi:assetArtifact.abi,data:declineTransfer.data,topics:declineTransfer.topics});
 assert.equal(declinedRefund.eventName,'Transfer');assert.equal(declinedRefund.args.from.toLowerCase(),escrow.toLowerCase());assert.equal(declinedRefund.args.to.toLowerCase(),CLIENT);assert.equal(declinedRefund.args.value,25n);
 // The existing expiry jump may still put later worker receipts ahead of real host time.
 const workerReceiptAt=Number((await rpc.getBlock({blockNumber:declined.blockNumber})).timestamp)*1000;
 assert.ok(Number.isSafeInteger(workerReceiptAt));let workerNow=Date.now();const workerWaitDeadline=workerNow+60000;
 assert.ok(workerReceiptAt-workerNow<=60000,'worker fixture timestamp outside bounded wall wait');
 while(workerNow<workerReceiptAt){await new Promise(r=>setTimeout(r,Math.min(5000,workerReceiptAt-workerNow)));const now=Date.now();assert.ok(Number.isSafeInteger(now)&&now>=workerNow&&now<=workerWaitDeadline,'worker fixture wait clock invalid');workerNow=now;}
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 const declinePolicy={...await policyFor(seven,25n),transactionHash:declined.transactionHash,refundKind:'decline'};
 const waiverPolicy={...await policyFor(six,15n),transactionHash:waived.transactionHash,refundKind:'waiver',expectedRevision:'1'};
 for(const [policy,kind,amount] of [[declinePolicy,'decline','25'],[waiverPolicy,'waiver','15']]){
  const refund=await inspectWorkWorkerRefundReceipt(observers,policy);assert.equal(refund.workerRefund.kind,kind);assert.equal(refund.clientRefund,amount);assert.equal(refund.workerPaid,'0');assert.equal(refund.executionAuthorized,false);
  assert.equal((await inspectWorkWorkerRefundReceipt(observers,policy)).evidenceId,refund.evidenceId);
  const {refundKind,expectedRevision,...base}=policy;await assert.rejects(inspectWorkCancellationReceipt(observers,base));await assert.rejects(inspectWorkPaymentReceipt(observers,base));
 }
 await assert.rejects(inspectWorkWorkerRefundReceipt(observers,{...waiverPolicy,expectedRevision:'0'}));
 await assert.rejects(inspectWorkWorkerRefundReceipt(observers,{...paymentPolicy,refundKind:'decline'}));
 await write(WORKER,escrow,escrowArtifact,'decline',[seven],false);
 await write(WORKER,escrow,escrowArtifact,'accept',[seven],false);
 await write(CLIENT,escrow,escrowArtifact,'cancel',[seven],false);
 assert.equal((await read(escrow,escrowArtifact,'jobs',[seven]))[7],4);
 assert.equal(await read(escrow,escrowArtifact,'fundingJobs',[CLIENT,fundingId]),one);
 assert.equal(await read(escrow,escrowArtifact,'nextJob'),8n);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1820n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),180n);
 stage='revision-bound party dispute and arbitration';
 const eight=await fund(10n);await write(WORKER,escrow,escrowArtifact,'accept',[eight]);
 const hashA='0x'+'aa'.repeat(32),hashB='0x'+'bb'.repeat(32);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[eight,0n,hashA]);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[eight,1n,hashB]);
 await write(CLIENT,escrow,escrowArtifact,'disputeResult',[eight,1n,hashA],false);
 assert.equal(await read(escrow,escrowArtifact,'disputedResultRevision',[eight]),0n);
 const disputed=await write(CLIENT,escrow,escrowArtifact,'disputeResult',[eight,2n,hashB]);
 const bound=disputed.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(bound.length,2);assert.equal(bound[0].eventName,'JobDisputed');assert.equal(bound[1].eventName,'ResultDisputed');
 assert.equal(bound[1].args.id,eight);assert.equal(bound[1].args.revision,2n);assert.equal(bound[1].args.resultHash,hashB);assert.equal(bound[1].args.openedBy.toLowerCase(),CLIENT);
 await write(WORKER,escrow,escrowArtifact,'submitResult',[eight,2n,hashA],false);
 await write(ARB,escrow,escrowArtifact,'resolve',[eight,4n]);
 assert.equal(await read(escrow,escrowArtifact,'disputedResultRevision',[eight]),2n);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[eight,2n]),hashB);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1816n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),184n);
 stage='atomic revision-bound client approvals across two assets';
 await write(GOV,secondToken,assetArtifact,'mint',[CLIENT,1000n]);
 const nine=await fund(100n),ten=await fund(80n,secondToken);
 for(const id of [nine,ten]){await write(WORKER,escrow,escrowArtifact,'accept',[id]);await write(WORKER,escrow,escrowArtifact,'submitResult',[id,0n,hashA]);}
 const approvals=[{id:nine,revision:1n,resultHash:hashA},{id:ten,revision:1n,resultHash:hashA}];
 await write(WORKER,escrow,escrowArtifact,'submitResult',[ten,1n,hashB]);
 const staleBatch=await write(CLIENT,escrow,escrowArtifact,'approveResultsMany',[approvals],false);assert.equal(staleBatch.logs.length,0);
 assert.equal((await read(escrow,escrowArtifact,'jobs',[nine]))[7],2);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),184n);
 approvals[1]={id:ten,revision:2n,resultHash:hashB};
 await write(GOV,secondToken,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 const failedBatch=await write(CLIENT,escrow,escrowArtifact,'approveResultsMany',[approvals],false);assert.equal(failedBatch.logs.length,0);
 for(const [id,asset,amount] of [[nine,token,100n],[ten,secondToken,80n]]){
  assert.equal((await read(escrow,escrowArtifact,'jobs',[id]))[7],2);assert.equal(await read(escrow,escrowArtifact,'reserved',[asset]),amount);assert.equal(await read(asset,assetArtifact,'balanceOf',[escrow]),amount);
 }
 assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),184n);assert.equal(await read(secondToken,assetArtifact,'balanceOf',[WORKER]),0n);
 await write(GOV,secondToken,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const batchPaid=await write(CLIENT,escrow,escrowArtifact,'approveResultsMany',[approvals]);
 const batchEvents=batchPaid.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.deepEqual(batchEvents.map(l=>l.eventName),['JobSettled','ResultApproved','JobSettled','ResultApproved']);
 for(const [i,a] of approvals.entries()){
  const settlement=batchEvents[i*2].args,approval=batchEvents[i*2+1].args;
  assert.equal(settlement.id,a.id);assert.equal(settlement.workerAmount,i===0?100n:80n);assert.equal(settlement.clientRefund,0n);assert.equal(settlement.settledBy.toLowerCase(),CLIENT);
  assert.equal(approval.id,a.id);assert.equal(approval.revision,a.revision);assert.equal(approval.resultHash,a.resultHash);
  assert.equal((await read(escrow,escrowArtifact,'jobs',[a.id]))[7],4);
 }
 const batchTransfers=batchPaid.logs.filter(l=>[token.toLowerCase(),secondToken.toLowerCase()].includes(l.address.toLowerCase())).map(l=>({...decodeEventLog({abi:assetArtifact.abi,data:l.data,topics:l.topics}),asset:l.address.toLowerCase()}));assert.equal(batchTransfers.length,2);
 for(const [i,t] of batchTransfers.entries()){assert.equal(t.eventName,'Transfer');assert.equal(t.asset,(i===0?token:secondToken).toLowerCase());assert.equal(t.args.from.toLowerCase(),escrow.toLowerCase());assert.equal(t.args.to.toLowerCase(),WORKER);assert.equal(t.args.value,i===0?100n:80n);}
 await write(CLIENT,escrow,escrowArtifact,'approveResultsMany',[approvals],false);
 assert.equal(await read(escrow,escrowArtifact,'resultHashes',[nine,1n]),hashA);assert.equal(await read(escrow,escrowArtifact,'resultHashes',[ten,2n]),hashB);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);assert.equal(await read(escrow,escrowArtifact,'reserved',[secondToken]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),284n);assert.equal(await read(secondToken,assetArtifact,'balanceOf',[WORKER]),80n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1716n);assert.equal(await read(secondToken,assetArtifact,'balanceOf',[CLIENT]),920n);
 // The earlier expiry drill advanced VM time by101sec; keep the fresh-state
 // observer's original checks before that jump. Batch evidence here is exact
 // transaction receipts and stored state/history, not a fresh-state observation.
 stage='selected result-batch receipt reader';
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 const batchAt=Number((await rpc.getBlock({blockNumber:batchPaid.blockNumber})).timestamp)*1000;
 let batchNow=Date.now();const batchWaitEnd=batchNow+60000;assert.ok(Number.isSafeInteger(batchAt)&&batchAt-batchNow<=60000);
 while(batchNow<batchAt){await new Promise(r=>setTimeout(r,Math.min(5000,batchAt-batchNow)));const next=Date.now();assert.ok(Number.isSafeInteger(next)&&next>=batchNow&&next<=batchWaitEnd);batchNow=next;}
 const expectedApprovals=approvals.map(a=>({id:a.id.toString(),revision:a.revision.toString(),resultHash:a.resultHash})),batchIds=[],allBatchPolicies=[];
 for(const [i,a]of approvals.entries()){
  const selectedAsset=i===0?token:secondToken,amount=i===0?100n:80n;
  const policy={...await policyFor(a.id,amount),asset:selectedAsset.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:selectedAsset})),transactionHash:batchPaid.transactionHash,approvals:expectedApprovals};
  allBatchPolicies.push(policy);
  const observed=await inspectWorkBatchResultPaymentReceipt(observers,policy);
  assert.equal(observed.workerPaid,amount.toString());assert.equal(observed.batchJobIndex,i);assert.equal(observed.batchJobCount,2);assert.equal(observed.otherBatchJobsVerified,false);assert.equal(observed.executionAuthorized,false);
  assert.equal((await inspectWorkBatchResultPaymentReceipt(observers,policy)).evidenceId,observed.evidenceId);batchIds.push(observed.evidenceId);
  await assert.rejects(inspectWorkBatchResultPaymentReceipt(observers,{...policy,amount:(amount-1n).toString()}));
  const {approvals:ignored,...base}=policy;await assert.rejects(inspectWorkResultPaymentReceipt(observers,{...base,revision:a.revision.toString(),resultHash:a.resultHash}));
 }
 assert.notEqual(batchIds[0],batchIds[1]);
 const allObserved=await inspectAllWorkBatchResultPayments(observers,allBatchPolicies);
 assert.equal(allObserved.allCallEntriesObserved,true);assert.deepEqual(allObserved.payments.map(p=>p.workerPaid),['100','80']);assert.deepEqual(allObserved.payments.map(p=>p.evidenceId),batchIds);assert.equal(allObserved.executionAuthorized,false);
 const allReplay=await inspectAllWorkBatchResultPayments(observers,allBatchPolicies);assert.equal(allReplay.receiptConsistencyDigest,allObserved.receiptConsistencyDigest);assert.deepEqual(allReplay.payments.map(p=>p.evidenceId),batchIds);
 await assert.rejects(inspectAllWorkBatchResultPayments(observers,[allBatchPolicies[0],{...allBatchPolicies[1],amount:'79'}]));
 // BEGIN compiled observation-book drill: reads only against the existing paid batch.
 {
  stage='durable observation book against compiled two-asset batch';
  const dir=mkdtempSync(join(tmpdir(),'fortune-compiled-work-book-')),path=join(dir,'observations.sqlite');
  const bookPolicy=Object.fromEntries(['chainId','escrow','escrowCodeHash','governor','guardian','arbitrator','client'].map(k=>[k,allBatchPolicies[0][k]]));
  const chainState=async()=>({
   head:await rpc.getBlockNumber({cacheTime:0}),
   nonces:await Promise.all([GOV,GUARD,ARB,CLIENT,WORKER].flatMap(address=>['latest','pending'].map(blockTag=>rpc.getTransactionCount({address,blockTag})))),
   balances:await Promise.all([token,secondToken].flatMap(asset=>[escrow,CLIENT,WORKER].map(who=>read(asset,assetArtifact,'balanceOf',[who])))),
   reserved:await Promise.all([token,secondToken].map(asset=>read(escrow,escrowArtifact,'reserved',[asset]))),
  });
  const chainBefore=await chainState();let book;
  try{
   WorkBatchObservationBook.initialize(path,bookPolicy,{enabled:true});
   book=new WorkBatchObservationBook(path,bookPolicy,{enabled:true,readOnly:false});
   const initial=book.read().head,recorded=await book.capture(observers,allBatchPolicies,initial),saved=book.read();
   assert.equal(recorded.inserted,true);assert.equal(saved.total,1);assert.equal(saved.quarantined,false);
   assert.deepEqual(saved.entries[0].observation.payments.map(p=>p.evidenceId),batchIds);
   assert.deepEqual(saved.entries[0].observation.payments.map(p=>p.asset),[token,secondToken].map(a=>a.toLowerCase()));
   assert.deepEqual(saved.entries[0].observation.payments.map(p=>p.workerPaid),['100','80']);
   assert.equal(saved.entries[0].observation.receiptConsistencyDigest,allObserved.receiptConsistencyDigest);
   assert.equal(saved.currentAuthorization,null);assert.equal(saved.executionAuthorized,false);assert.equal(saved.fullSyndicateReadiness,false);
   book.close();book=undefined;
   const readonly=new WorkBatchObservationBook(path,bookPolicy,{enabled:true});
   try{assert.deepEqual(readonly.read(),saved);await assert.rejects(readonly.capture(observers,allBatchPolicies,initial),/read-only/);}finally{readonly.close();}
   book=new WorkBatchObservationBook(path,bookPolicy,{enabled:true,readOnly:false});
   const replay=await book.capture(observers,allBatchPolicies,initial);
   assert.equal(replay.inserted,false);assert.equal(replay.digest,recorded.digest);
   assert.equal(replay.recordedAtMs,recorded.recordedAtMs);assert.equal(replay.readerObservedAtMs,recorded.readerObservedAtMs);
   assert.deepEqual(book.read(),saved);
   await assert.rejects(book.capture(observers,[allBatchPolicies[0],{...allBatchPolicies[1],amount:'79'}],initial));
   assert.deepEqual(book.read(),saved);
   const db=new DatabaseSync(path,{readOnly:true});
   try{
    assert.equal(db.prepare('SELECT count(*) AS n FROM batch_observations').get().n,1);
    const actual=db.prepare('SELECT evidence_id,job_id,sequence FROM batch_receipts ORDER BY evidence_id').all().map(row=>({...row}));
    const expected=allBatchPolicies.map((p,i)=>({evidence_id:batchIds[i],job_id:p.jobId,sequence:1})).sort((a,b)=>a.evidence_id<b.evidence_id?-1:1);
    assert.deepEqual(actual,expected);
   }finally{db.close();}
   assert.deepEqual(await chainState(),chainBefore);
  }finally{book?.close();rmSync(dir,{recursive:true,force:true});}
 }
 // END compiled observation-book drill.
 {
 stage='atomic worker result submissions on separate two-asset escrow';
 const submissionTokens=[await deploy(assetArtifact),await deploy(assetArtifact)];
 const submissionAssets=await Promise.all([...submissionTokens].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).map(async token=>({token,codeHash:keccak256(await rpc.getCode({address:token})),maxPerJob:1000n})));
 const submissionEscrow=await deploy(escrowArtifact,[GOV,GUARD,ARB,submissionAssets]);
 await write(GOV,submissionEscrow,escrowArtifact,'setPaused',[false]);
 const submissionIds=[];
 for(const [i,t]of submissionTokens.entries()){
  const amount=i===0?10n:20n;await write(GOV,t,assetArtifact,'mint',[CLIENT,100n]);
  await write(CLIENT,t,assetArtifact,'approve',[submissionEscrow,amount]);
  const now=Number((await rpc.getBlock()).timestamp);
  const funded=await write(CLIENT,submissionEscrow,escrowArtifact,'fund',[WORKER,t,amount,hashA,BigInt(now+100),BigInt(now+200)]);
  const id=decodeEventLog({abi:escrowArtifact.abi,data:funded.logs.at(-1).data,topics:funded.logs.at(-1).topics}).args.id;
  submissionIds.push(id);await write(WORKER,submissionEscrow,escrowArtifact,'accept',[id]);
 }
 const submissions=submissionIds.map((id,i)=>({id,expectedRevision:0n,resultHash:i===0?hashA:hashB}));
 const submitted=await write(WORKER,submissionEscrow,escrowArtifact,'submitResultsMany',[submissions]);
 assert.equal(submitted.logs.length,2);
 for(const [i,l]of submitted.logs.entries()){
  const e=decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics});assert.equal(l.address.toLowerCase(),submissionEscrow.toLowerCase());
  assert.equal(e.eventName,'ResultSubmitted');assert.equal(e.args.id,submissionIds[i]);assert.equal(e.args.worker.toLowerCase(),WORKER);assert.equal(e.args.revision,1n);assert.equal(e.args.resultHash,submissions[i].resultHash);
  assert.equal(await read(submissionEscrow,escrowArtifact,'reserved',[submissionTokens[i]]),i===0?10n:20n);assert.equal(await read(submissionTokens[i],assetArtifact,'balanceOf',[WORKER]),0n);
 }
 const replayed=await write(WORKER,submissionEscrow,escrowArtifact,'submitResultsMany',[submissions],false);assert.equal(replayed.logs.length,0);
 const nextSubmissions=submissionIds.map((id,i)=>({id,expectedRevision:1n,resultHash:i===0?hashB:hashA}));
 const invalid=await write(WORKER,submissionEscrow,escrowArtifact,'submitResultsMany',[[nextSubmissions[0],{...nextSubmissions[1],expectedRevision:0n}]],false);assert.equal(invalid.logs.length,0);
 for(const [i,id]of submissionIds.entries()){assert.equal(await read(submissionEscrow,escrowArtifact,'latestResultRevision',[id]),1n);assert.equal(await read(submissionEscrow,escrowArtifact,'resultHashes',[id,1n]),submissions[i].resultHash);assert.equal(await read(submissionEscrow,escrowArtifact,'resultHashes',[id,2n]),'0x'+'00'.repeat(32));}
 await write(GUARD,submissionEscrow,escrowArtifact,'setPaused',[true]);
 const pausedSubmission=await write(WORKER,submissionEscrow,escrowArtifact,'submitResultsMany',[nextSubmissions],false);assert.equal(pausedSubmission.logs.length,0);
 await write(GOV,submissionEscrow,escrowArtifact,'setPaused',[false]);
 const retried=await write(WORKER,submissionEscrow,escrowArtifact,'submitResultsMany',[nextSubmissions]);assert.equal(retried.logs.length,2);
 const staleApprovals=submissions.map(a=>({id:a.id,revision:1n,resultHash:a.resultHash}));
 const stale=await write(CLIENT,submissionEscrow,escrowArtifact,'approveResultsMany',[staleApprovals],false);assert.equal(stale.logs.length,0);
 const latestApprovals=nextSubmissions.map(a=>({id:a.id,revision:2n,resultHash:a.resultHash}));
 const submissionPaid=await write(CLIENT,submissionEscrow,escrowArtifact,'approveResultsMany',[latestApprovals]);assert.equal(submissionPaid.logs.length,6);
 for(const [i,id]of submissionIds.entries()){
  assert.equal(await read(submissionEscrow,escrowArtifact,'resultHashes',[id,1n]),submissions[i].resultHash);assert.equal(await read(submissionEscrow,escrowArtifact,'resultHashes',[id,2n]),nextSubmissions[i].resultHash);
  assert.equal(await read(submissionEscrow,escrowArtifact,'reserved',[submissionTokens[i]]),0n);assert.equal(await read(submissionTokens[i],assetArtifact,'balanceOf',[WORKER]),i===0?10n:20n);assert.equal(await read(submissionTokens[i],assetArtifact,'balanceOf',[CLIENT]),i===0?90n:80n);assert.equal(await read(submissionTokens[i],assetArtifact,'balanceOf',[submissionEscrow]),0n);
  assert.equal((await read(submissionEscrow,escrowArtifact,'jobs',[id]))[7],4);
  const events=submissionPaid.logs.slice(i*3,i*3+3);const transfer=decodeEventLog({abi:assetArtifact.abi,data:events[0].data,topics:events[0].topics});const settled=decodeEventLog({abi:escrowArtifact.abi,data:events[1].data,topics:events[1].topics});const approved=decodeEventLog({abi:escrowArtifact.abi,data:events[2].data,topics:events[2].topics});
  assert.equal(transfer.eventName,'Transfer');assert.equal(events[0].address.toLowerCase(),submissionTokens[i].toLowerCase());assert.equal(transfer.args.from.toLowerCase(),submissionEscrow.toLowerCase());assert.equal(transfer.args.value,i===0?10n:20n);assert.equal(transfer.args.to.toLowerCase(),WORKER);assert.equal(settled.eventName,'JobSettled');assert.equal(settled.args.id,id);assert.equal(settled.args.workerAmount,i===0?10n:20n);assert.equal(settled.args.clientRefund,0n);assert.equal(settled.args.settledBy.toLowerCase(),CLIENT);assert.equal(approved.eventName,'ResultApproved');assert.equal(approved.args.id,id);assert.equal(approved.args.revision,2n);assert.equal(approved.args.resultHash,nextSubmissions[i].resultHash);
 }
 // Preserve the original ten-job escrow's balances, liabilities and history.
 assert.equal(await read(escrow,escrowArtifact,'nextJob'),11n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),284n);assert.equal(await read(secondToken,assetArtifact,'balanceOf',[WORKER]),80n);
 }
 const result={chainId:97,legacyFundingReceiptObserved:true,idBoundFundingReceiptObserved:true,fundingEvidenceReplayStable:true,wrongFundingTermsRejected:true,fundingReadsPreserveChainState:true,fundingCliBothModesObserved:true,fundingCliEvidenceMatchesReader:true,fundingCliReplayStable:true,fundingCliWrongTermsRejected:true,compiledBatchBookRecorded:true,compiledBatchBookReplayPreservedOriginalTimes:true,compiledBatchBookBadLaterPolicyRejected:true,compiledBatchBookReadOnlyReopenMatched:true,compiledBatchBookReadOnlyChainStateUnchanged:true,compiledBatchBookUniqueReceipts:true,compiledBatchBookBatches:1,compiledBatchBookJobs:2,atomicWorkerResultBatchSubmitted:true,lateWorkerBatchFailureKeepsHistory:true,workerBatchReplayRejected:true,workerBatchExactRetryAfterPause:true,workerBatchLatestApprovalReceiptsBound:true,workerSubmissionFixtureJobs:2,allBatchJobsReceiptObserved:true,allBatchReceiptDigestAndReplayStable:true,wrongLaterBatchJobRejected:true,selectedBatchPaymentsObserved:true,selectedBatchEvidenceStableAndDistinct:true,wrongSelectedBatchAmountRejected:true,directAndBatchResultReadersSeparated:true,actualWorkPaymentCliMatched:true,workPaymentCliEvidenceStable:true,workPaymentCliWrongAmountRejected:true,arbitratedSplitReceiptObserved:true,arbitrationZeroAndFullReceiptsObserved:true,arbitrationEvidenceIdStable:true,wrongArbitratedAmountRejected:true,arbitrationPaymentCancellationReadersSeparated:true,workerDeclineReceiptObserved:true,workerWaiverReceiptObserved:true,workerRefundEvidenceIdsStable:true,staleWaiverReceiptRevisionRejected:true,workerRefundPaymentCancellationReadersSeparated:true,expiredCancellationReceiptObserved:true,expiredCancellationEvidenceIdStable:true,wrongExpiryCallerRejected:true,directExpiredCancellationReadersSeparated:true,directClientCancellationReceiptObserved:true,cancellationEvidenceIdStable:true,wrongCancellationAmountRejected:true,paymentCancellationReadersSeparated:true,directResultPaymentReceiptObserved:true,resultPaymentEvidenceIdStable:true,wrongResultRevisionRejected:true,legacyReaderRejectsResultReceipt:true,directWholePaymentReceiptObserved:true,repeatedPaymentEvidenceIdStable:true,wrongPaymentAmountRejected:true,atomicResultBatchReceiptsBound:true,staleLaterResultBatchRejected:true,lateBatchPaymentFailureRollsBackAll:true,exactResultBatchRetrySucceeded:true,resultBatchReplayRejected:true,actualWorkJobCliStatesMatched:true,actualWorkJobCliResultHistoryMatched:true,settledCliDoesNotInferPayment:true,actualPinnedJobStatesObserved:true,pausedJobObserved:true,actualResultHistoryObserved:true,foreignTermsObservationRejected:true,settledStorageDoesNotInferPayment:true,revisionBoundDisputeReceiptObserved:true,staleResultDisputeRejected:true,disputedRevisionSurvivesSettlement:true,localOnly:true,clientScopedFundingIdObserved:true,fundedApprovedReplayRejectedBeforeAndAfterSettlement:true,compiledWorkEscrowDeployed:true,fundedJobs:10,settledJobs:10,workerDeclineRefundReceiptBound:true,inexactDeclinePreservesFundedLiability:true,declinedJobCannotBeAcceptedOrCancelled:true,workerWaiverRefundReceiptBound:true,staleWaiverRejected:true,inexactWaiverPreservesLiability:true,clientApprovalReceiptBound:true,workerResultHistoryObserved:true,revisionBoundPaymentReceiptObserved:true,staleResultApprovalRejected:true,inexactResultPaymentRetainsLiability:true,
  workerPaidUnits:'284',workerSecondAssetPaidUnits:'80',clientFinalUnits:'1716',clientSecondAssetFinalUnits:'920',finalReserved:'0',cancellationAndExpiryRefundedClient:true,disputeSplitSettled:true,
  governorCannotArbitrate:true,guardianCannotOpen:true,pausedPaymentRejected:true,duplicatePaymentRejected:true,inexactSplitRetainsLiability:true,explicitRetrySucceeded:true,
  generatedAccounts:0,privateKeysUsed:false,publicBroadcasts:false,independentProvidersVerified:false,workDeliveryVerified:false,
  workerIdentityVerified:false,disputeFairnessVerified:false,deployedToPublicNetwork:false,fullSyndicateReadiness:false,executionAuthorized:false};
 mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch{console.error(`Local work escrow verification failed at ${stage}; no public transaction was submitted.`);process.exitCode=1;}
finally{if(node&&node.exitCode===null){node.kill('SIGTERM');const force=setTimeout(()=>node.kill('SIGKILL'),3000);await once(node,'exit').catch(()=>{});clearTimeout(force);}}
