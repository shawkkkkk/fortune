import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
import {once} from 'node:events';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {keccak256,decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {COUNTER_ALLOCATION_ABI} from '../../lib/counter-allocation.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),abi=[...COUNTER_ALLOCATION_ABI,...parseAbi(['function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)'])];
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,payoutAsset:a(5),payoutAssetCodeHash:pin,accounts:[a(11),a(12)],minimumHolding:'1',payoutBudget:'34'});
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
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});const fixed={governor:a(2),guardian:a(3),launchToken:a(4),paused:true,nextRound:1n,assetCodeHash:pin,totalSupply:mode==='incomplete'?41n:40n,excluded:false};
   const value=functionName==='balanceOf'?(args[0].toLowerCase()===a(11)?10n:30n):fixed[functionName];result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const env={...process.env,FORTUNE_COUNTER_FUNDING_READ_ENABLED:'true',FORTUNE_COUNTER_READ_RPC_URL:'https://counter-one.invalid/private-key',FORTUNE_COUNTER_SECONDARY_RPC_URL:'https://counter-two.invalid/private-key',FORTUNE_TEST_COUNTER_RPC:`http://127.0.0.1:${server.address().port}`};
 async function run(overrides={},args=[path]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/counter-funding-http.mjs','scripts/prepare-counter-funding.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);try{const [status]=await once(child,'exit');return {status,out,err};}finally{clearTimeout(timer);}
 }
 try{await fn({dir,path,timestamp,run,calls:()=>calls,mode:v=>mode=v});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Counter funding review unavailable/);assert.doesNotMatch(r.err,/PRIVATE_PROVIDER|private-key|private-policy|counter-one|counter-two/);};

test('actual child CLI uses real two-client engine and HTTP ABI reads for fixed-expiry unsigned funding',async()=>fixture(async f=>{
 const before=readFileSync(f.path),r=await f.run();assert.equal(r.status,0,r.err);const v=JSON.parse(r.out),x=v.allocation;
 assert.equal(v.policySha256,createHash('sha256').update(before).digest('hex'));assert.equal(v.currentAuthorization,null);assert.equal(v.executionAuthorized,false);assert.equal(v.fullCounterReadiness,false);
 assert.deepEqual(x.allocations,[{recipient:a(11),amount:'8'},{recipient:a(12),amount:'25'}]);assert.equal(x.fundedAmount,'33');assert.equal(x.unallocatedDust,'1');
 const call=decodeFunctionData({abi:COUNTER_ALLOCATION_ABI,data:x.data});assert.equal(call.functionName,'fundSnapshotRound');assert.deepEqual(call.args[3],{expectedRound:1n,blockNumber:80n,blockHash:h(80),deadline:f.timestamp+120n});
 for(const key of ['executionAuthorized','fullCounterReadiness','independentProvidersVerified','completeHolderIndexVerified','feeFundingVerified','holderEligibilityPolicyApproved'])assert.equal(x[key],false);
 assert.ok(f.calls()>30);assert.deepEqual(readFileSync(f.path),before);assert.doesNotMatch(r.out,/private-key|private-policy|counter-one/);
}));

test('disabled, bounded strict-file and invalid policy preflight make zero RPC and create nothing',async()=>fixture(async f=>{
 rejected(await f.run({FORTUNE_COUNTER_FUNDING_READ_ENABLED:''},[join(f.dir,'absent')]));
 rejected(await f.run({},[]));rejected(await f.run({},[f.path,'extra']));rejected(await f.run({},[f.dir]));rejected(await f.run({},[join(f.dir,'absent')]));
 for(const bytes of [Buffer.from([255]),' '.repeat(16385),JSON.stringify({...policy(),chainId:56}),JSON.stringify({...policy(),extra:'PRIVATE_PROVIDER'}),JSON.stringify({...policy(),payoutBudget:'01'})]){writeFileSync(f.path,bytes);rejected(await f.run());}
 assert.equal(f.calls(),0);
}));

test('unsafe or same-origin provider selection fails before RPC without disclosing credentials',async()=>fixture(async f=>{
 for(const [one,two] of [['http://counter-one.invalid','https://counter-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-key@counter-one.invalid','https://counter-two.invalid'],['https://counter-one.invalid/#fragment','https://counter-two.invalid']])rejected(await f.run({FORTUNE_COUNTER_READ_RPC_URL:one,FORTUNE_COUNTER_SECONDARY_RPC_URL:two}));
 assert.equal(f.calls(),0);
}));

test('incomplete coverage, provider failure and policy mutation after reads discard the result privately',async()=>fixture(async f=>{
 for(const mode of ['incomplete','provider-error','changed']){writeFileSync(f.path,JSON.stringify(policy()));f.mode(mode);rejected(await f.run());}
 assert.ok(f.calls()>0);
}));
