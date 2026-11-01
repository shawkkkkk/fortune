import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {keccak256,decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {COUNTER_CLAIM_ABI} from '../../lib/counter-claims.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),abi=[...COUNTER_CLAIM_ABI,...parseAbi(['function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)'])];
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,recipient:a(12),rounds:['1'],assets:[{token:a(5),codeHash:pin}]});
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-counter-cli-')),path=join(dir,'private-policy.json');writeFileSync(path,JSON.stringify(policy()));
 const timestamp=BigInt(Math.floor(Date.now()/1000)-60);let calls=0,mode='ok';
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;
  if(mode==='changed'){writeFileSync(path,JSON.stringify(policy())+'\n');mode='ok';}
  if(mode==='provider-error')throw Error('PRIVATE_PROVIDER');let result;
  if(q.method==='eth_chainId')result='0x61';
  else if(q.method==='eth_blockNumber')result='0x64';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x50');result={number:'0x50',hash:h(80),timestamp:'0x'+timestamp.toString(16),transactions:[]};}
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x50');result=code;}
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});const fixed={governor:a(2),guardian:a(3),launchToken:a(4),paused:mode==='paused',assetCodeHash:pin,reserved:33n,rounds:[a(5),33n,33n,h(7)],claimable:mode==='spent'?0n:25n};
   const value=functionName==='balanceOf'?(mode==='unbacked'?32n:40n):fixed[functionName];result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const env={...process.env,FORTUNE_COUNTER_CLAIM_READ_ENABLED:'true',FORTUNE_COUNTER_READ_RPC_URL:'https://counter-one.invalid/private-key',FORTUNE_COUNTER_SECONDARY_RPC_URL:'https://counter-two.invalid/private-key',FORTUNE_TEST_COUNTER_RPC:`http://127.0.0.1:${server.address().port}`};
 async function run(overrides={},args=[path]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/counter-funding-http.mjs','scripts/prepare-counter-claims.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);try{const [status]=await once(child,'exit');return {status,out,err};}finally{clearTimeout(timer);}
 }
 try{await fn({dir,path,timestamp,run,calls:()=>calls,mode:v=>mode=v});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Counter claim review unavailable/);assert.doesNotMatch(r.err,/PRIVATE_PROVIDER|private-key|private-policy|counter-one|counter-two/);};

test('actual child CLI uses unchanged two-client claim engine and HTTP ABI reads for unsigned fixed-recipient batch',async()=>fixture(async f=>{
 const before=readFileSync(f.path),r=await f.run();assert.equal(r.status,0,r.err);const v=JSON.parse(r.out),x=v.review;
 assert.equal(v.policySha256,createHash('sha256').update(before).digest('hex'));assert.equal(v.currentAuthorization,null);assert.equal(v.executionAuthorized,false);assert.equal(v.fullCounterReadiness,false);
 assert.deepEqual(x.claims,[{round:'1',asset:a(5),amount:'25',funded:'33',remaining:'33',allocationHash:h(7)}]);
 assert.deepEqual(x.backing,[{asset:a(5),selectedAmount:'25',selectedRemaining:'33',reserved:'33',balance:'40'}]);
 const call=decodeFunctionData({abi:COUNTER_CLAIM_ABI,data:x.data});assert.equal(call.functionName,'claimMany');assert.deepEqual(call.args[0],[1n]);assert.equal(call.args[1].toLowerCase(),a(12));assert.equal(x.blockTimestamp,f.timestamp.toString());
 for(const key of ['executionAuthorized','fullCounterReadiness','independentProvidersVerified','snapshotBoundCalldata','globalSolvencyVerified','holderEligibilityVerified','feeFundingVerified'])assert.equal(x[key],false);
 assert.ok(f.calls()>30);assert.deepEqual(readFileSync(f.path),before);assert.doesNotMatch(r.out,/private-key|private-policy|counter-one/);
}));

test('disabled, bounded strict-file and invalid policy preflight make zero RPC and create nothing',async()=>fixture(async f=>{
 rejected(await f.run({FORTUNE_COUNTER_CLAIM_READ_ENABLED:''},[join(f.dir,'absent')]));
 rejected(await f.run({},[]));rejected(await f.run({},[f.path,'extra']));rejected(await f.run({},[f.dir]));rejected(await f.run({},[join(f.dir,'absent')]));
 for(const bytes of [Buffer.from([255]),' '.repeat(16385),JSON.stringify({...policy(),chainId:56}),JSON.stringify({...policy(),extra:'PRIVATE_PROVIDER'}),JSON.stringify({...policy(),rounds:['01']})]){writeFileSync(f.path,bytes);rejected(await f.run());}
 assert.equal(f.calls(),0);
}));

test('unsafe or same-origin provider selection fails before RPC without disclosing credentials',async()=>fixture(async f=>{
 for(const [one,two] of [['http://counter-one.invalid','https://counter-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-key@counter-one.invalid','https://counter-two.invalid'],['https://counter-one.invalid/#fragment','https://counter-two.invalid']])rejected(await f.run({FORTUNE_COUNTER_READ_RPC_URL:one,FORTUNE_COUNTER_SECONDARY_RPC_URL:two}));
 assert.equal(f.calls(),0);
}));

test('spent/unbacked/paused claims, provider failure and policy mutation after reads discard the result privately',async()=>fixture(async f=>{
 for(const mode of ['spent','unbacked','paused','provider-error','changed']){writeFileSync(f.path,JSON.stringify(policy()));f.mode(mode);rejected(await f.run());}
 assert.ok(f.calls()>0);
}));


test('exact 16KiB policy succeeds and writerless FIFO rejects before RPC',async()=>fixture(async f=>{
 const json=JSON.stringify(policy());writeFileSync(f.path,json+' '.repeat(16384-Buffer.byteLength(json)));const r=await f.run();assert.equal(r.status,0,r.err);assert.equal(JSON.parse(r.out).review.executionAuthorized,false);
 const before=f.calls();writeFileSync(f.path,json+' '.repeat(16385-Buffer.byteLength(json)));rejected(await f.run());assert.equal(f.calls(),before);
 if(process.platform==='linux'){const pipe=join(f.dir,'writerless');assert.equal(spawnSync('mkfifo',[pipe]).status,0);rejected(await f.run({},[pipe]));assert.equal(f.calls(),before);}
}));
