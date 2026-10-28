import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, fsyncSync, lstatSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { nativeGasPolicyDigest } from './strategy-native-gas-budget.mjs';

const ddl={
  gas_policy:'CREATE TABLE gas_policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,digest TEXT NOT NULL,last_clock INTEGER NOT NULL,blocked INTEGER NOT NULL)',
  gas_entries:"CREATE TABLE gas_entries(tx TEXT PRIMARY KEY,ceiling TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','charged','quarantined')),cost TEXT,charged_at INTEGER,evidence TEXT)",
  gas_conflicts:'CREATE TABLE gas_conflicts(tx TEXT NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(tx,evidence))',
};
const normalized=s=>s.replace(/IF NOT EXISTS /g,'').replace(/\s+/g,' ').trim();
const hash=s=>typeof s==='string'&&/^0x[0-9a-fA-F]{64}$/.test(s)&&!/^0x0{64}$/i.test(s);
const amount=s=>{if(typeof s!=='string'||!/^[1-9][0-9]{0,38}$/.test(s)||BigInt(s)>((1n<<128n)-1n))throw Error('Invalid legacy amount');return BigInt(s);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function identity(path){if(!Number.isInteger(constants.O_NOFOLLOW)||!Number.isInteger(constants.O_DIRECTORY))throw Error('POSIX filesystem support required');const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('Protected regular single-link source required');return `${s.dev}:${s.ino}`;}
function syncFile(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}}
function syncDirectory(path){const fd=openSync(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function evidence(raw,tx,reviewedPolicy){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error('Invalid evidence');
  const v=JSON.parse(raw);
  if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join(',')!=='blockHash,cost,marketHash,receiptDigest,receiptId'
    ||typeof v.receiptId!=='string'||v.receiptId.length>256||!hash(v.receiptDigest)||!hash(v.blockHash)||!hash(v.marketHash))throw Error('Invalid evidence');
  const prefix=`97:${tx}:`,index=v.receiptId.slice(prefix.length);
  if(!v.receiptId.startsWith(prefix)||!/^(0|[1-9][0-9]{0,15})$/.test(index)||!Number.isSafeInteger(Number(index))||!reviewedPolicy.marketHashes.map(x=>x.toLowerCase()).includes(v.marketHash.toLowerCase()))throw Error('Evidence binding differs');
  amount(v.cost);return v;
}
function snapshot(db,reviewedPolicy,now){
  const digest=nativeGasPolicyDigest(reviewedPolicy);
  if(!integer(now))throw Error('Invalid host clock');
  const objects=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  if(objects.length!==3||objects.some(x=>x.type!=='table'||!ddl[x.name]||normalized(x.sql)!==normalized(ddl[x.name])))throw Error('Exact legacy schema required');
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Legacy integrity check failed');
  if(db.prepare('PRAGMA user_version').get().user_version!==0||db.prepare('PRAGMA application_id').get().application_id!==0)throw Error('Unexpected legacy header');
  if(db.prepare('SELECT count(*) AS n FROM gas_policy').get().n!==1||db.prepare('SELECT 1 FROM gas_policy WHERE typeof(digest)!=\'text\' OR length(digest)!=64 LIMIT 1').get())throw Error('Invalid policy bounds');
  if(db.prepare('SELECT count(*) AS n FROM gas_entries').get().n>10000||db.prepare('SELECT count(*) AS n FROM gas_conflicts').get().n>10000)throw Error('Legacy retention exceeds bound');
  if(db.prepare(`SELECT 1 FROM gas_entries WHERE typeof(tx)!='text' OR length(tx)!=66 OR typeof(ceiling)!='text' OR length(ceiling)>39
    OR (cost IS NOT NULL AND (typeof(cost)!='text' OR length(cost)>39)) OR typeof(state)!='text' OR length(state)>16
    OR (evidence IS NOT NULL AND (typeof(evidence)!='text' OR length(CAST(evidence AS BLOB))>4096)) LIMIT 1`).get()
    ||db.prepare("SELECT 1 FROM gas_conflicts WHERE typeof(tx)!='text' OR length(tx)!=66 OR typeof(evidence)!='text' OR length(CAST(evidence AS BLOB))>4096 LIMIT 1").get())throw Error('Legacy row bounds exceeded');
  const policies=db.prepare('SELECT * FROM gas_policy').all();
  if(policies.length!==1)throw Error('One initialized legacy policy required');
  const p=policies[0];
  if(p.singleton!==1||p.version!==1||p.digest!==digest||!integer(p.last_clock)||p.last_clock>now||![0,1].includes(p.blocked))throw Error('Legacy policy/version/clock differs');
  const entries=db.prepare('SELECT * FROM gas_entries ORDER BY tx').all(),conflicts=db.prepare('SELECT * FROM gas_conflicts ORDER BY tx,evidence').all();
  if(entries.length>10000||conflicts.length>10000)throw Error('Legacy retention exceeds bound');
  const byTx=new Map(entries.map(x=>[x.tx,x]));
  for(const e of entries){
    if(!hash(e.tx)||e.tx!==e.tx.toLowerCase()||amount(e.ceiling)>amount(reviewedPolicy.perTransactionWei)||!['reserved','charged','quarantined'].includes(e.state))throw Error('Invalid legacy reservation');
    if(e.state==='reserved'){if(e.cost!==null||e.charged_at!==null||e.evidence!==null)throw Error('Invalid pending reservation');}
    else{
      const cost=amount(e.cost);
      if(e.charged_at!==null&&(!integer(e.charged_at)||e.charged_at>p.last_clock))throw Error('Invalid charge clock');
      if(e.evidence!==null){const v=evidence(e.evidence,e.tx,reviewedPolicy);if(BigInt(v.cost)>cost)throw Error('Evidence exceeds recorded cost');}
      if(e.state==='charged'&&(cost>BigInt(e.ceiling)||e.charged_at===null||e.evidence===null||BigInt(evidence(e.evidence,e.tx,reviewedPolicy).cost)!==cost))throw Error('Invalid charge');
      if(e.state==='quarantined'&&p.blocked!==1)throw Error('Quarantine must remain blocked');
    }
  }
  for(const c of conflicts){const entry=byTx.get(c.tx);if(!entry||entry.state!=='quarantined'||p.blocked!==1||BigInt(evidence(c.evidence,c.tx,reviewedPolicy).cost)>BigInt(entry.cost))throw Error('Invalid retained conflict');}
  // Evidence remains historical/unverified; parsing it does not brand a fill.
  const data={policy:p,entries,conflicts};
  return {data,digest:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
function report(s){return {schemaVersion:1,sourceDigest:s.digest,entries:s.data.entries.length,conflicts:s.data.conflicts.length,
  blocked:s.data.policy.blocked===1,lastClock:s.data.policy.last_clock,executionAuthorized:false};}
export function inspectLegacyNativeGasBudget(path,reviewedPolicy,now=Date.now()){
  path=resolve(path);const id=identity(path),db=new DatabaseSync(path,{readOnly:true});
  try{db.exec('PRAGMA busy_timeout=5000; BEGIN');const s=snapshot(db,reviewedPolicy,now);if(identity(path)!==id)throw Error('Source identity changed');db.exec('COMMIT');return Object.freeze(report(s));}
  finally{db.close();}
}

/** Explicit POSIX offline migration. Never invoked by the runtime constructor. */
export function migrateLegacyNativeGasBudget({path,backupPath,reviewedPolicy,expectedSourceDigest,offlineWorkersStopped=false,now=Date.now()}){
  if(offlineWorkersStopped!==true||typeof expectedSourceDigest!=='string'||!/^[0-9a-f]{64}$/.test(expectedSourceDigest))throw Error('Offline review and exact source digest required');
  path=resolve(path);backupPath=resolve(backupPath);if(path===backupPath)throw Error('Separate fresh backup required');
  const id=identity(path),db=new DatabaseSync(path);let backup;
  try{
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    const source=snapshot(db,reviewedPolicy,now);if(source.digest!==expectedSourceDigest||identity(path)!==id)throw Error('Reviewed source changed');
    // Reserve without overwrite/symlink following. Failures retain any partial backup for investigation.
    const fd=openSync(backupPath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);
    const backupId=identity(backupPath);backup=new DatabaseSync(backupPath);if(identity(backupPath)!==backupId)throw Error('Backup identity changed');backup.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    for(const sql of Object.values(ddl))backup.exec(sql);
    const p=source.data.policy;backup.prepare('INSERT INTO gas_policy VALUES(?,?,?,?,?)').run(p.singleton,p.version,p.digest,p.last_clock,p.blocked);
    const insert=backup.prepare('INSERT INTO gas_entries VALUES(?,?,?,?,?,?)');
    for(const e of source.data.entries)insert.run(e.tx,e.ceiling,e.state,e.cost,e.charged_at,e.evidence);
    const conflict=backup.prepare('INSERT INTO gas_conflicts VALUES(?,?)');for(const c of source.data.conflicts)conflict.run(c.tx,c.evidence);
    if(snapshot(backup,reviewedPolicy,now).digest!==source.digest)throw Error('Backup snapshot differs');
    backup.exec('COMMIT');backup.close();backup=null;
    if(identity(backupPath)!==backupId)throw Error('Backup identity changed');
    chmodSync(backupPath,0o400);syncFile(backupPath);syncDirectory(backupPath);
    if(identity(path)!==id)throw Error('Source identity changed');
    db.exec('CREATE TABLE gas_recheck_holds(tx TEXT PRIMARY KEY,fence TEXT NOT NULL)');
    if(db.prepare('UPDATE gas_policy SET version=2 WHERE singleton=1 AND version=1').run().changes!==1)throw Error('Policy update differs');
    db.exec('COMMIT');
    return Object.freeze({...report(source),schemaVersion:2,backupSnapshotDigest:source.digest,migrated:true,holdsCreated:0,executionAuthorized:false});
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
  finally{backup?.close();db.close();}
}
