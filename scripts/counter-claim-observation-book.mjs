// Local historical observations, never financial settlement or execution authority.
import {DatabaseSync} from 'node:sqlite';
import {constants,openSync,closeSync,lstatSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {inspectCounterBatchClaimReceipt} from '../lib/counter-batch-claim-receipt.ts';
const LIMIT=64,MAX_BYTES=98304;
const SCHEMA=[
 'CREATE TABLE claim_book(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,book_id TEXT NOT NULL,policy TEXT NOT NULL,last_clock INTEGER NOT NULL,blocked INTEGER NOT NULL)',
 'CREATE TABLE claim_observations(sequence INTEGER PRIMARY KEY,transaction_hash TEXT NOT NULL UNIQUE,previous TEXT NOT NULL,digest TEXT NOT NULL UNIQUE,recorded_at INTEGER NOT NULL,observed_at INTEGER NOT NULL,document TEXT NOT NULL)',
 'CREATE TABLE claim_receipts(evidence_id TEXT PRIMARY KEY,round_id TEXT NOT NULL UNIQUE,sequence INTEGER NOT NULL)',
];
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const time=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid observation clock');return v;};
const operationClock=now=>{let last=time(now());return()=>{const current=time(now());if(current<last)throw Error('Observation clock moved backwards');last=current;return current;};};
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0+$/.test(v);
const hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&!/^0x0+$/.test(v);
const exact=(v,keys)=>{if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).sort().join()!==[...keys].sort().join()||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d)))throw Error('Literal observation fields required');};
const POLICY=['chainId','escrow','escrowCodeHash','governor','guardian','launchToken','launchTokenCodeHash','recipient'];
function policy(v){exact(v,POLICY);if(v.chainId!==97||![v.escrowCodeHash,v.launchTokenCodeHash].every(hash)||!['escrow','governor','guardian','launchToken','recipient'].every(k=>address(v[k]))||v.governor===v.guardian||new Set([v.escrow,v.launchToken,v.recipient]).size!==3)throw Error('Invalid observation policy');return Object.fromEntries(POLICY.map(k=>[k,v[k]]));}
function bind(input,p){exact(input,[...POLICY,'caller','transactionHash','claims']);if(POLICY.some(k=>input[k]!==p[k])||!address(input.caller)||input.caller===p.escrow||!hash(input.transactionHash)||!Array.isArray(input.claims)||input.claims.length<1||input.claims.length>32)throw Error('Foreign claim policy');}
function literal(v,depth=0){
 if(depth>8)throw Error('Observation input depth');
 if(typeof v==='string'||typeof v==='boolean'||v===null)return v;
 if(typeof v==='number'&&Number.isSafeInteger(v))return v;
 if(Array.isArray(v)){if(v.length>32||Reflect.ownKeys(v).length!==v.length+1)throw Error('Dense bounded observation list required');return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,i);if(!d||!('value'in d))throw Error('Literal observation list required');return literal(d.value,depth+1);});}
 if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Literal observation input required');
 const out={};for(const k of Reflect.ownKeys(v).sort()){const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!('value'in d))throw Error('Literal observation input required');Object.defineProperty(out,k,{value:literal(d.value,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
const CLAIM=['round','asset','amount','roundFunded','roundRemainingAtBlock','allocationHash','claimLogIndex','evidenceId'];
const positive=v=>typeof v==='string'&&/^[1-9][0-9]{0,77}$/.test(v)&&BigInt(v)<1n<<256n;
const quantity=v=>v==='0'||positive(v);
function document(input,observation,p){
 bind(input,p);
 const d={policy:literal(input),observation:{chainId:observation.chainId,escrow:observation.escrow,recipient:observation.recipient,caller:observation.caller,transactionHash:observation.transactionHash,blockNumber:observation.blockNumber,blockHash:observation.blockHash,blockTimestamp:observation.blockTimestamp,receiptConsistencyDigest:observation.receiptConsistencyDigest,claims:observation.claims.map(x=>Object.fromEntries(CLAIM.map(k=>[k,x[k]])))}};
 const o=d.observation;if(o.chainId!==97||o.escrow!==p.escrow||o.recipient!==p.recipient||o.caller!==input.caller||o.transactionHash!==input.transactionHash||!hash(o.receiptConsistencyDigest)||!hash(o.blockHash)||!positive(o.blockNumber)||BigInt(o.blockNumber)>=1n<<64n||!quantity(o.blockTimestamp)||o.claims.length!==input.claims.length)throw Error('Invalid claim observation');
 const ids=new Set(),assets=new Map();let previous=0n,index=-1;
 for(const [i,x]of o.claims.entries()){
  const q=input.claims[i];exact(q,['round','asset','assetCodeHash','amount']);
  if(!positive(q.round)||BigInt(q.round)<=previous||!positive(q.amount)||!address(q.asset)||[p.escrow,p.launchToken,p.recipient].includes(q.asset)||!hash(q.assetCodeHash)||(assets.has(q.asset)&&assets.get(q.asset)!==q.assetCodeHash))throw Error('Invalid round policy');
  if(x.round!==q.round||x.asset!==q.asset||x.amount!==q.amount||!positive(x.roundFunded)||BigInt(x.roundFunded)<BigInt(x.amount)||!quantity(x.roundRemainingAtBlock)||BigInt(x.roundRemainingAtBlock)>BigInt(x.roundFunded)-BigInt(x.amount)||!hash(x.allocationHash)||!Number.isSafeInteger(x.claimLogIndex)||x.claimLogIndex<1||x.claimLogIndex>99999999||(i&&x.claimLogIndex!==index+2)||x.evidenceId!==`97:${p.escrow}:${o.transactionHash}:${x.claimLogIndex}`||ids.has(x.evidenceId))throw Error('Invalid round observation');
  assets.set(q.asset,q.assetCodeHash);ids.add(x.evidenceId);previous=BigInt(q.round);index=x.claimLogIndex;
 }
 if(assets.size>10||Buffer.byteLength(JSON.stringify(d))>MAX_BYTES)throw Error('Observation document bound');return d;
}
function regular(path){if(typeof path!=='string'||!isAbsolute(path))throw Error('Absolute durable observation path required');const s=lstatSync(path);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0||s.size>16*1024*1024)throw Error('Protected observation file required');return s;}
const flags=()=>({source:'local-historical-counter-claim-observation-book',currentAuthorization:null,independentProvidersVerified:false,finalityVerified:false,capitalOriginVerified:false,prePostBalancesVerified:false,holderEligibilityVerified:false,feeFundingVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullCounterReadiness:false});
export class CounterClaimObservationBook{
 #db;#policy;#now;#readOnly;
 static initialize(path,input,{enabled=false,now=Date.now()}={}){
  if(enabled!==true)throw Error('Observation book disabled');if(typeof path!=='string'||!isAbsolute(path))throw Error('Absolute durable observation path required');const p=policy(input);time(now);
  const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd);const db=new DatabaseSync(path);
  try{db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');for(const sql of SCHEMA)db.exec(sql);db.prepare('INSERT INTO claim_book VALUES(1,1,?,?,?,0)').run(randomBytes(32).toString('hex'),JSON.stringify(p),now);db.exec('COMMIT;');}finally{db.close();}
 }
 constructor(path,input,{enabled=false,readOnly=true,now=Date.now}={}){
  if(enabled!==true)throw Error('Observation book disabled');if(typeof readOnly!=='boolean'||typeof now!=='function')throw Error('Literal observation options required');this.#policy=policy(input);this.#now=now;this.#readOnly=readOnly;
  const before=regular(path);this.#db=new DatabaseSync(path,{readOnly});try{const after=regular(path);if(before.ino!==after.ino||before.dev!==after.dev)throw Error('Observation file replaced');this.#db.exec('PRAGMA busy_timeout=5000;');if(!readOnly)this.#db.exec('PRAGMA synchronous=FULL;');const tables=this.#db.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();if(tables.length!==SCHEMA.length||tables.some((x,i)=>x.sql!==SCHEMA[i])||this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||this.#db.prepare('PRAGMA journal_mode').get().journal_mode!=='wal')throw Error('Observation schema differs');this.read();}catch(e){this.#db.close();throw e;}
 }
 #scan(now){
  const metas=this.#db.prepare('SELECT * FROM claim_book').all();if(metas.length!==1)throw Error('Observation metadata differs');const m=metas[0];if(m.singleton!==1||m.version!==1||!/^[0-9a-f]{64}$/.test(m.book_id)||m.policy!==JSON.stringify(this.#policy)||time(m.last_clock)>now||![0,1].includes(m.blocked))throw Error('Observation policy or clock differs');
  const count=this.#db.prepare('SELECT count(*) AS n,max(length(CAST(document AS BLOB))) AS bytes FROM claim_observations').get();if(count.n>LIMIT||count.bytes>MAX_BYTES||this.#db.prepare('SELECT count(*) AS n FROM claim_receipts').get().n>LIMIT*32)throw Error('Observation capacity');
  const rows=this.#db.prepare('SELECT * FROM claim_observations ORDER BY sequence').all();let head=sha([1,m.book_id,this.#policy]),last=0;const receipts=[];
  for(const [i,r]of rows.entries()){const parsed=JSON.parse(r.document);exact(parsed,['policy','observation']);const d=document(parsed.policy,parsed.observation,this.#policy);if(r.sequence!==i+1||r.transaction_hash!==d.observation.transactionHash||r.previous!==head||time(r.recorded_at)<last||r.recorded_at>m.last_clock||time(r.observed_at)>r.recorded_at||r.recorded_at-r.observed_at>5000||JSON.stringify(d)!==r.document||r.digest!==sha([1,m.book_id,this.#policy,r.sequence,r.previous,r.recorded_at,r.observed_at,d]))throw Error('Observation history differs');for(const x of d.observation.claims)receipts.push({evidence_id:x.evidenceId,round_id:x.round,sequence:r.sequence});head=r.digest;last=r.recorded_at;}
  receipts.sort((a,b)=>a.evidence_id<b.evidence_id?-1:a.evidence_id>b.evidence_id?1:0);if(JSON.stringify(receipts)!==JSON.stringify(this.#db.prepare('SELECT evidence_id,round_id,sequence FROM claim_receipts ORDER BY evidence_id').all()))throw Error('Observation index differs');return {m,rows,head};
 }
 #snapshot(clock){const now=clock();this.#db.exec('BEGIN;');try{const s=this.#scan(now);clock();return {schemaVersion:1,bookId:s.m.book_id,policy:{...this.#policy},head:s.head,total:s.rows.length,quarantined:s.m.blocked===1,entries:s.rows.map(r=>({sequence:r.sequence,previous:r.previous,digest:r.digest,recordedAtMs:r.recorded_at,readerObservedAtMs:r.observed_at,...JSON.parse(r.document)})),...flags()};}finally{this.#db.exec('ROLLBACK;');}}
 read(){return this.#snapshot(operationClock(this.#now));}
 async capture(clients,input,expectedHead){
  if(this.#readOnly)throw Error('Observation book is read-only');if(typeof expectedHead!=='string'||!/^[0-9a-f]{64}$/.test(expectedHead))throw Error('Expected observation head required');const inputs=literal(input);if(Buffer.byteLength(JSON.stringify(inputs))>65536)throw Error('Observation input bound');bind(inputs,this.#policy);
  const clock=operationClock(this.#now),first=this.#snapshot(clock),prior=first.entries.find(x=>x.observation.transactionHash===inputs.transactionHash);if(first.quarantined)throw Error('Observation book quarantined');if(prior?prior.previous!==expectedHead:first.head!==expectedHead||first.total>=LIMIT)throw Error('Observation head or capacity differs');
  const observed=await inspectCounterBatchClaimReceipt(clients,inputs);clock();const d=document(inputs,observed,this.#policy),payload=JSON.stringify(d);
  const fresh=()=>{const now=clock();if(!Number.isSafeInteger(observed.observedAtMs)||observed.observedAtMs<0||now<observed.observedAtMs||now-observed.observedAtMs>5000)throw Error('Observation commit expired');return now;};fresh();
  this.#db.exec('BEGIN IMMEDIATE;');try{
   const recorded=fresh(),s=this.#scan(recorded),old=s.rows.find(x=>x.transaction_hash===d.observation.transactionHash);fresh();if(s.m.blocked)throw Error('Observation book quarantined');
   if(old){if(old.previous!==expectedHead)throw Error('Observation retry head differs');if(old.document!==payload){this.#db.prepare('UPDATE claim_book SET blocked=1,last_clock=? WHERE singleton=1').run(fresh());fresh();this.#db.exec('COMMIT;');throw Error('Observation conflict quarantined');}fresh();this.#db.exec('ROLLBACK;');return {inserted:false,sequence:old.sequence,digest:old.digest,recordedAtMs:old.recorded_at,readerObservedAtMs:old.observed_at,...flags()};}
   if(s.head!==expectedHead||s.rows.length>=LIMIT)throw Error('Observation head or capacity differs');if(d.observation.claims.some(x=>s.rows.some(r=>JSON.parse(r.document).observation.claims.some(y=>y.round===x.round)))){this.#db.prepare('UPDATE claim_book SET blocked=1,last_clock=? WHERE singleton=1').run(fresh());fresh();this.#db.exec('COMMIT;');throw Error('Observation round conflict quarantined');}const sequence=s.rows.length+1,digest=sha([1,s.m.book_id,this.#policy,sequence,s.head,recorded,observed.observedAtMs,d]);
   this.#db.prepare('INSERT INTO claim_observations VALUES(?,?,?,?,?,?,?)').run(sequence,d.observation.transactionHash,s.head,digest,recorded,observed.observedAtMs,payload);for(const x of d.observation.claims)this.#db.prepare('INSERT INTO claim_receipts VALUES(?,?,?)').run(x.evidenceId,x.round,sequence);
   this.#db.prepare('UPDATE claim_book SET last_clock=? WHERE singleton=1').run(fresh());fresh();this.#db.exec('COMMIT;');return {inserted:true,sequence,digest,recordedAtMs:recorded,readerObservedAtMs:observed.observedAtMs,...flags()};
  }catch(e){try{this.#db.exec('ROLLBACK;');}catch{}throw e;}
 }
 close(){this.#db.close();}
}
