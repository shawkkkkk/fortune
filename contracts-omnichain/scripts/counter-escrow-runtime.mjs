// Actual compiled escrow -> zero-account LOCAL EVM -> viem HTTP/ABI -> receipts/state.
// All writes use a fresh loopback URL and local VM impersonation. No fork or keys.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,keccak256,toHex,decodeEventLog,decodeFunctionData} from 'viem';
import {bscTestnet} from 'viem/chains';
import {buildCounterClaimBatch} from '../../lib/counter-claims.ts';
import {buildCounterAllocation,buildCounterSnapshotFunding} from '../../lib/counter-allocation.ts';

const GOV='0x0000000000000000000000000000000000009001',GUARD='0x0000000000000000000000000000000000009002';
const ALICE='0x0000000000000000000000000000000000001001',BOB='0x0000000000000000000000000000000000001002';
const artifact=(file,name)=>JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`,import.meta.url),'utf8'));
const escrowArtifact=artifact('FortuneTestnetCounterEscrow.sol','FortuneTestnetCounterEscrow');
const assetArtifact=artifact('FortuneTestnetCounterEscrow.t.sol','CounterAssetMock');
const report=resolve('.tmp/counter-escrow-runtime.json');rmSync(report,{force:true});
let node,stage='startup',cliPolicyDir;
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
 for(const who of [GOV,GUARD]){await rpc.request({method:'anvil_impersonateAccount',params:[who]});await rpc.request({method:'anvil_setBalance',params:[who,toHex(100n*10n**18n)]});}
 const wallet=who=>createWalletClient({account:who,transport:transport(),chain:bscTestnet});
 const receipt=async(hash,success=true)=>{const r=await rpc.waitForTransactionReceipt({hash,pollingInterval:20,timeout:15000});assert.equal(r.status,success?'success':'reverted');return r;};
 const deploy=async(a,args=[])=>{const r=await receipt(await wallet(GOV).deployContract({abi:a.abi,bytecode:a.bytecode.object,args,gas:10000000n}));assert.ok(r.contractAddress);return r.contractAddress;};
 const write=(who,address,a,functionName,args=[],success=true)=>wallet(who).writeContract({address,abi:a.abi,functionName,args,gas:5000000n}).then(hash=>receipt(hash,success));
 const read=(address,a,functionName,args=[])=>rpc.readContract({address,abi:a.abi,functionName,args});
 stage='deploy isolated escrow and synthetic assets';
 const launch=await deploy(assetArtifact),first=await deploy(assetArtifact),second=await deploy(assetArtifact);
 const assets=await Promise.all([first,second].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).map(async token=>({token,codeHash:keccak256(await rpc.getCode({address:token}))})));
 const escrow=await deploy(escrowArtifact,[GOV,GUARD,launch,assets,[]]);
 assert.equal(await read(escrow,escrowArtifact,'paused'),true);
 const fund=async(token,amounts)=>{
  const total=amounts.reduce((a,b)=>a+b,0n);
  await write(GOV,token,assetArtifact,'mint',[GOV,total]);await write(GOV,token,assetArtifact,'approve',[escrow,total]);
  return write(GOV,escrow,escrowArtifact,'fundRound',[token,[ALICE,BOB],amounts]);
 };
 stage='balance snapshot allocation to actual escrow funding';
 await write(GOV,launch,assetArtifact,'mint',[ALICE,10n]);await write(GOV,launch,assetArtifact,'mint',[BOB,30n]);
 await write(GOV,first,assetArtifact,'mint',[GOV,34n]);await write(GOV,first,assetArtifact,'approve',[escrow,33n]);
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 const allocationPolicy={chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),
  governor:GOV,guardian:GUARD,launchToken:launch.toLowerCase(),launchTokenCodeHash:keccak256(await rpc.getCode({address:launch})),
  payoutAsset:first.toLowerCase(),payoutAssetCodeHash:keccak256(await rpc.getCode({address:first})),accounts:[ALICE,BOB],minimumHolding:'1',payoutBudget:'34'};
 const clients=[createPublicClient({transport:transport()}),createPublicClient({transport:transport()})];
 const allocation=await buildCounterSnapshotFunding(clients,allocationPolicy);
 mkdirSync(resolve('.tmp'),{recursive:true});
 cliPolicyDir=mkdtempSync(resolve('.tmp/counter-cli-'));const cliPolicyPath=resolve(cliPolicyDir,'policy.json');writeFileSync(cliPolicyPath,JSON.stringify(allocationPolicy),{mode:0o600,flag:'wx'});
 const cli=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/counter-funding-http.mjs','scripts/prepare-counter-funding.mjs',cliPolicyPath],{
  encoding:'utf8',timeout:25000,maxBuffer:65536,env:{...process.env,FORTUNE_COUNTER_FUNDING_READ_ENABLED:'true',FORTUNE_COUNTER_READ_RPC_URL:'https://counter-one.invalid/rpc',FORTUNE_COUNTER_SECONDARY_RPC_URL:'https://counter-two.invalid/rpc',FORTUNE_TEST_COUNTER_RPC:`http://127.0.0.1:${port}`}});
 assert.equal(cli.status,0);const cliReview=JSON.parse(cli.stdout);
 assert.equal(cliReview.allocation.data,allocation.data);assert.equal(cliReview.currentAuthorization,null);assert.equal(cliReview.executionAuthorized,false);
 rmSync(cliPolicyDir,{recursive:true});cliPolicyDir=undefined;
 const bound=decodeFunctionData({abi:escrowArtifact.abi,data:allocation.data});
 assert.equal(bound.functionName,'fundSnapshotRound');
 for(const patch of [{expectedRound:2n},{blockHash:'0x'+'11'.repeat(32)},{deadline:0n}]){
  await write(GOV,escrow,escrowArtifact,'fundSnapshotRound',[...bound.args.slice(0,3),{...bound.args[3],...patch}],false);
 }
 assert.equal(await read(escrow,escrowArtifact,'nextRound'),1n);
 assert.equal(await read(first,assetArtifact,'allowance',[GOV,escrow]),33n);
 assert.equal(allocation.fundedAmount,'33');assert.equal(allocation.unallocatedDust,'1');assert.equal(allocation.executionAuthorized,false);
 await assert.rejects(buildCounterAllocation(clients,{...allocationPolicy,accounts:[ALICE]}),/cover/);
 await receipt(await wallet(GOV).sendTransaction({to:escrow,data:cliReview.allocation.data,gas:5000000n}));
 assert.equal(await read(escrow,escrowArtifact,'claimable',[1n,ALICE]),8n);assert.equal(await read(escrow,escrowArtifact,'claimable',[1n,BOB]),25n);
 const snapshot=await read(escrow,escrowArtifact,'roundSnapshots',[1n]);
 assert.equal(snapshot[0],1n);assert.equal(snapshot[1],BigInt(allocation.blockNumber));assert.equal(snapshot[2],allocation.blockHash);
 assert.equal(snapshot[3],BigInt(allocation.deadline));
 await write(GOV,first,assetArtifact,'mint',[GOV,33n]);await write(GOV,first,assetArtifact,'approve',[escrow,33n]);
 await receipt(await wallet(GOV).sendTransaction({to:escrow,data:cliReview.allocation.data,gas:5000000n}),false);
 assert.equal(await read(escrow,escrowArtifact,'nextRound'),2n);assert.equal(await read(first,assetArtifact,'allowance',[GOV,escrow]),33n);
 await fund(second,[37n,41n]);
 await write(GOV,escrow,escrowArtifact,'claim',[1n,ALICE],false);
 await write(GUARD,escrow,escrowArtifact,'setPaused',[false],false);
 await write(GOV,escrow,escrowArtifact,'setPaused',[false]);
 stage='unsigned claim batch review through actual two-client reader';
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 const claimPolicy={chainId:97,escrow:allocationPolicy.escrow,escrowCodeHash:allocationPolicy.escrowCodeHash,governor:GOV,guardian:GUARD,
  launchToken:allocationPolicy.launchToken,launchTokenCodeHash:allocationPolicy.launchTokenCodeHash,recipient:BOB,rounds:['1','2'],
  assets:await Promise.all([first,second].map(async token=>({token:token.toLowerCase(),codeHash:keccak256(await rpc.getCode({address:token}))})))};
 const claimReview=await buildCounterClaimBatch(clients,claimPolicy);
 assert.deepEqual(claimReview.claims.map(x=>x.amount),['25','41']);assert.equal(claimReview.executionAuthorized,false);assert.equal(claimReview.snapshotBoundCalldata,false);
 cliPolicyDir=mkdtempSync(resolve('.tmp/counter-claim-cli-'));const claimPath=resolve(cliPolicyDir,'policy.json');writeFileSync(claimPath,JSON.stringify(claimPolicy),{mode:0o600,flag:'wx'});
 const runClaimCli=()=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/counter-funding-http.mjs','scripts/prepare-counter-claims.mjs',claimPath],{
  encoding:'utf8',timeout:25000,maxBuffer:65536,env:{...process.env,FORTUNE_COUNTER_CLAIM_READ_ENABLED:'true',FORTUNE_COUNTER_READ_RPC_URL:'https://counter-one.invalid/rpc',FORTUNE_COUNTER_SECONDARY_RPC_URL:'https://counter-two.invalid/rpc',FORTUNE_TEST_COUNTER_RPC:`http://127.0.0.1:${port}`}});
 const claimCli=runClaimCli();assert.equal(claimCli.status,0);const claimCliReview=JSON.parse(claimCli.stdout);
 assert.equal(claimCliReview.review.data,claimReview.data);assert.equal(claimCliReview.review.blockHash,claimReview.blockHash);
 assert.equal(claimCliReview.review.snapshotBoundCalldata,false);assert.equal(claimCliReview.currentAuthorization,null);assert.equal(claimCliReview.executionAuthorized,false);

 stage='actual relayed claims and immutable receipt fields';
 const claimed=await write(GUARD,escrow,escrowArtifact,'claim',[1n,ALICE]);
 const logs=claimed.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(logs.length,1);assert.equal(logs[0].eventName,'Claimed');assert.equal(logs[0].args.round,1n);
 assert.equal(logs[0].args.recipient.toLowerCase(),ALICE.toLowerCase());assert.equal(logs[0].args.amount,8n);
 assert.equal(await read(first,assetArtifact,'balanceOf',[ALICE]),8n);assert.equal(await read(first,assetArtifact,'balanceOf',[GUARD]),0n);
 await write(GOV,escrow,escrowArtifact,'claim',[1n,ALICE],false);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[first]),25n);
 stage='failed transfer preserves entitlement then explicit retry succeeds';
 await write(GOV,second,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(GOV,escrow,escrowArtifact,'claim',[2n,BOB],false);
 await write(GUARD,escrow,escrowArtifact,'claimMany',[[1n,2n],BOB],false);
 assert.equal(await read(escrow,escrowArtifact,'claimable',[1n,BOB]),25n);
 assert.equal(await read(first,assetArtifact,'balanceOf',[BOB]),0n);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[first]),25n);
 assert.equal(await read(escrow,escrowArtifact,'claimable',[2n,BOB]),41n);assert.equal(await read(escrow,escrowArtifact,'reserved',[second]),78n);
 await write(GOV,second,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 const batch=await receipt(await wallet(GUARD).sendTransaction({to:escrow,data:claimCliReview.review.data,gas:5000000n}));
 const batchLogs=batch.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(batchLogs.length,2);
 for(const [i,amount] of [25n,41n].entries()){
  assert.equal(batchLogs[i].eventName,'Claimed');assert.equal(batchLogs[i].args.round,BigInt(i+1));
  assert.equal(batchLogs[i].args.recipient.toLowerCase(),BOB);assert.equal(batchLogs[i].args.amount,amount);
  assert.equal(batchLogs[i].args.asset.toLowerCase(),[first,second][i].toLowerCase());
 }
 await write(GUARD,escrow,escrowArtifact,'claimMany',[[1n,2n],BOB],false);
 await write(GOV,escrow,escrowArtifact,'claim',[2n,ALICE]);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[first]),0n);assert.equal(await read(escrow,escrowArtifact,'reserved',[second]),0n);
 assert.equal(await read(first,assetArtifact,'balanceOf',[escrow]),0n);assert.equal(await read(second,assetArtifact,'balanceOf',[escrow]),0n);
 assert.equal(await read(second,assetArtifact,'balanceOf',[GUARD]),0n);
 assert.equal(await read(first,assetArtifact,'balanceOf',[BOB]),25n);assert.equal(await read(second,assetArtifact,'balanceOf',[BOB]),41n);
 await rpc.request({method:'anvil_mine',params:['0x14','0x0']});
 await assert.rejects(buildCounterClaimBatch(clients,claimPolicy));
 const spentCli=runClaimCli();assert.equal(spentCli.status,1);assert.equal(spentCli.stdout,'');
 rmSync(cliPolicyDir,{recursive:true});cliPolicyDir=undefined;
 const result={chainId:97,actualClaimCliBytesExecuted:true,spentClaimCliRejected:true,actualClaimReviewBytesExecuted:true,spentClaimReviewRejected:true,claimReview,localOnly:true,compiledEscrowDeployed:true,fundedRounds:2,payoutAssets:2,claimsDelivered:4,batchReceiptBound:true,failedLaterAssetRollsBackWholeBatch:true,
  snapshotAllocationFunded:true,actualOperatorCliFundingBytesMatched:true,roundSnapshotAndDeadlineBound:true,staleRoundHashAndExpiryRejected:true,exactFundingReplayRejected:true,allocationBlock:allocation.blockNumber,allocationDust:allocation.unallocatedDust,incompleteAccountListRejected:true,receiptRecipientAndAmountMatched:true,relayerReceivedNothing:true,duplicateClaimRejected:true,pausedClaimRejected:true,
  guardianCannotOpen:true,inexactTransferRejected:true,failedClaimLiabilityPreserved:true,explicitRetrySucceeded:true,
  finalReserved:['0','0'],generatedAccounts:0,privateKeysUsed:false,publicBroadcasts:false,independentProvidersVerified:false,
  holderEligibilityVerified:false,feeFundingVerified:false,deployedToPublicNetwork:false,fullCounterReadiness:false,executionAuthorized:false};
 mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch{console.error(`Local counter escrow verification failed at ${stage}; no public transaction was submitted.`);process.exitCode=1;}
finally{if(cliPolicyDir)rmSync(cliPolicyDir,{recursive:true,force:true});if(node&&node.exitCode===null){node.kill('SIGTERM');const force=setTimeout(()=>node.kill('SIGKILL'),3000);await once(node,'exit').catch(()=>{});clearTimeout(force);}}
