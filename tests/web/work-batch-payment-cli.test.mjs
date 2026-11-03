import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {keccak256,decodeFunctionData,encodeFunctionResult,parseAbi,encodeFunctionData} from 'viem';
import {WORK_ESCROW_READ_ABI} from '../../lib/work-escrow-observation.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),abi=[...WORK_ESCROW_READ_ABI,...parseAbi(['function balanceOf(address) view returns(uint256)'])];
const singlePolicy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),arbitrator:a(4),jobId:'1',client:a(5),worker:a(6),asset:a(7),assetCodeHash:pin,maxPerJob:'10000',amount:'100',termsHash:h(1),transactionHash:h(9)});
const approvals=(count=2)=>Array.from({length:count},(_,i)=>i+1).map(id=>({id:String(id),revision:'2',resultHash:h(id+10)}));
const policy=(count=2)=>Array.from({length:count},(_,i)=>i+1).map(id=>({...singlePolicy(),jobId:String(id),worker:a(id+5),asset:a(id%2+7),amount:String(id*100),termsHash:h(id),approvals:approvals(count)}));
const batchAbi=parseAbi(['function approveResultsMany((uint256 id,uint256 revision,bytes32 resultHash)[] approvals)']);
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-work-cli-')),path=join(dir,'private-policy.json');writeFileSync(path,JSON.stringify(policy()));
 const timestamp=BigInt(Math.floor(Date.now()/1000)-60);let calls=0,mode='ok',count=2;
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;
  if(mode==='changed'){writeFileSync(path,JSON.stringify(policy())+'\n');mode='ok';}
  if(mode==='provider-error')throw Error('PRIVATE_PROVIDER');let result;
  if(q.method==='eth_chainId')result='0x61';
  else if(q.method==='eth_blockNumber')result='0x64';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x50');result={number:'0x50',hash:h(80),timestamp:'0x'+timestamp.toString(16),transactions:[h(9)]};}
  else if(q.method==='eth_getTransactionReceipt')result={transactionHash:h(9),status:'0x1',blockHash:h(80),blockNumber:'0x50',transactionIndex:'0x0',from:a(5),to:a(1),gasUsed:'0x100',cumulativeGasUsed:'0x100',effectiveGasPrice:'0x1',logs:Array.from({length:count},(_,i)=>i+1).flatMap(id=>[
   {address:a(id%2+7),topics:[keccak256(new TextEncoder().encode('Transfer(address,address,uint256)')),h(1),h(id+5)],data:h(mode==='unbacked'&&id===2?199:id*100),logIndex:'0x'+(3*id).toString(16)},
   {address:a(1),topics:[keccak256(new TextEncoder().encode('JobSettled(uint256,uint256,uint256,address)')),h(id),h(5)],data:h(id*100)+h(0).slice(2),logIndex:'0x'+(3*id+1).toString(16)},
   {address:a(1),topics:[keccak256(new TextEncoder().encode('ResultApproved(uint256,uint256,bytes32)')),h(id),h(2)],data:h(id+10),logIndex:'0x'+(3*id+2).toString(16)}]).map(l=>({...l,blockHash:h(80),blockNumber:'0x50',transactionHash:h(9),transactionIndex:'0x0',removed:false}))};
  else if(q.method==='eth_getTransactionByHash')result={hash:h(9),blockHash:h(80),blockNumber:'0x50',transactionIndex:'0x0',chainId:'0x61',from:a(5),to:a(1),value:'0x0',input:encodeFunctionData({abi:batchAbi,functionName:'approveResultsMany',args:[approvals(count).map(p=>({...p,id:BigInt(p.id),revision:BigInt(p.revision)}))]}),type:'0x0',gas:'0x100',gasPrice:'0x1',nonce:'0x0',v:'0x1b',r:h(1),s:h(1)};
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x50');result=code;}
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});const id=Number(args?.[0]??1n);const fixed={governor:a(2),guardian:a(3),arbitrator:a(4),paused:mode==='paused',nextJob:2n,jobs:[a(5),a(id+5),a(id%2+7),BigInt(id*100),10n,20n,mode==='foreign'&&id===2?h(9):h(id),4],latestResultRevision:2n,disputedResultRevision:0n,resultHashes:h(id+10),assetCodeHash:pin,maxPerJob:10000n,reserved:mode==='settled'?0n:100n};
   const value=functionName==='balanceOf'?(mode==='unbacked'?99n:100n):fixed[functionName];result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const env={...process.env,FORTUNE_WORK_BATCH_PAYMENT_READ_ENABLED:'true',FORTUNE_WORK_READ_RPC_URL:'https://work-one.invalid/private-key',FORTUNE_WORK_SECONDARY_RPC_URL:'https://work-two.invalid/private-key',FORTUNE_TEST_WORK_RPC:`http://127.0.0.1:${server.address().port}`};
 async function run(overrides={},args=[path]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/work-job-http.mjs','scripts/inspect-work-batch-payments.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);try{const [status]=await once(child,'exit');return {status,out,err};}finally{clearTimeout(timer);}
 }
 try{await fn({dir,path,timestamp,run,calls:()=>calls,mode:v=>mode=v,count:v=>{count=v;writeFileSync(path,JSON.stringify(policy(count)));}});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Work batch payment receipts unavailable/);assert.doesNotMatch(r.err,/PRIVATE_PROVIDER|private-key|private-policy|work-one|work-two/);};

test('actual batch CLI verifies every entry and separate assets through HTTP ABI with stable replay evidence',async()=>fixture(async f=>{
 for(const count of [1,2,16]){f.count(count);const before=readFileSync(f.path),r=await f.run();assert.equal(r.status,0,r.err);const v=JSON.parse(r.out),x=v.observation;
 assert.equal(v.policySha256,createHash('sha256').update(before).digest('hex'));assert.equal(v.currentAuthorization,null);assert.equal(v.executionAuthorized,false);assert.equal(v.fullSyndicateReadiness,false);
 assert.equal(x.allCallEntriesObserved,true);assert.equal(x.payments.length,count);assert.equal(x.transactionHash,h(9));assert.equal(new Set(x.payments.map(p=>p.evidenceId)).size,count);
 assert.deepEqual(x.payments.map(p=>p.workerPaid),Array.from({length:count},(_,i)=>String((i+1)*100)));
 assert.deepEqual(x.payments.map(p=>p.asset),Array.from({length:count},(_,i)=>a((i+1)%2+7)));assert.equal(x.currentAuthorization,null);
 for(const key of ['executionAuthorized','fullSyndicateReadiness','partyIdentityVerified','workDeliveryVerified','independentProvidersVerified','globalSolvencyVerified'])assert.equal(x[key],false);
 const second=await f.run();assert.equal(second.status,0,second.err);assert.equal(JSON.parse(second.out).observation.receiptConsistencyDigest,x.receiptConsistencyDigest);
 assert.deepEqual(JSON.parse(second.out).observation.payments.map(p=>p.evidenceId),x.payments.map(p=>p.evidenceId));assert.deepEqual(readFileSync(f.path),before);assert.doesNotMatch(r.out,/private-key|private-policy|work-one/);
 }
}));

test('batch command preflight rejects incomplete/duplicate/late malformed policies before RPC',async()=>fixture(async f=>{
 rejected(await f.run({FORTUNE_WORK_BATCH_PAYMENT_READ_ENABLED:''},[join(f.dir,'absent')]));
 rejected(await f.run({},[]));rejected(await f.run({},[f.path,'extra']));rejected(await f.run({},[f.dir]));rejected(await f.run({},[join(f.dir,'absent')]));
 const p=policy();for(const bytes of [Buffer.from([255]),' '.repeat(65537),JSON.stringify({policies:p}),JSON.stringify([]),JSON.stringify(p.slice(0,1)),JSON.stringify([p[0],p[0]]),JSON.stringify([...p].reverse()),JSON.stringify([p[0],{...p[1],chainId:56}]),JSON.stringify([p[0],{...p[1],extra:'PRIVATE_PROVIDER'}]),JSON.stringify([p[0],{...p[1],jobId:'02'}])]){writeFileSync(f.path,bytes);rejected(await f.run());}
 assert.equal(f.calls(),0);
}));

test('batch command rejects unsafe or same-origin providers without leaking credentials',async()=>fixture(async f=>{
 for(const [one,two] of [['http://work-one.invalid','https://work-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-key@work-one.invalid','https://work-two.invalid'],['https://work-one.invalid/#fragment','https://work-two.invalid']])rejected(await f.run({FORTUNE_WORK_READ_RPC_URL:one,FORTUNE_WORK_SECONDARY_RPC_URL:two}));assert.equal(f.calls(),0);
}));

test('later-job terms or transfer mismatch, provider failure and changed policy discard complete batch privately',async()=>fixture(async f=>{
 for(const mode of ['foreign','unbacked','provider-error','changed']){writeFileSync(f.path,JSON.stringify(policy()));f.mode(mode);rejected(await f.run());}assert.ok(f.calls()>0);
}));

test('batch policy accepts exact64KiB and rejects oversize, invalid UTF8 and writerless FIFO before RPC',async()=>fixture(async f=>{
 const json=JSON.stringify(policy());writeFileSync(f.path,json+' '.repeat(65536-Buffer.byteLength(json)));const r=await f.run();assert.equal(r.status,0,r.err);assert.equal(JSON.parse(r.out).observation.executionAuthorized,false);
 const before=f.calls();writeFileSync(f.path,json+' '.repeat(65537-Buffer.byteLength(json)));rejected(await f.run());assert.equal(f.calls(),before);
 if(process.platform==='linux'){const pipe=join(f.dir,'writerless');assert.equal(spawnSync('mkfifo',[pipe]).status,0);rejected(await f.run({},[pipe]));assert.equal(f.calls(),before);}
}));
