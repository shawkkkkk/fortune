import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync,existsSync,linkSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { decodeFunctionData,encodeFunctionResult,toHex } from 'viem';
import { FILL_READ_ABI,fillMarketHash } from '../../lib/arbitrage-receipts.ts';
import { StrategyNativeGasBudget as Book } from '../../scripts/strategy-native-gas-budget.mjs';
import { ArbitrageFillJournal as Journal } from '../../scripts/arbitrage-fill-journal.mjs';
import { ReceiptObservationQueue as Queue } from '../../scripts/arbitrage-observer-queue.mjs';
import { market,receiptClient,TX,h,a } from '../fixtures/arbitrage-receipts.mjs';
const policy=()=>({chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(market())],perTransactionWei:'100000',rollingDayWei:'150000'});
const rpcEnv={FORTUNE_ARBITRAGE_READ_RPC_URL:'https://reviewed-one.invalid',FORTUNE_ARBITRAGE_SECONDARY_RPC_URL:'https://reviewed-two.invalid'};
const raw=v=>typeof v==='bigint'?toHex(v):Array.isArray(v)?v.map(raw):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,raw(x)])):v;
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'fortune-budget-cli-')),mp=join(dir,'market.json'),pp=join(dir,'policy.json'),jp=join(dir,'journal.sqlite'),bp=join(dir,'budget.sqlite'),qp=join(dir,'queue.sqlite');
 writeFileSync(mp,JSON.stringify(market()));writeFileSync(pp,JSON.stringify(policy()));
 const b=new Book(bp,policy());b.reserve(TX,'100000');b.close();new Journal(jp,market()).close();const q=new Queue(qp,market());q.enqueue(TX);q.close();
 let requests=0,fail=false,queuedRead=true;const client=receiptClient();
 const server=createServer(async(req,res)=>{try{
  let data='';for await(const chunk of req)data+=chunk;const rpc=JSON.parse(data);requests++;
  // Observe durable file ordering at the actual HTTP boundary, not a replaced client.
  const budget=new Book(bp,policy(),Date.now,{readOnly:true});assert.equal(budget.status().pendingRechecks,1);budget.close();
  if(queuedRead){const queue=new Queue(qp,market(),Date.now,{readOnly:true});assert.equal(queue.stats().done,0);queue.close();}
  if(fail)throw Error('private-provider-sentinel');
  let result;
  if(rpc.method==='eth_chainId')result='0x61';
  else if(rpc.method==='eth_blockNumber')result='0x82';
  else if(rpc.method==='eth_getTransactionReceipt'){
   result=raw(await client.getTransactionReceipt());result.status='0x1';result.type='0x2';result.transactionIndex='0x0';result.cumulativeGasUsed=result.gasUsed;
   result.logs=result.logs.map(l=>({...l,logIndex:toHex(l.logIndex),transactionIndex:'0x0'}));
  }else if(rpc.method==='eth_getTransactionByHash'){result=raw(await client.getTransaction());result.type='0x2';result.transactionIndex='0x0';result.nonce='0x0';result.gas='0x10000';}
  else if(rpc.method==='eth_getBlockByNumber')result={...raw(await client.getBlock({blockNumber:BigInt(rpc.params[0])})),transactions:[]};
  else if(rpc.method==='eth_getCode')result=await client.getCode({address:rpc.params[0],blockNumber:BigInt(rpc.params[1])});
  else if(rpc.method==='eth_call'){
   const decoded=decodeFunctionData({abi:FILL_READ_ABI,data:rpc.params[0].data});
   result=encodeFunctionResult({abi:FILL_READ_ABI,functionName:decoded.functionName,result:await client.readContract({address:rpc.params[0].to,functionName:decoded.functionName,blockNumber:BigInt(rpc.params[1])})});
  }else throw Error('unexpected method');
  res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
 }catch(e){res.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:e.message}}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const run=(args=['--next',qp],env={})=>new Promise((resolve,reject)=>{
  queuedRead=args[0]==='--next';
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/character-provenance-http.mjs','scripts/run-budget-reconciliation.mjs',mp,pp,jp,bp,...args],{env:{...process.env,...rpcEnv,FORTUNE_TEST_CHARACTER_RPC:`http://127.0.0.1:${server.address().port}`,...env},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',status=>resolve({status,stdout,stderr}));
 });
 const snapshot=()=>{const db=new DatabaseSync(qp,{readOnly:true});try{return {config:db.prepare('SELECT * FROM observation_config').all(),jobs:db.prepare('SELECT * FROM observation_jobs ORDER BY tx').all()};}finally{db.close();}};
 return {dir,mp,pp,jp,bp,qp,run,snapshot,requests:()=>requests,fail:()=>{fail=true;},clean:async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}};
}
test('queue CLI consumes one existing job through real viem HTTP/ABI, then reopens idle without duplicate charge',async()=>{
 const f=await fixture();try{
  const q=new Queue(f.qp,market());q.enqueue(h(78));q.close();
  const r=await f.run();assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{state:'done',executionAuthorized:false,profitAllocated:false,bookBlocked:false});assert.ok(f.requests()>0);assert.doesNotMatch(r.stdout,/(0x|fence|sqlite)/);
  const jobs=f.snapshot().jobs;assert.equal(jobs[0].state,'done');assert.equal(jobs[1].state,'pending');assert.equal(jobs[1].attempts,0);
  const b=new Book(f.bp,policy(),Date.now,{readOnly:true});assert.equal(b.status().chargedRollingDayWei,'50000');assert.equal(b.status().pendingRechecks,0);b.close();
  const j=new Journal(f.jp,market(),{readOnly:true});assert.equal(j.list().length,1);j.close();
 }finally{await f.clean();}
});
test('queue CLI idle and legacy direct-hash replay preserve committed charge and perform no new queue work',async()=>{
 const f=await fixture();try{
  assert.equal((await f.run()).status,0);
  const db=new DatabaseSync(f.bp,{readOnly:true});const before=db.prepare('SELECT cost,charged_at,evidence FROM gas_entries WHERE tx=?').get(TX);db.close();
  const requests=f.requests();const idle=await f.run();assert.equal(idle.status,0,idle.stderr);assert.equal(JSON.parse(idle.stdout).state,'idle');assert.equal(f.requests(),requests);
  const direct=await f.run([TX]);assert.equal(direct.status,0,direct.stderr);assert.equal(JSON.parse(direct.stdout).state,'reconciled-observation');
  const after=new DatabaseSync(f.bp,{readOnly:true});assert.deepEqual(after.prepare('SELECT cost,charged_at,evidence FROM gas_entries WHERE tx=?').get(TX),before);after.close();
 }finally{await f.clean();}
 const g=await fixture();try{const direct=await g.run([TX]);assert.equal(direct.status,0,direct.stderr);assert.equal(JSON.parse(direct.stdout).state,'reconciled-observation');assert.equal(g.snapshot().jobs[0].state,'pending');}finally{await g.clean();}
});
test('queue CLI provider failure leaves a lease and permanent hold; blocked restart makes no provider calls',async()=>{
 const f=await fixture();try{
  f.fail();const r=await f.run();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).state,'quarantined');assert.doesNotMatch(r.stdout+r.stderr,/private-provider-sentinel|reviewed-one|sqlite/);
  const before=f.snapshot(),requests=f.requests();assert.equal(before.jobs[0].state,'leased');
  const restart=await f.run();assert.equal(restart.status,1);assert.deepEqual(JSON.parse(restart.stdout),{state:'blocked',executionAuthorized:false,profitAllocated:false,bookBlocked:true});assert.equal(f.requests(),requests);assert.deepEqual(f.snapshot(),before);
 }finally{await f.clean();}
});
test('queue CLI rejects absent, empty and foreign queues before writes or RPC; never initializes missing storage',async()=>{
 const f=await fixture();try{
  const before=f.snapshot();const missing=join(f.dir,'private-missing.sqlite'),empty=join(f.dir,'empty.sqlite'),foreign=join(f.dir,'foreign.sqlite');writeFileSync(empty,'');new Queue(foreign,{...market(),confirmations:21}).close();
  for(const path of [missing,empty,foreign]){const r=await f.run(['--next',path]);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/private-missing|empty.sqlite|foreign.sqlite/);}
  assert.equal(existsSync(missing),false);assert.equal(f.requests(),0);assert.deepEqual(f.snapshot(),before);
 }finally{await f.clean();}
});
test('queue CLI rejects aliased stores, ambiguous arguments and unreviewed origins without claiming',async()=>{
 const f=await fixture();try{
  const before=f.snapshot(),hard=join(f.dir,'hard.sqlite'),sym=join(f.dir,'sym.sqlite');linkSync(f.bp,hard);symlinkSync(f.jp,sym);
  for(const args of [['--next',hard],['--next',sym],['--next'],['--next',f.qp,TX],[TX,f.qp]]){const r=await f.run(args);assert.equal(r.status,1);assert.equal(r.stdout,'');}
  for(const env of [{FORTUNE_ARBITRAGE_SECONDARY_RPC_URL:rpcEnv.FORTUNE_ARBITRAGE_READ_RPC_URL},{FORTUNE_ARBITRAGE_SECONDARY_RPC_URL:'http://private.invalid'},{FORTUNE_ARBITRAGE_SECONDARY_RPC_URL:'https://user:secret@private.invalid'}]){const r=await f.run(undefined,env);assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/secret|private.invalid/);}
  assert.equal(f.requests(),0);assert.deepEqual(f.snapshot(),before);
 }finally{await f.clean();}
});
test('queue CLI cannot invent a reservation for a queued hash and leaves the lease unfinished without RPC',async()=>{
 const f=await fixture();try{
  const other=join(f.dir,'unreserved.sqlite');const q=new Queue(other,market());q.enqueue(h(99));q.close();
  const r=await f.run(['--next',other]);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(f.requests(),0);
  const reopened=new Queue(other,market(),Date.now,{readOnly:true});assert.equal(reopened.stats().leased,1);assert.equal(reopened.stats().done,0);reopened.close();
  const b=new Book(f.bp,policy(),Date.now,{readOnly:true});assert.equal(b.status().pendingRechecks,0);assert.equal(b.status().reservedWei,'100000');b.close();
 }finally{await f.clean();}
});
