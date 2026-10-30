import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readVerifiedFill,fillMarketHash } from '../../lib/arbitrage-receipts.ts';
import { StrategyNativeGasBudget as Book } from '../../scripts/strategy-native-gas-budget.mjs';
import { ArbitrageFillJournal as Journal } from '../../scripts/arbitrage-fill-journal.mjs';
import { ReceiptObservationQueue as Queue } from '../../scripts/arbitrage-observer-queue.mjs';
import { observeNextBudgetedReceipt } from '../../scripts/reconcile-budgeted-receipt.mjs';
import { market,receiptClient,TX,a } from '../fixtures/arbitrage-receipts.mjs';
const tick=()=>new Promise(r=>setImmediate(r));

test('failed receipt peer fences delayed block continuations before further code reads',async()=>{
 let release,entered;const waiting=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 const first=receiptClient(),second=receiptClient();let codeReads=0;
 first.getCode=async()=>{await waiting;throw Error('fixture code failure');};
 const block=second.getBlock;second.getBlock=async args=>{entered();await gate;return block(args);};
 const code=second.getCode;second.getCode=async args=>{codeReads++;return code(args);};
 try{await assert.rejects(readVerifiedFill([first,second],market(),TX));}
 finally{release();await tick();await tick();}
 assert.equal(codeReads,0,'failed observation must not initiate late code reads');
});

test('receipt observation rejects backwards host time even above its original start',async()=>{
 const original=Date.now;let now=100000,reads=0;Date.now=()=>now;
 try{
  const cs=[receiptClient(),receiptClient()].map(c=>{const chain=c.getChainId;return {...c,async getChainId(){reads++;now=reads===1?100100:100050;return chain();}};});
  await assert.rejects(readVerifiedFill(cs,market(),TX),/expired|clock|backwards/);
 }finally{Date.now=original;}
});

test('receipt reader preserves method receivers and rejects duplicate client identity',async()=>{
 function reader(){const c=receiptClient();for(const k of Object.keys(c)){const method=c[k];c[k]=async function(...args){assert.equal(this,c);return method(...args);};}return c;}
 const one=reader();await assert.rejects(readVerifiedFill([one,one],market(),TX),/distinct/);
 assert.equal((await readVerifiedFill([one,reader()],market(),TX)).nativeGasCost,'50000');
});

test('real sixty-second wall timeout quarantines queued accounting before releasing a hung RPC', {timeout:70000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-receipt-lifetime-'));let b,j,q,release;
 try{
  const m=market(),policy={chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(m)],perTransactionWei:'100000',rollingDayWei:'150000'};
  const bp=join(dir,'gas.sqlite'),jp=join(dir,'fills.sqlite'),qp=join(dir,'jobs.sqlite');
  b=new Book(bp,policy);b.reserve(TX,'100000');j=new Journal(jp,m);q=new Queue(qp,m);q.enqueue(TX);
  const gate=new Promise(r=>{release=r;});let followOn=0;const one=receiptClient();one.getChainId=async()=>{await gate;return 97;};
  for(const k of ['getTransactionReceipt','getTransaction','getBlockNumber']){const fn=one[k];one[k]=async(...args)=>{followOn++;return fn(...args);};}
  const observed=observeNextBudgetedReceipt(q,b,j,[one,receiptClient()],m);
  // A separate test watchdog detects an absent engine wall timer without waiting forever.
  let watchdog;const limit=new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('engine did not settle within wall bound')),65000);});
  let result;try{result=await Promise.race([observed,limit]);}finally{clearTimeout(watchdog);}
  assert.equal(result.state,'quarantined');assert.equal(b.status().pendingRechecks,1);assert.equal(b.status().blocked,true);assert.equal(q.stats().done,0);assert.equal(q.stats().leased,1);assert.equal(j.list().length,0);
  release();await tick();await tick();assert.equal(followOn,0);assert.equal(j.list().length,0);
  q.close();q=null;j.close();j=null;b.close();b=null;
  const rb=new Book(bp,policy,Date.now,{readOnly:true});assert.equal(rb.status().pendingRechecks,1);assert.equal(rb.status().blocked,true);rb.close();
  const rq=new Queue(qp,m,Date.now,{readOnly:true});assert.equal(rq.stats().done,0);rq.close();
 }finally{release?.();await tick();q?.close();j?.close();b?.close();rmSync(dir,{recursive:true,force:true});}
});
