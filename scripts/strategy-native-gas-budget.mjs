import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { isVerifiedFill, fillMarketHash } from '../lib/arbitrage-receipts.ts';
const DAY=86_400_000, MAX=(1n<<128n)-1n;
const hash=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x)&&!/^0x0{64}$/i.test(x);
function amount(x){if(typeof x!=='string'||!/^[1-9][0-9]{0,38}$/.test(x)||BigInt(x)>MAX)throw Error('Bounded native-wei amount required');return BigInt(x);}
function policy(input){
  const p=structuredClone(input);
  if(p.chainId!==97||p.fundingScope!=='strategy-native-gas'||typeof p.payer!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(p.payer)||/^0x0{40}$/i.test(p.payer)
    ||!Array.isArray(p.marketHashes)||p.marketHashes.length<1||p.marketHashes.length>16||p.marketHashes.some(h=>!hash(h)))throw Error('Reviewed strategy-only testnet gas policy required');
  p.payer=p.payer.toLowerCase();p.marketHashes=p.marketHashes.map(x=>x.toLowerCase()).sort();
  if(new Set(p.marketHashes).size!==p.marketHashes.length||amount(p.perTransactionWei)>amount(p.rollingDayWei))throw Error('Invalid native gas limits');
  return {chainId:97,fundingScope:p.fundingScope,payer:p.payer,marketHashes:p.marketHashes,perTransactionWei:p.perTransactionWei,rollingDayWei:p.rollingDayWei};
}
/** Trusted single-host scheduling/accounting only; never a wallet permission. */
export class StrategyNativeGasBudget {
  #db;#policy;#clock;#readOnly;
  constructor(path, reviewedPolicy, clock=Date.now, {readOnly=false}={}){
    if(typeof path!=='string'||!path||path===':memory:')throw Error('Durable budget file required');
    this.#policy=policy(reviewedPolicy);this.#clock=clock;this.#readOnly=readOnly;
    const digest=createHash('sha256').update(JSON.stringify(this.#policy)).digest('hex');
    this.#db=new DatabaseSync(path,{readOnly});
    try{
      this.#db.exec(readOnly?'PRAGMA busy_timeout=5000; BEGIN;':'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;');
      if(!readOnly)this.#db.exec(`CREATE TABLE IF NOT EXISTS gas_policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,digest TEXT NOT NULL,last_clock INTEGER NOT NULL,blocked INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS gas_entries(tx TEXT PRIMARY KEY,ceiling TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','charged','quarantined')),cost TEXT,charged_at INTEGER,evidence TEXT);
        CREATE TABLE IF NOT EXISTS gas_conflicts(tx TEXT NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(tx,evidence));
        CREATE TABLE IF NOT EXISTS gas_recheck_holds(tx TEXT PRIMARY KEY,fence TEXT NOT NULL);`);
      const row=this.#db.prepare('SELECT * FROM gas_policy WHERE singleton=1').get();
      if((readOnly&&!row)||(row&&(row.version!==2||row.digest!==digest)))throw Error('Budget policy differs; no silent migration');
      if(!row)this.#db.prepare('INSERT INTO gas_policy VALUES(1,2,?,0,0)').run(digest);
      this.#db.exec('COMMIT');
    }catch(e){try{this.#db.exec('ROLLBACK');}catch{}this.#db.close();throw e;}
  }
  #time(){const n=this.#clock(),row=this.#db.prepare('SELECT * FROM gas_policy').get();if(!Number.isSafeInteger(n)||n<row.last_clock||n<0)throw Error('Budget host clock invalid or reversed');const pending=this.#db.prepare('SELECT count(*) AS n FROM gas_recheck_holds').get().n;return {now:n,blocked:row.blocked===1||pending>0,pending};}
  #totals(now){let reserved=0n,charged=0n,count=0;for(const r of this.#db.prepare('SELECT e.*,EXISTS(SELECT 1 FROM gas_recheck_holds h WHERE h.tx=e.tx) AS held FROM gas_entries e').all()){
    count++;if(r.state!=='charged'||r.held){const c=BigInt(r.cost??'0');reserved+=c>BigInt(r.ceiling)?c:BigInt(r.ceiling);}else if(r.charged_at>now-DAY)charged+=BigInt(r.cost);
  }return {reserved,charged,count};}
  #mutate(fn){if(this.#readOnly)throw Error('Read-only budget');this.#db.exec('BEGIN IMMEDIATE');try{const t=this.#time();const r=fn(t);this.#db.prepare('UPDATE gas_policy SET last_clock=?').run(t.now);this.#db.exec('COMMIT');return r;}catch(e){try{this.#db.exec('ROLLBACK');}catch{}throw e;}}
  reserve(tx, maximumNativeWei){
    if(!hash(tx))throw Error('Transaction hash required');tx=tx.toLowerCase();const ceiling=amount(maximumNativeWei);
    return this.#mutate(({now,blocked})=>{
      if(blocked)throw Error('Budget permanently quarantined');
      const existing=this.#db.prepare('SELECT * FROM gas_entries WHERE tx=?').get(tx);
      if(existing){if(existing.ceiling!==maximumNativeWei)throw Error('Reservation conflicts');return {inserted:false,state:existing.state,executionAuthorized:false};}
      const t=this.#totals(now);
      if(t.count>=10000||ceiling>amount(this.#policy.perTransactionWei)||t.reserved+t.charged+ceiling>amount(this.#policy.rollingDayWei))throw Error('Native gas exposure limit exceeded');
      this.#db.prepare("INSERT INTO gas_entries VALUES(?,?,'reserved',NULL,NULL,NULL)").run(tx,maximumNativeWei);
      return {inserted:true,state:'reserved',executionAuthorized:false};
    });
  }
  beginRecheck(tx, market){
    if(!hash(tx)||!this.#policy.marketHashes.includes(fillMarketHash(market).toLowerCase())
      ||market.chainId!==97||(market.vault?.operator??market.wallet).toLowerCase()!==this.#policy.payer)throw Error('Recheck policy differs');
    tx=tx.toLowerCase();
    return this.#mutate(()=>{
      const r=this.#db.prepare('SELECT * FROM gas_entries WHERE tx=?').get(tx);
      if(!r||r.state==='quarantined')throw Error('Active known reservation required');
      const fence=randomUUID();
      this.#db.prepare('INSERT INTO gas_recheck_holds VALUES(?,?)').run(tx,fence);
      return Object.freeze({tx,fence,executionAuthorized:false});
    });
  }
  quarantineRecheck(hold){
    return this.#mutate(()=>{
      this.#requireFence(hold);
      this.#db.prepare("UPDATE gas_entries SET state='quarantined' WHERE tx=?").run(hold.tx);
      this.#db.prepare('UPDATE gas_policy SET blocked=1').run();
      return {state:'quarantined',executionAuthorized:false};
    });
  }
  #requireFence(hold){
    if(!hold||!hash(hold.tx)||typeof hold.fence!=='string'||this.#db.prepare('SELECT fence FROM gas_recheck_holds WHERE tx=?').get(hold.tx)?.fence!==hold.fence)throw Error('Recheck fence differs');
  }
  charge(fill, hold){
    const now=Date.now();
    if(!isVerifiedFill(fill)||fill.chainId!==97||!this.#policy.marketHashes.includes(fill.marketHash.toLowerCase())
      ||(fill.gasPayer??fill.wallet).toLowerCase()!==this.#policy.payer||!Number.isSafeInteger(fill.observedAtMs)||fill.observedAtMs>now||now-fill.observedAtMs>60000)throw Error('Fresh verified fill for reviewed gas payer required');
    const cost=amount(fill.nativeGasCost),tx=fill.transactionHash.toLowerCase();
    const evidence=JSON.stringify({receiptId:fill.receiptId,receiptDigest:fill.receiptDigest,blockHash:fill.blockHash,cost:fill.nativeGasCost,marketHash:fill.marketHash});
    return this.#mutate(({now})=>{
      const pending=this.#db.prepare('SELECT 1 FROM gas_recheck_holds WHERE tx=?').get(tx);
      if(pending||hold){this.#requireFence(hold);if(hold.tx!==tx)throw Error('Recheck transaction differs');}
      const r=this.#db.prepare('SELECT * FROM gas_entries WHERE tx=?').get(tx);
      if(!r)throw Error('Existing reservation required');
      if(r.state==='quarantined')return {state:'quarantined',executionAuthorized:false};
      if(r.state==='charged'&&r.evidence===evidence){if(hold)this.#db.prepare('DELETE FROM gas_recheck_holds WHERE tx=? AND fence=?').run(tx,hold.fence);return {state:'charged',inserted:false,executionAuthorized:false};}
      if(r.state==='charged'||cost>BigInt(r.ceiling)){
        this.#db.prepare('INSERT OR IGNORE INTO gas_conflicts VALUES(?,?)').run(tx,evidence);
        const conservativeCost=cost>BigInt(r.cost??'0')?cost:BigInt(r.cost);
        this.#db.prepare("UPDATE gas_entries SET state='quarantined',cost=? WHERE tx=?").run(conservativeCost.toString(),tx);
        this.#db.prepare('UPDATE gas_policy SET blocked=1').run();
        return {state:'quarantined',executionAuthorized:false};
      }
      this.#db.prepare("UPDATE gas_entries SET state='charged',cost=?,charged_at=?,evidence=? WHERE tx=?").run(cost.toString(),now,evidence,tx);
      if(hold)this.#db.prepare('DELETE FROM gas_recheck_holds WHERE tx=? AND fence=?').run(tx,hold.fence);
      return {state:'charged',inserted:true,executionAuthorized:false};
    });
  }
  status(){
    this.#db.exec('BEGIN');try{
      const {now,blocked,pending}=this.#time(),t=this.#totals(now),limit=amount(this.#policy.rollingDayWei),used=t.reserved+t.charged;
      const result={scope:'local-strategy-native-gas-book',chainId:97,payer:this.#policy.payer,denomination:'native-wei',reservedWei:t.reserved.toString(),chargedRollingDayWei:t.charged.toString(),remainingWei:(used<limit?limit-used:0n).toString(),retainedEntries:t.count,pendingRechecks:pending,blocked,healthy:!blocked&&t.count<10000,executionAuthorized:false,profitAllocated:false};
      this.#db.exec('COMMIT');return Object.freeze(result);
    }catch(e){this.#db.exec('ROLLBACK');throw e;}
  }
  close(){this.#db.close();}
}
