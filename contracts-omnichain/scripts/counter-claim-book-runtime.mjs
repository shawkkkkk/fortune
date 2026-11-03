// Isolated compiled-contract LOCAL rollback drill; no keys, generated accounts or public writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,keccak256,toHex} from 'viem';
import {bscTestnet} from 'viem/chains';
import {CounterClaimObservationBook} from '../../scripts/counter-claim-observation-book.mjs';
import {inspectCounterBatchClaimReceipt} from '../../lib/counter-batch-claim-receipt.ts';
const GOV='0x0000000000000000000000000000000000009001',GUARD='0x0000000000000000000000000000000000009002',ARB='0x0000000000000000000000000000000000009003';
const CLIENT='0x0000000000000000000000000000000000001001',WORKER='0x0000000000000000000000000000000000001002',roles=[GOV,GUARD,ARB,CLIENT,WORKER];
const artifact=(file,name)=>JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`,import.meta.url),'utf8'));
const work=artifact('FortuneTestnetCounterEscrow.sol','FortuneTestnetCounterEscrow'),asset=artifact('FortuneTestnetCounterEscrow.t.sol','CounterAssetMock');
const output=resolve('.tmp/counter-claim-book-runtime.json');rmSync(output,{force:true});
let node,book,dir,stage='startup';
try{
 const binary=process.env.FORTUNE_ANVIL_BIN;assert.ok(binary);const version=spawnSync(binary,['--version'],{encoding:'utf8'});assert.equal(version.status,0);assert.match(version.stdout,/Version: 1\.7\.1/);
 const lease=createServer();lease.listen(0,'127.0.0.1');await once(lease,'listening');const port=lease.address().port;await new Promise(r=>lease.close(r));
 node=spawn(binary,['--timestamp',String(Math.floor(Date.now()/1000)-60),'--host','127.0.0.1','--port',String(port),'--chain-id','97','--accounts','0','--quiet'],{stdio:'ignore'});let failed=false;node.on('error',()=>{failed=true;});
 const transport=()=>http(`http://127.0.0.1:${port}`,{timeout:5000,retryCount:0}),rpc=createPublicClient({transport:transport(),chain:bscTestnet});let ready=false;
 for(let i=0;i<100;i++){try{if(await rpc.getChainId()===97){ready=true;break;}}catch{}if(failed||node.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}assert.ok(ready);assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 for(const who of roles){await rpc.request({method:'anvil_impersonateAccount',params:[who]});await rpc.request({method:'anvil_setBalance',params:[who,toHex(100n*10n**18n)]});}
 const wallet=who=>createWalletClient({account:who,transport:transport(),chain:bscTestnet});
 const receipt=async hash=>{const r=await rpc.waitForTransactionReceipt({hash,pollingInterval:20,timeout:15000});assert.equal(r.status,'success');return r;};
 const deploy=async(a,args=[])=>{const r=await receipt(await wallet(GOV).deployContract({abi:a.abi,bytecode:a.bytecode.object,args,gas:10000000n}));assert.ok(r.contractAddress);return r.contractAddress;};
 const write=(who,address,a,functionName,args=[],gas=5000000n)=>wallet(who).writeContract({address,abi:a.abi,functionName,args,gas}).then(receipt);
 const read=(address,a,functionName,args=[])=>rpc.readContract({address,abi:a.abi,functionName,args});
 stage='prepare separate two-asset compiled Counter fixture';
 const tokens=[await deploy(asset),await deploy(asset)],launchToken=await deploy(asset),pins=await Promise.all([...tokens].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).map(async token=>({token,codeHash:keccak256(await rpc.getCode({address:token}))})));
 const escrow=await deploy(work,[GOV,GUARD,launchToken,pins,[]]),rounds=[],claims=[];
 const common={chainId:97,escrow:escrow.toLowerCase(),escrowCodeHash:keccak256(await rpc.getCode({address:escrow})),governor:GOV,guardian:GUARD,launchToken:launchToken.toLowerCase(),launchTokenCodeHash:keccak256(await rpc.getCode({address:launchToken})),recipient:CLIENT};
 for(const [i,token]of tokens.entries()){
  const amount=i===0?100n:80n;await write(GOV,token,asset,'mint',[GOV,amount]);await write(GOV,token,asset,'approve',[escrow,amount]);const id=await read(escrow,work,'nextRound');await write(GOV,escrow,work,'fundRound',[token,[CLIENT],[amount]]);
  rounds.push(id);claims.push({round:id.toString(),asset:token.toLowerCase(),assetCodeHash:keccak256(await rpc.getCode({address:token})),amount:amount.toString()});
 }
 await write(GOV,escrow,work,'setPaused',[false]);
 const state=async()=>({head:await rpc.getBlockNumber({cacheTime:0}),nonces:await Promise.all(roles.flatMap(address=>['latest','pending'].map(blockTag=>rpc.getTransactionCount({address,blockTag})))),balances:await Promise.all(tokens.flatMap(token=>[escrow,CLIENT,WORKER].map(who=>read(token,asset,'balanceOf',[who])))),reserved:await Promise.all(tokens.map(token=>read(escrow,work,'reserved',[token])))});
 let calls=0;const methods=new Set(['getChainId','getBlockNumber','getBlock','getTransaction','getTransactionReceipt','getCode','readContract']);
 const clients=[rpc,createPublicClient({transport:transport(),chain:bscTestnet})].map(client=>new Proxy(client,{get(target,key){const value=Reflect.get(target,key,target);return methods.has(key)&&typeof value==='function'?(...args)=>{calls++;return Reflect.apply(value,target,args);}:value;}}));
 const confirm=async paid=>{
  await rpc.request({method:'anvil_mine',params:['0x14','0x0']});const at=Number((await rpc.getBlock({blockNumber:paid.blockNumber})).timestamp)*1000;let last=Date.now();const deadline=last+60000;assert.ok(Number.isSafeInteger(at)&&at-last<=60000);
  while(last<at){await new Promise(r=>setTimeout(r,Math.min(1000,at-last)));const next=Date.now();assert.ok(Number.isSafeInteger(next)&&next>=last&&next<=deadline);last=next;}
 };
 const policyFor=paid=>({...common,caller:WORKER,transactionHash:paid.transactionHash,claims});
 stage='record original canonical fixture payment';
 const forkPoint=await rpc.request({method:'evm_snapshot'}),paid=await write(WORKER,escrow,work,'claimMany',[rounds,CLIENT]);await confirm(paid);const original=policyFor(paid),originalState=await state();
 dir=mkdtempSync(join(tmpdir(),'fortune-counter-claim-'));const path=join(dir,'observations.sqlite');CounterClaimObservationBook.initialize(path,common,{enabled:true});book=new CounterClaimObservationBook(path,common,{enabled:true,readOnly:false});
 const initial=book.read().head,recorded=await book.capture(clients,original,initial),saved=book.read();assert.equal(recorded.inserted,true);assert.equal(saved.total,1);assert.equal(saved.quarantined,false);assert.deepEqual(saved.entries[0].observation.claims.map(p=>p.amount),['100','80']);assert.deepEqual(await state(),originalState);
 stage='remove original receipt by actual local rollback';
 assert.equal(await rpc.request({method:'evm_revert',params:[forkPoint]}),true);const reverted=await state();assert.deepEqual(reverted.reserved,[100n,80n]);
 await assert.rejects(inspectCounterBatchClaimReceipt(clients,original));await assert.rejects(book.capture(clients,original,initial));assert.deepEqual(book.read(),saved);assert.deepEqual(await state(),reverted);
 stage='observe valid alternate canonical payment for the same rounds';
 // Different gas changes transaction identity; no fee/nonce replacement or public transaction.
 const alternate=await write(WORKER,escrow,work,'claimMany',[rounds,CLIENT],4999999n);assert.notEqual(alternate.transactionHash,paid.transactionHash);await confirm(alternate);const replacement=policyFor(alternate),alternateState=await state();
 const valid=await inspectCounterBatchClaimReceipt(clients,replacement);assert.equal(valid.allCallEntriesObserved,true);assert.deepEqual(valid.claims.map(p=>p.amount),['100','80']);assert.notEqual(valid.receiptConsistencyDigest,saved.entries[0].observation.receiptConsistencyDigest);assert.deepEqual(alternateState.balances,originalState.balances);assert.deepEqual(alternateState.reserved,[0n,0n]);
 stage='persist positive receipt conflict quarantine';
 await assert.rejects(book.capture(clients,replacement,saved.head),/round conflict quarantined/);const quarantined=book.read();assert.equal(quarantined.quarantined,true);assert.equal(quarantined.total,1);assert.equal(quarantined.head,saved.head);assert.deepEqual(quarantined.entries,saved.entries);assert.equal(quarantined.currentAuthorization,null);assert.equal(quarantined.executionAuthorized,false);assert.equal(quarantined.fullCounterReadiness,false);assert.deepEqual(await state(),alternateState);
 book.close();book=new CounterClaimObservationBook(path,common,{enabled:true,readOnly:false});assert.deepEqual(book.read(),quarantined);const before=calls;await assert.rejects(book.capture(clients,replacement,saved.head),/book quarantined/);assert.equal(calls,before);assert.deepEqual(book.read(),quarantined);assert.deepEqual(await state(),alternateState);
 for(const who of roles)await rpc.request({method:'anvil_stopImpersonatingAccount',params:[who]});assert.deepEqual(await rpc.request({method:'eth_accounts'}),[]);
 const result={chainId:97,localZeroAccountFixture:true,compiledTwoAssetPaymentObserved:true,actualLocalRollbackRemovedReceipt:true,missingReceiptPreservedHistory:true,validAlternatePaymentObserved:true,positiveConflictQuarantinePersisted:true,reopenBlockedBeforeRpc:true,readersPreservedChainState:true,historyAndOriginalTimesPreserved:true,currentAuthorization:null,executionAuthorized:false,independentProvidersVerified:false,publicReorgVerified:false,fullCounterReadiness:false};mkdirSync(resolve('.tmp'),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch{console.error(`Local Counter claim rollback drill failed during ${stage}`);process.exitCode=1;}finally{book?.close();if(dir)rmSync(dir,{recursive:true,force:true});if(node&&node.exitCode===null){node.kill('SIGTERM');await Promise.race([once(node,'exit'),new Promise(r=>setTimeout(r,2000))]);}}
