import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {keccak256,decodeFunctionData,encodeFunctionResult,encodeFunctionData,parseAbi} from 'viem';
import {WORK_ESCROW_READ_ABI} from '../../lib/work-escrow-observation.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),abi=[...WORK_ESCROW_READ_ABI,...parseAbi(['function balanceOf(address) view returns(uint256)','function fund(address worker,address token,uint128 amount,bytes32 termsHash,uint64 acceptBy,uint64 deliverBy)','function fundWithId(bytes32 fundingId,address worker,address token,uint128 amount,bytes32 termsHash,uint64 acceptBy,uint64 deliverBy)','function fundingJobs(address,bytes32) view returns(uint256)'])];
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),arbitrator:a(4),jobId:'1',client:a(5),worker:a(6),asset:a(7),assetCodeHash:pin,maxPerJob:'1000',amount:'100',termsHash:h(1),transactionHash:h(9),acceptBy:'100',deliverBy:'200',fundingId:null});
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-work-cli-')),path=join(dir,'private-policy.json');writeFileSync(path,JSON.stringify(policy()));
 const timestamp=BigInt(Math.floor(Date.now()/1000)-60),terms={acceptBy:String(timestamp+100n),deliverBy:String(timestamp+200n)};
 const configured=(bound=false)=>({...policy(),...terms,fundingId:bound?h(12):null});writeFileSync(path,JSON.stringify(configured()));let calls=0,mode='ok',bound=false;
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;
  if(mode==='changed'){writeFileSync(path,JSON.stringify(configured(bound))+'\n');mode='ok';}
  if(mode==='provider-error')throw Error('PRIVATE_PROVIDER');let result;
  if(q.method==='eth_chainId')result='0x61';
  else if(q.method==='eth_blockNumber')result='0x64';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x50');result={number:'0x50',hash:h(80),timestamp:'0x'+timestamp.toString(16),transactions:[h(9)]};}
  else if(q.method==='eth_getTransactionReceipt')result={transactionHash:h(9),status:'0x1',blockHash:h(80),blockNumber:'0x50',transactionIndex:'0x0',from:a(5),to:a(1),gasUsed:'0x100',cumulativeGasUsed:'0x100',effectiveGasPrice:'0x1',logs:[
   {address:a(7),topics:[keccak256(new TextEncoder().encode('Transfer(address,address,uint256)')),h(5),h(1)],data:h(mode==='unbacked'?99:100),logIndex:'0x3'},
   {address:a(1),topics:[keccak256(new TextEncoder().encode('JobFunded(uint256,address,address,address,uint256,bytes32,uint64,uint64)')),h(1),h(5),h(6)],data:h(7)+h(100).slice(2)+h(1).slice(2)+h(BigInt(terms.acceptBy)).slice(2)+h(BigInt(terms.deliverBy)).slice(2),logIndex:'0x4'},
   ...(bound?[{address:a(1),topics:[keccak256(new TextEncoder().encode('FundingBound(uint256,address,bytes32)')),h(1),h(5),h(12)],data:'0x',logIndex:'0x5'}]:[])].map(l=>({...l,blockHash:h(80),blockNumber:'0x50',transactionHash:h(9),transactionIndex:'0x0',removed:false}))};
  else if(q.method==='eth_getTransactionByHash')result={hash:h(9),blockHash:h(80),blockNumber:'0x50',transactionIndex:'0x0',chainId:'0x61',from:a(5),to:a(1),value:'0x0',input:encodeFunctionData({abi,functionName:bound?'fundWithId':'fund',args:[...(bound?[h(12)]:[]),a(6),a(7),100n,h(1),BigInt(terms.acceptBy),BigInt(terms.deliverBy)]}),type:'0x0',gas:'0x100',gasPrice:'0x1',nonce:'0x0',v:'0x1b',r:h(1),s:h(1)};
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x50');result=code;}
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});const fixed={governor:a(2),guardian:a(3),arbitrator:a(4),paused:mode==='paused',nextJob:2n,jobs:[a(5),a(6),a(7),100n,BigInt(terms.acceptBy),BigInt(terms.deliverBy),mode==='foreign'?h(9):h(1),4],latestResultRevision:2n,disputedResultRevision:0n,resultHashes:h(Number(args?.[1]??0n)+10),fundingJobs:mode==='wrong-id'?2n:1n,assetCodeHash:pin,maxPerJob:1000n,reserved:mode==='settled'?0n:100n};
   const value=functionName==='balanceOf'?(mode==='unbacked'?99n:100n):fixed[functionName];result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const env={...process.env,FORTUNE_WORK_FUNDING_READ_ENABLED:'true',FORTUNE_WORK_READ_RPC_URL:'https://work-one.invalid/private-key',FORTUNE_WORK_SECONDARY_RPC_URL:'https://work-two.invalid/private-key',FORTUNE_TEST_WORK_RPC:`http://127.0.0.1:${server.address().port}`};
 async function run(overrides={},args=[path]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/work-job-http.mjs','scripts/inspect-work-funding.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);try{const [status]=await once(child,'exit');return {status,out,err};}finally{clearTimeout(timer);}
 }
 try{await fn({dir,path,timestamp,configured,run,calls:()=>calls,mode:v=>mode=v,bound:v=>{bound=v;writeFileSync(path,JSON.stringify(configured(v)));}});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Work funding receipt unavailable/);assert.doesNotMatch(r.err,/PRIVATE_PROVIDER|private-key|private-policy|work-one|work-two/);};

test('actual funding CLI consumes unchanged receipt engine through HTTP ABI with stable evidence',async()=>fixture(async f=>{
 const before=readFileSync(f.path),r=await f.run();assert.equal(r.status,0,r.err);const v=JSON.parse(r.out),x=v.observation;
 assert.equal(v.policySha256,createHash('sha256').update(before).digest('hex'));assert.equal(v.currentAuthorization,null);assert.equal(v.executionAuthorized,false);assert.equal(v.fullSyndicateReadiness,false);
 assert.equal(x.principal,'100');assert.equal(x.fundingId,null);assert.equal(x.directFundingObserved,true);assert.equal(x.transactionHash,h(9));assert.equal(x.blockTimestamp,f.timestamp.toString());
 for(const key of ['capitalOriginVerified','executionAuthorized','fullSyndicateReadiness','partyIdentityVerified','workDeliveryVerified','independentProvidersVerified','globalSolvencyVerified'])assert.equal(x[key],false);
 const second=await f.run();assert.equal(second.status,0,second.err);assert.equal(JSON.parse(second.out).observation.evidenceId,x.evidenceId);assert.ok(f.calls()>30);assert.deepEqual(readFileSync(f.path),before);assert.doesNotMatch(r.out,/private-key|private-policy|work-one/);
 f.bound(true);const id=await f.run();assert.equal(id.status,0,id.err);const y=JSON.parse(id.out).observation;assert.equal(y.fundingId,h(12));assert.equal(y.principal,'100');assert.equal(y.evidenceId,x.evidenceId);assert.equal(y.currentAuthorization,null);assert.equal(y.executionAuthorized,false);f.mode('wrong-id');rejected(await f.run());
}));

test('disabled, bounded strict-file and invalid policy preflight make zero RPC and create nothing',async()=>fixture(async f=>{
 rejected(await f.run({FORTUNE_WORK_FUNDING_READ_ENABLED:''},[join(f.dir,'absent')]));
 rejected(await f.run({},[]));rejected(await f.run({},[f.path,'extra']));rejected(await f.run({},[f.dir]));rejected(await f.run({},[join(f.dir,'absent')]));
 for(const bytes of [Buffer.from([255]),' '.repeat(16385),JSON.stringify({...policy(),chainId:56}),JSON.stringify({...policy(),extra:'PRIVATE_PROVIDER'}),JSON.stringify({...policy(),jobId:'01'})]){writeFileSync(f.path,bytes);rejected(await f.run());}
 assert.equal(f.calls(),0);
}));

test('unsafe or same-origin provider selection fails before RPC without disclosing credentials',async()=>fixture(async f=>{
 for(const [one,two] of [['http://work-one.invalid','https://work-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-key@work-one.invalid','https://work-two.invalid'],['https://work-one.invalid/#fragment','https://work-two.invalid']])rejected(await f.run({FORTUNE_WORK_READ_RPC_URL:one,FORTUNE_WORK_SECONDARY_RPC_URL:two}));
 assert.equal(f.calls(),0);
}));

test('foreign terms/incorrect transfers, provider failure and policy mutation after reads discard the result privately',async()=>fixture(async f=>{
 for(const mode of ['foreign','unbacked','provider-error','changed']){writeFileSync(f.path,JSON.stringify(f.configured()));f.mode(mode);rejected(await f.run());}
 assert.ok(f.calls()>0);
}));


test('exact 16KiB policy succeeds and writerless FIFO rejects before RPC',async()=>fixture(async f=>{
 const json=JSON.stringify(f.configured());writeFileSync(f.path,json+' '.repeat(16384-Buffer.byteLength(json)));const r=await f.run();assert.equal(r.status,0,r.err);assert.equal(JSON.parse(r.out).observation.executionAuthorized,false);
 const before=f.calls();writeFileSync(f.path,json+' '.repeat(16385-Buffer.byteLength(json)));rejected(await f.run());assert.equal(f.calls(),before);
 if(process.platform==='linux'){const pipe=join(f.dir,'writerless');assert.equal(spawnSync('mkfifo',[pipe]).status,0);rejected(await f.run({},[pipe]));assert.equal(f.calls(),before);}
}));
