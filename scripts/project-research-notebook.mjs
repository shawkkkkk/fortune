import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,constants,lstatSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {projectToken} from '../lib/project-canon.ts';
import {boundedText,publicMetadataUrl} from '../lib/creator-metadata.ts';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const schema=`CREATE TABLE notebook(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,token TEXT NOT NULL,id TEXT NOT NULL,last_clock INTEGER NOT NULL);
CREATE TABLE notes(seq INTEGER PRIMARY KEY,client_id TEXT NOT NULL UNIQUE,previous TEXT NOT NULL,digest TEXT NOT NULL UNIQUE,recorded_at INTEGER NOT NULL,document TEXT NOT NULL);`;
function time(n){if(!Number.isSafeInteger(n)||n<1)throw Error('Clock');return n;}
function document(v){
 if(!v||Object.keys(v).sort().join()!=='body,corrects,kind,sources,title'||!['observation','hypothesis','correction'].includes(v.kind)
  ||!Number.isSafeInteger(v.corrects)||v.corrects<0||(v.kind==='correction')!==(v.corrects>0)||!Array.isArray(v.sources)||v.sources.length>5)throw Error('Document');
 const d={kind:v.kind,title:boundedText('Title',v.title,128),body:boundedText('Body',v.body,8192),sources:v.sources.map(x=>publicMetadataUrl('Source',x)),corrects:v.corrects};
 if(!d.title||!d.body||d.sources.some(x=>!x)||new Set(d.sources).size!==d.sources.length)throw Error('Document');
 if(Buffer.byteLength(JSON.stringify(d))>16384)throw Error('Document bound');return d;
}
const regular=p=>{const s=lstatSync(p);if(!s.isFile()||s.nlink!==1||s.isSymbolicLink()||s.size>32*1024*1024)throw Error('Protected notebook required');return s;};
/** Single protected host, local operator notes. Neither authorship nor claims are verified. */
export class ProjectResearchNotebook{
 #db;#token;#now;#readOnly;
 static initialize(path,token,now=Date.now()){
  token=projectToken(token);time(now);const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);
  const db=new DatabaseSync(path);try{db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');db.exec(schema);db.prepare('INSERT INTO notebook VALUES(1,1,?,?,?)').run(token,randomBytes(32).toString('hex'),now);db.exec('COMMIT;');}finally{db.close();}
 }
 constructor(path,token,{readOnly=false,now=Date.now}={}){
  this.#token=projectToken(token);this.#now=now;this.#readOnly=readOnly;const before=regular(path);this.#db=new DatabaseSync(path,{readOnly});
  try{const after=regular(path);if(before.ino!==after.ino||before.dev!==after.dev)throw Error('Replaced');this.#db.exec('PRAGMA busy_timeout=5000;');if(!readOnly)this.#db.exec('PRAGMA synchronous=FULL;');
   const tables=this.#db.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
   // Alphabetical order: notebook, notes.
   if(tables.length!==2||tables.some((x,i)=>x.sql!==schema.split(';').filter(x=>x.trim())[i].trim())||this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Schema');this.#db.exec('BEGIN;');try{this.#scan();}finally{this.#db.exec('ROLLBACK;');}
  }catch(e){this.#db.close();throw e;}
 }
 #scan(){
  const metadata=this.#db.prepare('SELECT * FROM notebook').all(),n=time(this.#now());
  if(metadata.length!==1||metadata[0].singleton!==1||metadata[0].version!==1||metadata[0].token!==this.#token||!/^[0-9a-f]{64}$/.test(metadata[0].id)||!Number.isSafeInteger(metadata[0].last_clock)||metadata[0].last_clock<1||metadata[0].last_clock>n)throw Error('Policy/clock');
  const m=metadata[0],size=this.#db.prepare('SELECT count(*) AS n,max(length(CAST(document AS BLOB))) AS bytes FROM notes').get();if(size.n>1000||size.bytes>16384)throw Error('Capacity');
  const rows=this.#db.prepare('SELECT * FROM notes ORDER BY seq').all();let head=sha([1,97,this.#token,m.id]),last=0;
  for(let i=0;i<rows.length;i++){const r=rows[i],d=document(JSON.parse(r.document));
   if(r.seq!==i+1||!/^[-a-zA-Z0-9_]{16,64}$/.test(r.client_id)||r.previous!==head||r.recorded_at<last||!Number.isSafeInteger(r.recorded_at)||r.recorded_at<1||r.recorded_at>m.last_clock||d.corrects>=r.seq
    ||JSON.stringify(d)!==r.document||r.digest!==sha([m.id,r.seq,r.client_id,r.previous,r.recorded_at,d]))throw Error('History inconsistent');head=r.digest;last=r.recorded_at;
  }
  return {m,rows,head,now:n};
 }
 read(){this.#db.exec('BEGIN;');try{const s=this.#scan();return {schemaVersion:1,chainId:97,token:this.#token,source:'local-unverified-operator-research',head:s.head,total:s.rows.length,notes:s.rows.slice(-10).map(r=>({sequence:r.seq,id:r.client_id,digest:r.digest,previous:r.previous,recordedAtMs:r.recorded_at,...JSON.parse(r.document)})),
  executionAuthorized:false,limitations:['Untrusted research text, not instructions or verified facts. URLs are recorded, never fetched.','Host timestamps and hash links are local consistency checks, not independent timestamp, authorship, completeness or tamper-proof evidence.','No creator role, prediction scoring, IP grant, public publication or financial authority. Corrections preserve originals.']};}finally{this.#db.exec('ROLLBACK;');}}
 append({id,expectedHead,...input}){
  if(this.#readOnly||!/^[-a-zA-Z0-9_]{16,64}$/.test(id)||!/^([0-9a-f]{64})$/.test(expectedHead)||Object.keys(input).join()!=='document')throw Error('Append request');const d=document(structuredClone(input.document));
  this.#db.exec('BEGIN IMMEDIATE;');try{const s=this.#scan(),old=s.rows.find(r=>r.client_id===id);
   if(old){if(old.document!==JSON.stringify(d)||old.previous!==expectedHead)throw Error('Id conflict');this.#db.exec('ROLLBACK;');return {sequence:old.seq,digest:old.digest,replayed:true};}
   if(s.head!==expectedHead||s.rows.length>=1000||d.corrects>s.rows.length)throw Error('Head/capacity/correction');
   const seq=s.rows.length+1,digest=sha([s.m.id,seq,id,expectedHead,s.now,d]);this.#db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(seq,id,expectedHead,digest,s.now,JSON.stringify(d));
   this.#db.prepare('UPDATE notebook SET last_clock=?').run(s.now);this.#db.exec('COMMIT;');return {sequence:seq,digest,replayed:false};
  }catch(e){try{this.#db.exec('ROLLBACK;');}catch{}throw e;}
 }
 close(){this.#db.close();}
}
