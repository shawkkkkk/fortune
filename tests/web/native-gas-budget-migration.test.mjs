import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,existsSync,statSync,writeFileSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync,spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { StrategyNativeGasBudget as V1 } from '../fixtures/native-gas-budget-v1.mjs';
import { StrategyNativeGasBudget as V2 } from '../../scripts/strategy-native-gas-budget.mjs';
import { inspectLegacyNativeGasBudget as inspect,migrateLegacyNativeGasBudget as migrate } from '../../scripts/native-gas-budget-migration.mjs';
import { fillMarketHash,readVerifiedFill } from '../../lib/arbitrage-receipts.ts';
import { market,receiptClient,TX,h,a } from '../fixtures/arbitrage-receipts.mjs';
const policy=()=>({chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(market())],perTransactionWei:'100000',rollingDayWei:'150000'});
function fixture(){const dir=mkdtempSync(join(tmpdir(),'fortune-migrate-'));return {dir,path:join(dir,'gas.sqlite'),backupPath:join(dir,'original-v1.sqlite'),clock:()=>100000,clean:()=>rmSync(dir,{recursive:true,force:true})};}
function options(f,digest=inspect(f.path,policy(),100000).sourceDigest){return {path:f.path,backupPath:f.backupPath,reviewedPolicy:policy(),expectedSourceDigest:digest,offlineWorkersStopped:true,now:100000};}
const fill=o=>readVerifiedFill([receiptClient(o),receiptClient(o)],market(),TX);
test('historical v1 charges/reservations migrate with exact history/clock, read-only backup and no authority',async()=>{
 const f=fixture();let b;
 try{
  b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.charge(await fill());b.reserve(h(2),'50000');const before=b.status();b.close();b=null;
  const plan=inspect(f.path,policy(),100000);const result=migrate(options(f,plan.sourceDigest));
  assert.equal(result.schemaVersion,2);assert.equal(result.executionAuthorized,false);assert.equal(result.lastClock,100000);
  assert.equal(inspect(f.backupPath,policy(),100000).sourceDigest,plan.sourceDigest);assert.equal(statSync(f.backupPath).mode&0o777,0o400);
  assert.throws(()=>new V1(f.path,policy(),f.clock),/policy/);
  b=new V2(f.path,policy(),f.clock);const after=b.status();for(const k of ['reservedWei','chargedRollingDayWei','remainingWei','retainedEntries','blocked'])assert.equal(after[k],before[k]);
  assert.equal(after.pendingRechecks,0);assert.equal(b.reserve(TX,'100000').inserted,false);assert.throws(()=>b.reserve(h(3),'50001'),/limit/);
  b.close();b=null;assert.throws(()=>migrate(options(f,plan.sourceDigest)),/legacy|schema/i);
 }finally{b?.close();f.clean();}
});
test('quarantine, conflict evidence and overrun exposure survive without unlocking',async()=>{
 const f=fixture();let b;
 try{b=new V1(f.path,policy(),f.clock);b.reserve(TX,'1');b.charge(await fill());const before=b.status();b.close();b=null;
 const plan=inspect(f.path,policy(),100000);assert.equal(plan.blocked,true);assert.equal(plan.conflicts,1);migrate(options(f));
 b=new V2(f.path,policy(),f.clock);assert.equal(b.status().reservedWei,before.reservedWei);assert.equal(b.status().blocked,true);assert.throws(()=>b.reserve(h(2),'1'),/quarantined/);
 assert.equal(inspect(f.backupPath,policy(),100000).sourceDigest,plan.sourceDigest);
 }finally{b?.close();f.clean();}
});
test('stale digest, policy repin, offline omission and rollback clock leave v1 untouched',()=>{
 const f=fixture();try{const b=new V1(f.path,policy(),f.clock);const initial=inspect(f.path,policy(),100000);b.reserve(TX,'100000');b.close();const current=inspect(f.path,policy(),100000);
 for(const bad of [{expectedSourceDigest:initial.sourceDigest},{offlineWorkersStopped:false},{now:99999},{reviewedPolicy:{...policy(),rollingDayWei:'150001'}}]){
  assert.throws(()=>migrate({...options(f,current.sourceDigest),...bad}));assert.equal(inspect(f.path,policy(),100000).sourceDigest,current.sourceDigest);assert.equal(existsSync(f.backupPath),false);
 }
 }finally{f.clean();}
});
test('backup overwrite/symlink failure rolls back schema and never deletes evidence',()=>{
 const f=fixture();try{const b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.close();const plan=inspect(f.path,policy(),100000);
 writeFileSync(f.backupPath,'retain me');assert.throws(()=>migrate(options(f)));assert.equal(inspect(f.path,policy(),100000).sourceDigest,plan.sourceDigest);
 const link=join(f.dir,'backup-link');symlinkSync(f.backupPath,link);assert.throws(()=>migrate({...options(f),backupPath:link}));
 const sourceLink=join(f.dir,'source-link');symlinkSync(f.path,sourceLink);assert.throws(()=>inspect(sourceLink,policy(),100000));
 }finally{f.clean();}
});
test('uninitialized, extended, malformed and inconsistent legacy stores fail before backup',()=>{
 for(const mutation of [db=>db.exec('CREATE TABLE surprise(x)'),db=>db.exec("UPDATE gas_entries SET state='charged'"),db=>db.exec("UPDATE gas_policy SET blocked=3"),db=>db.exec("UPDATE gas_entries SET ceiling='01'")]){
 const f=fixture();try{const b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.close();const db=new DatabaseSync(f.path);mutation(db);db.close();assert.throws(()=>inspect(f.path,policy(),100000));assert.equal(existsSync(f.backupPath),false);}finally{f.clean();}
 }
 const f=fixture();try{const db=new DatabaseSync(f.path);db.close();assert.throws(()=>inspect(f.path,policy(),100000));assert.throws(()=>inspect(join(f.dir,'missing'),policy(),100000));assert.equal(existsSync(join(f.dir,'missing')),false);}finally{f.clean();}
});
test('actual operator CLI uses count-only inspection and explicit offline digest confirmation',()=>{
 const f=fixture();try{const b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.close();const manifest=join(f.dir,'policy.json');writeFileSync(manifest,JSON.stringify(policy()));
 const run=(...args)=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/migrate-native-gas-budget.mjs',...args],{encoding:'utf8'});
 const inspection=run('inspect',f.path,manifest);assert.equal(inspection.status,0);const plan=JSON.parse(inspection.stdout);assert.equal(plan.executionAuthorized,false);assert.equal(inspection.stdout.includes(TX),false);
 const failed=run('migrate',f.path,manifest,f.backupPath,plan.sourceDigest);assert.equal(failed.status,1);assert.equal(existsSync(f.backupPath),false);
 const done=run('migrate',f.path,manifest,f.backupPath,plan.sourceDigest,'--offline-workers-stopped');assert.equal(done.status,0);assert.equal(JSON.parse(done.stdout).schemaVersion,2);
 }finally{f.clean();}
});
test('real process death immediately before/after source commit leaves v1-or-v2, never partial schema',()=>{
 for(const after of [false,true]){
  const f=fixture();try{
   const b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.close();const plan=inspect(f.path,policy(),100000);
   const code=`import {DatabaseSync} from 'node:sqlite';let commits=0;const original=DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec=function(sql){if(sql==='COMMIT'&&++commits===2){${after?"const r=original.call(this,sql);process.exit(43);return r;":"process.exit(42);"}}return original.call(this,sql);};
    const {migrateLegacyNativeGasBudget}=await import('./scripts/native-gas-budget-migration.mjs');
    migrateLegacyNativeGasBudget(${JSON.stringify(options(f,plan.sourceDigest))});`;
   const child=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',code],{encoding:'utf8'});
   assert.equal(child.status,after?43:42);assert.equal(inspect(f.backupPath,policy(),100000).sourceDigest,plan.sourceDigest);
   if(after){const current=new V2(f.path,policy(),f.clock,{readOnly:true});assert.equal(current.status().reservedWei,'100000');current.close();}
   else{assert.equal(inspect(f.path,policy(),100000).sourceDigest,plan.sourceDigest);assert.throws(()=>migrate(options(f)),/EXIST/);}
  }finally{f.clean();}
 }
});
test('two migration processes serialize: one upgrade/backup, the other rejects version drift',async()=>{
 const f=fixture();try{
  const b=new V1(f.path,policy(),f.clock);b.reserve(TX,'100000');b.close();const plan=inspect(f.path,policy(),100000);
  const manifest=join(f.dir,'policy.json');writeFileSync(manifest,JSON.stringify(policy()));
  const run=backup=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import','./scripts/register-ts.mjs','scripts/migrate-native-gas-budget.mjs','migrate',f.path,manifest,backup,plan.sourceDigest,'--offline-workers-stopped'],{stdio:'ignore'});p.on('error',reject);p.on('close',code=>resolve(code));});
  const second=join(f.dir,'second-backup.sqlite');const results=await Promise.all([run(f.backupPath),run(second)]);
  assert.deepEqual(results.sort(),[0,1]);assert.equal([f.backupPath,second].filter(existsSync).length,1);
  const backup=existsSync(f.backupPath)?f.backupPath:second;assert.equal(inspect(backup,policy(),100000).sourceDigest,plan.sourceDigest);
  const current=new V2(f.path,policy(),f.clock,{readOnly:true});assert.equal(current.status().reservedWei,'100000');current.close();
 }finally{f.clean();}
});
