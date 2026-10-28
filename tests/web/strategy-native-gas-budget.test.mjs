import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { StrategyNativeGasBudget as Book } from '../../scripts/strategy-native-gas-budget.mjs';
import { fillMarketHash,readVerifiedFill } from '../../lib/arbitrage-receipts.ts';
import { market,receiptClient,TX,h,a,vaultMarket } from '../fixtures/arbitrage-receipts.mjs';
const policy=()=>({chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(market())],perTransactionWei:'100000',rollingDayWei:'150000'});
const fill=o=>readVerifiedFill([receiptClient(o),receiptClient(o)],market(),TX);
function setup(){const dir=mkdtempSync(join(tmpdir(),'fortune-gas-'));let now=100000;return {dir,path:join(dir,'gas.sqlite'),clock:()=>now,set:n=>{now=n;},clean:()=>rmSync(dir,{recursive:true,force:true})};}
test('durable policy-bound reservations never expire and exact capacity is enforced',()=>{
 const f=setup();let b;
 try{b=new Book(f.path,policy(),f.clock);assert.equal(b.reserve(TX,'100000').inserted,true);assert.equal(b.reserve(TX,'100000').inserted,false);assert.throws(()=>b.reserve(TX,'99999'),/conflict/);
 assert.equal(b.reserve(h(2),'50000').inserted,true);assert.throws(()=>b.reserve(h(3),'1'),/limit/);b.close();f.set(100000+86400000*3);b=new Book(f.path,policy(),f.clock);assert.equal(b.status().reservedWei,'150000');
 assert.throws(()=>b.reserve(h(3),'1'),/limit/);b.close();b=null;assert.throws(()=>new Book(f.path,{...policy(),rollingDayWei:'150001'}),/policy/);
 }finally{b?.close();f.clean();}
});
test('only fresh branded fills charge the bound payer and release unused ceiling, with persistent transaction deduplication',async()=>{
 const f=setup();let b;
 try{b=new Book(f.path,policy(),f.clock);b.reserve(TX,'100000');const verified=await fill();assert.throws(()=>b.charge({...verified}),/verified/);
 assert.equal(b.charge(verified).state,'charged');assert.equal(b.status().chargedRollingDayWei,'50000');assert.equal(b.status().reservedWei,'0');
 f.set(100001);assert.equal(b.charge(await fill()).inserted,false);b.close();b=new Book(f.path,policy(),f.clock);assert.equal(b.charge(await fill()).inserted,false);
 f.set(100000+86400000-1);assert.equal(b.status().chargedRollingDayWei,'50000');f.set(100000+86400000);assert.equal(b.status().chargedRollingDayWei,'0');
 assert.equal(b.reserve(TX,'100000').inserted,false);assert.equal(b.charge(await fill()).inserted,false);
 }finally{b?.close();f.clean();}
});
test('overrun and changed receipt evidence quarantine permanently and preserve conservative exposure',async()=>{
 for(const overrun of [true,false]){const f=setup();let b;
 try{b=new Book(f.path,policy(),f.clock);b.reserve(TX,overrun?'1':'100000');if(!overrun)b.charge(await fill());
 assert.equal(b.charge(await fill(overrun?{}:{blockHash:h(999)})).state,'quarantined');assert.equal(b.status().blocked,true);assert.equal(b.status().reservedWei,overrun?'50000':'100000');
 assert.throws(()=>b.reserve(h(3),'1'),/quarantined/);b.close();b=new Book(f.path,policy(),f.clock);assert.equal(b.status().blocked,true);assert.equal(b.charge(await fill()).state,'quarantined');
 const db=new DatabaseSync(f.path,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM gas_conflicts').get().n,1);db.close();
 }finally{b?.close();f.clean();}}
});
test('testnet strategy scope, integer bounds, payer, market and clock are fail closed',async()=>{
 const f=setup();let b;
 try{for(const p of [{...policy(),chainId:56},{...policy(),fundingScope:'holder-rewards'},{...policy(),payer:a(0)},{...policy(),marketHashes:[]},{...policy(),perTransactionWei:'0'}])assert.throws(()=>new Book(f.path,p));
 b=new Book(f.path,policy(),f.clock);for(const n of ['0','01','-1','1e5',(1n<<128n).toString()])assert.throws(()=>b.reserve(TX,n));
 assert.throws(()=>b.charge({}),/verified/);
 b.reserve(TX,'100000');f.set(99999);assert.throws(()=>b.status(),/clock/);assert.throws(()=>b.reserve(h(4),'1'),/clock/);f.set(100000);
 const wrong=new Book(join(f.dir,'wrong.sqlite'),{...policy(),payer:a(8)},f.clock);const verified=await fill();assert.throws(()=>wrong.charge(verified),/verified/);wrong.close();
 b.close();b=new Book(f.path,policy(),f.clock,{readOnly:true});assert.throws(()=>b.reserve(h(4),'1'),/Read-only/);assert.equal(b.status().reservedWei,'100000');
 }finally{b?.close();f.clean();}
});
test('vault mode charges actual operator instead of vault custody address',async()=>{
 const f=setup();let b;
 try{const m=vaultMarket(),v=await readVerifiedFill([receiptClient({vault:true}),receiptClient({vault:true})],m,TX);
 b=new Book(f.path,{...policy(),payer:a(7),marketHashes:[fillMarketHash(m)]},f.clock);b.reserve(TX,'100000');assert.equal(b.charge(v).state,'charged');
 }finally{b?.close();f.clean();}
});
test('two processes cannot race reservations past one shared cap',{timeout:20000},async()=>{
 const f=setup(),children=[];
 try{new Book(f.path,policy()).close();const worker=`import {StrategyNativeGasBudget as B} from './scripts/strategy-native-gas-budget.mjs';const b=new B(process.argv[1],JSON.parse(process.argv[2]));process.send('ready');process.once('message',()=>{let accepted=false;try{accepted=b.reserve(process.argv[3],'100000').inserted}catch{}b.close();process.send({accepted});process.disconnect()});`;
 for(let i=0;i<2;i++)children.push(spawn(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',worker,f.path,JSON.stringify(policy()),h(i+100)],{stdio:['ignore','ignore','pipe','ipc']}));
 await Promise.all(children.map(c=>once(c,'message')));const results=children.map(c=>once(c,'message')),exits=children.map(c=>once(c,'exit'));children.forEach(c=>c.send('go'));
 assert.deepEqual((await Promise.all(results)).map(([r])=>r.accepted).sort(),[false,true]);assert.ok((await Promise.all(exits)).every(([code])=>code===0));
 }finally{children.forEach(c=>c.kill());f.clean();}
});
test('stale and future branded evidence cannot charge; full retained history cannot be silently reset',async()=>{
 const f=setup();let b;const original=Date.now;
 try{b=new Book(f.path,policy(),f.clock);b.reserve(TX,'100000');const v=await fill();
 Date.now=()=>v.observedAtMs+60001;assert.throws(()=>b.charge(v),/verified/);Date.now=()=>v.observedAtMs-1;assert.throws(()=>b.charge(v),/verified/);Date.now=original;
 assert.equal(b.status().reservedWei,'100000');
 const db=new DatabaseSync(f.path);db.exec('BEGIN');const insert=db.prepare("INSERT INTO gas_entries VALUES(?,'1','reserved',NULL,NULL,NULL)");for(let i=0;i<9999;i++)insert.run(h(1000+i));db.exec('COMMIT');db.close();
 assert.equal(b.status().retainedEntries,10000);assert.equal(b.status().healthy,false);assert.throws(()=>b.reserve(h(100000),'1'),/limit/);
 }finally{Date.now=original;b?.close();f.clean();}
});
