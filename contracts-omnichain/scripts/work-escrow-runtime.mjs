// Actual compiled escrow -> zero-account LOCAL EVM -> viem HTTP/ABI -> receipts/state.
// All writes use a fresh loopback URL and local VM impersonation. No fork or keys.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,keccak256,toHex,decodeEventLog,decodeFunctionData} from 'viem';
import {bscTestnet} from 'viem/chains';


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
 const token=await deploy(assetArtifact),escrow=await deploy(escrowArtifact,[GOV,GUARD,ARB,[{token,codeHash:keccak256(await rpc.getCode({address:token})),maxPerJob:1000n}]]);
 assert.equal(await read(escrow,escrowArtifact,'paused'),true);
 await write(GUARD,escrow,escrowArtifact,'setPaused',[false],false);
 await write(GOV,escrow,escrowArtifact,'setPaused',[false]);
 await write(GOV,token,assetArtifact,'mint',[CLIENT,2000n]);
 const fund=async amount=>{const id=await read(escrow,escrowArtifact,'nextJob');const at=(await rpc.getBlock()).timestamp;
  await write(CLIENT,token,assetArtifact,'approve',[escrow,amount]);
  await write(CLIENT,escrow,escrowArtifact,'fund',[WORKER,token,amount,'0x'+'11'.repeat(32),at+100n,at+200n]);return id;};
 stage='client payment after explicit worker acceptance';
 const one=await fund(100n);await write(WORKER,escrow,escrowArtifact,'accept',[one]);
 await write(GUARD,escrow,escrowArtifact,'setPaused',[true]);
 await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one],false);
 await write(GOV,escrow,escrowArtifact,'setPaused',[false]);
 const paid=await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one]);
 const events=paid.logs.filter(l=>l.address.toLowerCase()===escrow.toLowerCase()).map(l=>decodeEventLog({abi:escrowArtifact.abi,data:l.data,topics:l.topics}));
 assert.equal(events.length,1);assert.equal(events[0].eventName,'JobSettled');assert.equal(events[0].args.id,one);assert.equal(events[0].args.workerAmount,100n);assert.equal(events[0].args.clientRefund,0n);assert.equal(events[0].args.settledBy.toLowerCase(),CLIENT);
 await write(CLIENT,escrow,escrowArtifact,'approvePayment',[one],false);
 stage='unaccepted cancellation and arbitrated dispute';
 const two=await fund(50n);await write(CLIENT,escrow,escrowArtifact,'cancel',[two]);
 const three=await fund(100n);await write(WORKER,escrow,escrowArtifact,'accept',[three]);await write(WORKER,escrow,escrowArtifact,'dispute',[three]);
 await write(GOV,escrow,escrowArtifact,'resolve',[three,60n],false);
 await write(GOV,token,assetArtifact,'configure',[true,false,'0x0000000000000000000000000000000000000000']);
 await write(ARB,escrow,escrowArtifact,'resolve',[three,60n],false);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),100n);assert.equal((await read(escrow,escrowArtifact,'jobs',[three]))[7],3);
 assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),100n);
 await write(GOV,token,assetArtifact,'configure',[false,false,'0x0000000000000000000000000000000000000000']);
 await write(ARB,escrow,escrowArtifact,'resolve',[three,60n]);
 stage='expired unaccepted job returns only client funding';
 const four=await fund(30n);await rpc.request({method:'evm_increaseTime',params:[101]});await rpc.request({method:'evm_mine'});
 await write(WORKER,escrow,escrowArtifact,'accept',[four],false);await write(GOV,escrow,escrowArtifact,'cancel',[four]);
 assert.equal(await read(escrow,escrowArtifact,'reserved',[token]),0n);
 assert.equal(await read(token,assetArtifact,'balanceOf',[escrow]),0n);assert.equal(await read(token,assetArtifact,'balanceOf',[CLIENT]),1840n);assert.equal(await read(token,assetArtifact,'balanceOf',[WORKER]),160n);
 const result={chainId:97,localOnly:true,compiledWorkEscrowDeployed:true,fundedJobs:4,settledJobs:4,clientApprovalReceiptBound:true,
  workerPaidUnits:'160',clientFinalUnits:'1840',finalReserved:'0',cancellationAndExpiryRefundedClient:true,disputeSplitSettled:true,
  governorCannotArbitrate:true,guardianCannotOpen:true,pausedPaymentRejected:true,duplicatePaymentRejected:true,inexactSplitRetainsLiability:true,explicitRetrySucceeded:true,
  generatedAccounts:0,privateKeysUsed:false,publicBroadcasts:false,independentProvidersVerified:false,workDeliveryVerified:false,
  workerIdentityVerified:false,disputeFairnessVerified:false,deployedToPublicNetwork:false,fullSyndicateReadiness:false,executionAuthorized:false};
 mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch{console.error(`Local work escrow verification failed at ${stage}; no public transaction was submitted.`);process.exitCode=1;}
finally{if(node&&node.exitCode===null){node.kill('SIGTERM');const force=setTimeout(()=>node.kill('SIGKILL'),3000);await once(node,'exit').catch(()=>{});clearTimeout(force);}}
