import { hashTypedData } from 'viem';
import { DatabaseSync } from 'node:sqlite';
import { constants, openSync, closeSync, lstatSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { canonPolicy, canonTypedData, canonUpdate, verifyCreatorCanon, ZERO_CANON_DIGEST } from '../lib/creator-canon-authorization.ts';
import { characterDraft } from '../lib/creator-character.ts';

const schema = `CREATE TABLE canon_policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,policy TEXT NOT NULL,registry_id TEXT NOT NULL,last_clock INTEGER NOT NULL);
CREATE TABLE canon_versions(revision INTEGER PRIMARY KEY,digest TEXT NOT NULL UNIQUE,update_json TEXT NOT NULL,signature TEXT NOT NULL,evidence_json TEXT NOT NULL,accepted_at INTEGER NOT NULL);`;
function clock(n) { if(!Number.isSafeInteger(n)||n<1) throw Error('Invalid host clock'); return n; }
function regular(path) { const s=lstatSync(path); if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1) throw Error('Protected regular registry required'); return s; }
/** Trusted POSIX single-host storage; explicit create only, never initializes an import target. */
export class CreatorCanonRegistry {
  #db; #policy; #id; #now; #readOnly; #busy=false;
  static initialize(path,policy,now=Date.now()) {
    const p=canonPolicy(policy);clock(now);
    const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);
    const db=new DatabaseSync(path);try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');db.exec(schema);
      db.prepare('INSERT INTO canon_policy VALUES(1,1,?,?,?)').run(JSON.stringify(p),'0x'+randomBytes(32).toString('hex'),now);db.exec('COMMIT;');
    }finally{db.close();}
  }
  constructor(path,policy,{readOnly=false,now=Date.now}={}) {
    this.#policy=canonPolicy(policy);this.#now=now;this.#readOnly=readOnly;const original=regular(path);
    this.#db=new DatabaseSync(path,{readOnly});
    try {
      const after=regular(path);if(after.ino!==original.ino||after.dev!==original.dev) throw Error('Registry replaced');
      this.#db.exec('PRAGMA busy_timeout=5000;');if(!readOnly)this.#db.exec('PRAGMA synchronous=FULL;');
      if(this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Registry damaged');
      const tables=this.#db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
      if(tables.length!==2||tables.some((t,i)=>t.sql!==schema.split(';').filter(x=>x.trim())[i].trim()))throw Error('Incompatible registry');
      const row=this.#db.prepare('SELECT * FROM canon_policy').all();
      if(row.length!==1||row[0].singleton!==1||row[0].version!==1||row[0].policy!==JSON.stringify(this.#policy)
        ||!/^0x[0-9a-f]{64}$/.test(row[0].registry_id)||row[0].registry_id===ZERO_CANON_DIGEST)throw Error('Registry policy differs');
      this.#id=row[0].registry_id;
      const count=this.#db.prepare('SELECT count(*) AS n, max(revision) AS last FROM canon_versions').get();
      if(count.n>1000||(count.n&&count.n!==count.last))throw Error('Inconsistent version history');
      this.#checkClock();
    }catch(e){this.#db.close();throw e;}
  }
  #checkClock(){const n=clock(this.#now());if(n<this.#db.prepare('SELECT last_clock FROM canon_policy').get().last_clock)throw Error('Clock moved backwards');return n;}
  #head(){return this.#db.prepare('SELECT revision,digest FROM canon_versions ORDER BY revision DESC LIMIT 1').get()||{revision:0,digest:ZERO_CANON_DIGEST};}
  prepare(fields){
    const n=this.#checkClock(),head=this.#head();
    const update=canonUpdate({version:1,token:this.#policy.token,revision:head.revision+1,previousDigest:head.digest,issuedAtMs:n,expiresAtMs:n+300000,fields:characterDraft(this.#policy.token,fields).fields});
    return {update,typedData:canonTypedData(this.#policy,this.#id,update)};
  }
  latest(){this.#checkClock();const row=this.#db.prepare('SELECT * FROM canon_versions ORDER BY revision DESC LIMIT 1').get();
    if(row){const v=canonUpdate(JSON.parse(row.update_json));if(hashTypedData(canonTypedData(this.#policy,this.#id,v))!==row.digest)throw Error('Stored profile digest differs');}
    return row?{update:JSON.parse(row.update_json),digest:row.digest,signature:row.signature,evidence:JSON.parse(row.evidence_json),acceptedAtMs:row.accepted_at,
      provenance:'historical-creator-authorization-observation',currentAuthorization:null,executionAuthorized:false}:null;
  }
  async accept(envelope,clients){
    if(this.#readOnly||this.#busy)throw Error('Registry cannot accept now');this.#busy=true;
    try {
      if(!envelope||Object.keys(envelope).sort().join()!=='signature,update')throw Error('Exact signed update required');
      // Detach all caller-controlled data before asynchronous verification.
      const v=canonUpdate(structuredClone(envelope.update)),signature=envelope.signature;
      this.#checkClock();const head=this.#head();if(v.revision!==head.revision+1||v.previousDigest!==head.digest)throw Error('Revision conflicts');
      const evidence=await verifyCreatorCanon(clients,this.#policy,this.#id,v,signature,this.#now);
      this.#db.exec('BEGIN IMMEDIATE;');
      try {
        const n=this.#checkClock(),current=this.#head();
        if(n<evidence.observedAtMs||n-evidence.observedAtMs>5000||n>=v.expiresAtMs||v.revision!==current.revision+1||v.previousDigest!==current.digest)throw Error('Authorization/revision changed');
        this.#db.prepare('INSERT INTO canon_versions VALUES(?,?,?,?,?,?)').run(v.revision,evidence.digest,JSON.stringify(v),signature,JSON.stringify(evidence),n);
        this.#db.prepare('UPDATE canon_policy SET last_clock=? WHERE singleton=1').run(n);this.#db.exec('COMMIT;');
      }catch(e){this.#db.exec('ROLLBACK;');throw e;}
      return {revision:v.revision,digest:evidence.digest,executionAuthorized:false};
    }finally{this.#busy=false;}
  }
  close(){if(this.#busy)throw Error('Verification in progress');this.#db.close();}
}
