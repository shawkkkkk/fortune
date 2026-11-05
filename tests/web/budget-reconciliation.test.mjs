import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { StrategyNativeGasBudget as Book } from '../../scripts/strategy-native-gas-budget.mjs';
import { ArbitrageFillJournal as Journal } from '../../scripts/arbitrage-fill-journal.mjs';
import { reconcileBudgetedReceipt as reconcile } from '../../scripts/reconcile-budgeted-receipt.mjs';
import { observeNextBudgetedReceipt as observe } from '../../scripts/reconcile-budgeted-receipt.mjs';
import { ReceiptObservationQueue as Queue } from '../../scripts/arbitrage-observer-queue.mjs';
import { fillMarketHash,readVerifiedFill } from '../../lib/arbitrage-receipts.ts';
import { market,receiptClient,TX,h,a } from '../fixtures/arbitrage-receipts.mjs';
const policy=()=>({chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(market())],perTransactionWei:'100000',rollingDayWei:'150000'});
const clients=o=>[receiptClient(o),receiptClient(o)];
function setup(){const dir=mkdtempSync(join(tmpdir(),'fortune-reconcile-'));let now=100000;const path=join(dir,'gas.sqlite'),jp=join(dir,'fills.sqlite');return {dir,path,jp,clock:()=>now,set:n=>{now=n;},clean:()=>rmSync(dir,{recursive:true,force:true})};}
test('queued budget observer commits journal and gas before completion and survives reopen',async()=>{
 const f=setup();let b,j,q;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);
 b.reserve(TX,'100000');q.enqueue(TX);
 const readers=clients().map(c=>({...c,async getChainId(){assert.equal(q.stats().leased,1);assert.equal(q.stats().done,0);assert.equal(b.status().pendingRechecks,1);return c.getChainId();}}));
 const complete=q.complete.bind(q);q.complete=lease=>{assert.equal(j.list().length,1);assert.equal(b.status().pendingRechecks,0);assert.equal(b.status().chargedRollingDayWei,'50000');return complete(lease);};
 assert.equal((await observe(q,b,j,readers,market())).state,'done');
 q.close();b.close();j.close();q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());
 assert.equal(q.enqueue(TX).inserted,false);assert.equal((await observe(q,b,j,clients(),market())).state,'idle');assert.equal(j.list().length,1);assert.equal(b.status().chargedRollingDayWei,'50000');
 }finally{q?.close();j?.close();b?.close();f.clean();}
});
test('queued observer rejects mismatched configuration before claiming or querying providers',async()=>{
 const f=setup();let b,j,q,bad;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);q.enqueue(TX);
 const same=receiptClient();await assert.rejects(observe(q,b,j,[same,same],market()));
 bad=new Queue(join(f.dir,'other.sqlite'),{...market(),confirmations:21},f.clock);bad.enqueue(TX);
 await assert.rejects(observe(bad,b,j,clients(),market()),/policy/);assert.equal(q.stats().pending,1);assert.equal(bad.stats().pending,1);assert.equal(b.status().pendingRechecks,0);
 }finally{bad?.close();q?.close();j?.close();b?.close();f.clean();}
});
test('failed queued verification never marks done and blocked restart does not reclaim or read',async()=>{
 const f=setup();let b,j,q;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);b.reserve(TX,'100000');q.enqueue(TX);
 assert.equal((await observe(q,b,j,clients({unavailable:true}),market())).state,'quarantined');assert.equal(q.stats().done,0);assert.equal(q.stats().leased,1);
 q.close();b.close();j.close();f.set(300001);q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());
 const noReads=clients().map(c=>new Proxy(c,{get(){throw Error('unexpected read');}}));
 assert.equal((await observe(q,b,j,noReads,market())).state,'blocked');assert.equal(q.stats().leased,1);assert.equal(b.status().pendingRechecks,1);
 }finally{q?.close();j?.close();b?.close();f.clean();}
});
test('expired queue completion preserves accounting and replay retains original charge time',async()=>{
 const f=setup();let b,j,q;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);b.reserve(TX,'100000');q.enqueue(TX);
 const complete=q.complete.bind(q);q.complete=lease=>{f.set(220001);return complete(lease);};
 await assert.rejects(observe(q,b,j,clients(),market()),/Lease/);assert.equal(q.stats().done,0);assert.equal(j.list().length,1);assert.equal(b.status().chargedRollingDayWei,'50000');
 const db=new DatabaseSync(f.path,{readOnly:true});const before=db.prepare('SELECT cost,charged_at,evidence FROM gas_entries WHERE tx=?').get(TX);db.close();
 q.complete=complete;assert.equal((await observe(q,b,j,clients(),market())).state,'done');assert.equal(j.list().length,1);
 const reopened=new DatabaseSync(f.path,{readOnly:true});assert.deepEqual(reopened.prepare('SELECT cost,charged_at,evidence FROM gas_entries WHERE tx=?').get(TX),before);reopened.close();
 }finally{q?.close();j?.close();b?.close();f.clean();}
});
test('uncertain journal persistence leaves queued work unfinished and durable hold retained',async()=>{
 const f=setup();let b,q;
 try{b=new Book(f.path,policy(),f.clock);q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);b.reserve(TX,'100000');q.enqueue(TX);
 const broken={marketHash:fillMarketHash(market()),record(){throw Error('private storage');},quarantineKnown(){throw Error('private storage');}};
 await assert.rejects(observe(q,b,broken,clients(),market()),/operator investigation/);assert.equal(q.stats().done,0);assert.equal(q.stats().leased,1);assert.equal(b.status().pendingRechecks,1);assert.equal(b.status().blocked,true);
 }finally{q?.close();b?.close();f.clean();}
});
test('hold exists before provider reads; journal commits before headroom release; replay retains original window',async()=>{
 const f=setup();let b,j;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());b.reserve(TX,'100000');const c=clients().map(r=>({...r,async getChainId(){assert.equal(b.status().pendingRechecks,1);assert.equal(b.status().blocked,true);return r.getChainId();}}));
 assert.equal((await reconcile(b,j,c,market(),TX)).state,'reconciled-observation');assert.equal(j.list().length,1);assert.equal(b.status().pendingRechecks,0);assert.equal(b.status().chargedRollingDayWei,'50000');
 f.set(100001);assert.equal((await reconcile(b,j,clients(),market(),TX)).state,'reconciled-observation');f.set(100000+86400000);assert.equal(b.status().chargedRollingDayWei,'0');
 }finally{j?.close();b?.close();f.clean();}
});
test('unavailable and changed rechecks persistently freeze book and quarantine known journal rows',async()=>{
 for(const options of [{unavailable:true},{blockHash:h(999)}]){const f=setup();let b,j;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());b.reserve(TX,'100000');await reconcile(b,j,clients(),market(),TX);
 f.set(100000+86400001);assert.equal(b.status().chargedRollingDayWei,'0');
 assert.equal((await reconcile(b,j,clients(options),market(),TX)).state,'quarantined');assert.equal(j.list()[0].state,'quarantined');assert.equal(b.status().reservedWei,'100000');
 b.close();j.close();b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());assert.equal(b.status().blocked,true);assert.throws(()=>b.reserve(h(80),'1'));await assert.rejects(reconcile(b,j,clients(),market(),TX));
 }finally{j?.close();b?.close();f.clean();}}
});
test('policy/client configuration fails before holds or reads; storage failure cannot report reconciliation',async()=>{
 const f=setup();let b,j;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());b.reserve(TX,'100000');
 const bad=new Journal(join(f.dir,'bad.sqlite'),{...market(),confirmations:21});await assert.rejects(reconcile(b,bad,clients(),market(),TX),/policy/);bad.close();
 const same=receiptClient();await assert.rejects(reconcile(b,j,[same,same],market(),TX));assert.equal(b.status().pendingRechecks,0);
 const original=b.charge.bind(b);b.charge=()=>{throw Error('private storage failure');};
 assert.equal((await reconcile(b,j,clients(),market(),TX)).state,'quarantined');b.charge=original;
 assert.equal(b.status().blocked,true);assert.equal(j.list()[0].state,'quarantined');
 }finally{j?.close();b?.close();f.clean();}
});
test('process death after a durable hold cannot free a prior aged charge or be automatically resumed',async()=>{
 const f=setup();let b,j;
 try{b=new Book(f.path,policy());j=new Journal(f.jp,market());b.reserve(TX,'100000');await reconcile(b,j,clients(),market(),TX);b.close();b=null;j.close();j=null;
 const worker=`import {StrategyNativeGasBudget as B} from './scripts/strategy-native-gas-budget.mjs';import {market,TX} from './tests/fixtures/arbitrage-receipts.mjs';const b=new B(process.argv[1],JSON.parse(process.argv[2]));b.beginRecheck(TX,market());process.exit(0);`;
 const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',worker,f.path,JSON.stringify(policy())],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 b=new Book(f.path,policy(),()=>Date.now()+86400001);assert.equal(b.status().reservedWei,'100000');assert.equal(b.status().pendingRechecks,1);assert.equal(b.status().blocked,true);
 assert.throws(()=>b.beginRecheck(TX,market()));assert.throws(()=>b.reserve(h(82),'1'));
 }finally{j?.close();b?.close();f.clean();}
});
test('fence mismatch cannot charge or clear another recheck and overrun quarantines both files',async()=>{
 const f=setup();let b,j;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());b.reserve(TX,'1');
 const hold=b.beginRecheck(TX,market()),v=await readVerifiedFill(clients(),market(),TX);
 assert.throws(()=>b.charge(v),/fence/);assert.throws(()=>b.charge(v,{...hold,fence:'wrong'}),/fence/);
 assert.equal(b.status().pendingRechecks,1);assert.equal(b.charge(v,hold).state,'quarantined');b.quarantineRecheck(hold);assert.equal(b.status().blocked,true);
 }finally{j?.close();b?.close();f.clean();}
 const g=setup();let bb,jj;
 try{bb=new Book(g.path,policy(),g.clock);jj=new Journal(g.jp,market());bb.reserve(TX,'1');assert.equal((await reconcile(bb,jj,clients(),market(),TX)).state,'quarantined');assert.equal(jj.list()[0].state,'quarantined');}
 finally{jj?.close();bb?.close();g.clean();}
});
test('schema v1 is rejected and failed quarantine persistence is a hard error with durable hold retained',async()=>{
 const f=setup();let b,j;
 try{b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());b.reserve(TX,'100000');j.close();j=null;
 const broken={marketHash:fillMarketHash(market()),record(){throw Error('private journal path');},quarantineKnown(){throw Error('private journal path');}};
 await assert.rejects(reconcile(b,broken,clients(),market(),TX),/operator investigation/);assert.equal(b.status().pendingRechecks,1);assert.equal(b.status().blocked,true);b.close();b=null;
 const db=new DatabaseSync(f.path);db.exec('UPDATE gas_policy SET version=1');db.close();assert.throws(()=>new Book(f.path,policy()),/policy/);
 }finally{j?.close();b?.close();f.clean();}
});
test('operator CLI refuses absent files and does not expose private configuration',async()=>{
 const {existsSync}=await import('node:fs');const f=setup();
 try{const missing=join(f.dir,'private-budget.sqlite');const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/run-budget-reconciliation.mjs','private-market.json','private-policy.json',f.jp,missing,TX],{encoding:'utf8',env:{...process.env,FORTUNE_ARBITRAGE_READ_RPC_URL:'https://secret.invalid/private-key'}});
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(existsSync(missing),false);assert.doesNotMatch(r.stderr,/private-market|private-policy|private-budget|secret.invalid|private-key/);
 }finally{f.clean();}
});

for(const queued of [false,true])test(`malformed receipt client rejects before ${queued?'queue claim':'direct hold'} or provider calls`,async()=>{
 const f=setup();let b,j,q;
 try{
  const qp=join(f.dir,'jobs.sqlite');
  b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(qp,market(),f.clock);
  b.reserve(TX,'100000');q.enqueue(TX);
  const before=b.status();let calls=0;
  const bad=clients().map(c=>({...c,async getChainId(){calls++;return 97;}}));
  delete bad[1].getTransactionReceipt;
  const run=readers=>queued?observe(q,b,j,readers,market()):reconcile(b,j,readers,market(),TX);
  await assert.rejects(run(bad),/Receipt RPC methods required/);
  await assert.rejects(run([bad[0],null]),/Receipt RPC methods required/);
  Object.defineProperty(bad[1],'getTransactionReceipt',{get(){throw Error('private provider URL');}});
  await assert.rejects(run(bad),{message:'Receipt RPC methods required'});
  const sparse=[bad[0],,];Object.setPrototypeOf(sparse,Object.assign(Object.create(Array.prototype),{1:clients()[0]}));
  await assert.rejects(run(sparse),/Two distinct read clients required/);
  assert.equal(calls,0);
  assert.deepEqual(q.stats(),{pending:1,leased:0,done:0,exhausted:0});
  assert.deepEqual(b.status(),before);assert.deepEqual(j.list(),[]);
  b.close();b=null;q.close();q=null;
  b=new Book(f.path,policy(),f.clock);q=new Queue(qp,market(),f.clock);
  assert.deepEqual(b.status(),before);assert.equal(q.stats().pending,1);
 }finally{q?.close();j?.close();b?.close();f.clean();}
});
test('queued reconciliation pins admitted methods and retains their original receiver',async()=>{
 const f=setup();let b,j,q;
 try{
  b=new Book(f.path,policy(),f.clock);j=new Journal(f.jp,market());q=new Queue(join(f.dir,'jobs.sqlite'),market(),f.clock);
  b.reserve(TX,'100000');q.enqueue(TX);
  const pair=clients();let calls=0;
  for(const c of pair){
   const get=c.getTransactionReceipt;
   c.getTransactionReceipt=function(...args){assert.equal(this,c);assert.equal(b.status().pendingRechecks,1);calls++;return get.apply(this,args);};
  }
  const claim=q.claim.bind(q);
  q.claim=()=>{const lease=claim();for(const c of pair)c.getTransactionReceipt=()=>{throw Error('unexpected replacement');};return lease;};
  assert.equal((await observe(q,b,j,pair,market())).state,'done');
  assert.equal(calls,2);assert.equal(j.list().length,1);assert.equal(b.status().chargedRollingDayWei,'50000');
 }finally{q?.close();j?.close();b?.close();f.clean();}
});
