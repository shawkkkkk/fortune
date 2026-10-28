import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { ReceiptObservationQueue as Queue } from '../../scripts/arbitrage-observer-queue.mjs';
import { ArbitrageFillJournal as Journal } from '../../scripts/arbitrage-fill-journal.mjs';
import { market, receiptClient, TX } from '../fixtures/arbitrage-receipts.mjs';
function fixture() {const dir=mkdtempSync(join(tmpdir(),'fortune-health-'));let now=1000;return {dir,path:join(dir,'jobs.sqlite'),journal:join(dir,'fills.sqlite'),clock:()=>now,set:n=>{now=n},clean:()=>rmSync(dir,{recursive:true,force:true})};}
test('health sees overdue ready work at the threshold without claiming jobs or advancing clock',()=>{
 const f=fixture();let q;
 try{q=new Queue(f.path,market(),f.clock);q.enqueue(TX);assert.equal(q.health().healthy,true);
 f.set(300999);assert.equal(q.health().healthy,true);f.set(301000);assert.deepEqual(q.health().reasons,['OVERDUE_READY_JOBS']);assert.equal(q.stats().pending,1);
 f.set(1000);assert.equal(q.health().healthy,true);assert.equal(q.claim().attempt,1);
 assert.throws(()=>q.health(0));assert.throws(()=>q.health(3600001));
 }finally{q?.close();f.clean();}
});
test('health detects expired leases and rollback without recovering jobs or hiding terminal failures',()=>{
 const f=fixture();let q;
 try{q=new Queue(f.path,market(),f.clock);q.enqueue(TX);let lease=q.claim();f.set(lease.leaseUntil);
 assert.deepEqual(q.health().reasons,['EXPIRED_LEASES']);assert.equal(q.stats().leased,1);
 f.set(999);let h=q.health();assert.equal(h.clockValid,false);assert.equal(h.expiredLeases,null);assert.deepEqual(h.reasons,['CLOCK_INVALID_OR_REVERSED']);
 f.set(lease.leaseUntil);for(let i=2;i<=5;i++){lease=q.claim();f.set(lease.leaseUntil);}q.claim();assert.deepEqual(q.health().reasons,['EXHAUSTED_JOBS']);
 q.close();q=new Queue(f.path,market(),f.clock);assert.equal(q.health().exhausted,1);
 }finally{q?.close();f.clean();}
});
test('retry backoff is not overdue until available, and capacity is reported without purging evidence',()=>{
 const f=fixture();let q,db;
 try{q=new Queue(f.path,market(),f.clock);q.enqueue(TX);const lease=q.claim();q.retry(lease);f.set(5999);assert.equal(q.health(1).readyPending,0);assert.equal(q.health(1).healthy,true);
 f.set(6001);assert.deepEqual(q.health(1).reasons,['OVERDUE_READY_JOBS']);q.close();q=null;
 db=new DatabaseSync(f.path);db.exec('BEGIN');db.exec('DELETE FROM observation_jobs');const insert=db.prepare("INSERT INTO observation_jobs VALUES(?,'done',1,1000,0,NULL,NULL)");for(let i=1;i<=10000;i++)insert.run('0x'+i.toString(16).padStart(64,'0'));db.exec('COMMIT');db.close();db=null;
 q=new Queue(f.path,market(),f.clock);const h=q.health();assert.equal(h.done,10000);assert.equal(h.capacityRemaining,0);assert.deepEqual(h.reasons,['RETENTION_FULL']);assert.equal(h.executionAuthorized,false);assert.equal(h.readinessAttested,false);assert.equal(q.stats().done,10000);
 }finally{q?.close();db?.close();f.clean();}
});
test('CLI status fails for quarantined evidence, restores nothing and never creates missing files',async()=>{
 const f=fixture();let q,j;
 try{const manifest=join(f.dir,'market.json');writeFileSync(manifest,JSON.stringify(market()));
 const run=()=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/run-receipt-observer.mjs',manifest,f.path,f.journal,'status'],{encoding:'utf8'});
 let r=run();assert.equal(r.status,1);assert.equal(existsSync(f.path),false);assert.equal(existsSync(f.journal),false);
 writeFileSync(f.path,'');writeFileSync(f.journal,'');r=run();assert.equal(r.status,1);
 const empty=new DatabaseSync(f.path,{readOnly:true});assert.equal(empty.prepare('SELECT count(*) AS n FROM sqlite_master').get().n,0);empty.close();
 q=new Queue(f.path,market());q.enqueue(TX);q.close();q=null;j=new Journal(f.journal,market());await j.refresh([receiptClient(),receiptClient()],TX);j.close();j=null;
 r=run();assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).healthy,true);
 j=new Journal(f.journal,market());await assert.rejects(j.refresh([receiptClient({unavailable:true}),receiptClient({unavailable:true})],TX));j.close();j=null;
 r=run();assert.equal(r.status,1);const h=JSON.parse(r.stdout);assert.deepEqual(h.reasons,['QUARANTINED_RECEIPTS']);assert.equal(h.journal.quarantined,1);assert.equal(h.scope,'local-observation-files');assert.equal(h.readinessAttested,false);assert.equal(h.executionAuthorized,false);
 assert.doesNotMatch(r.stdout,/0x0{60}|market.json|jobs.sqlite|fills.sqlite/);j=new Journal(f.journal,market());assert.equal(j.status().quarantined,1);
 }finally{q?.close();j?.close();f.clean();}
});
test('inspection connections reject writes and policy changes while retaining usable snapshots',async()=>{
 const f=fixture();let q,j;
 try{
  q=new Queue(f.path,market(),f.clock);q.enqueue(TX);q.close();j=new Journal(f.journal,market());j.close();
  q=new Queue(f.path,market(),f.clock,{readOnly:true});assert.equal(q.health().pending,1);assert.throws(()=>q.claim());assert.equal(q.health().pending,1);
  j=new Journal(f.journal,market(),{readOnly:true});await assert.rejects(j.refresh([receiptClient(),receiptClient()],TX));assert.equal(j.status().observed,0);
  assert.throws(()=>new Queue(f.path,{...market(),confirmations:21},f.clock,{readOnly:true}),/policy/);
 }finally{q?.close();j?.close();f.clean();}
});
