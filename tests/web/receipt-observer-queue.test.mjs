import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { ReceiptObservationQueue as Queue, observeNextReceipt } from "../../scripts/arbitrage-observer-queue.mjs";
import { ArbitrageFillJournal as Journal } from "../../scripts/arbitrage-fill-journal.mjs";
import { market, receiptClient, TX } from "../fixtures/arbitrage-receipts.mjs";
const clients = options => [receiptClient(options), receiptClient(options)];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fortune-queue-")); let now = 1000;
  return { dir, path: join(dir, "queue.sqlite"), journal: join(dir, "journal.sqlite"), clock: () => now, set: n => { now = n; }, clean: () => rmSync(dir, { recursive: true, force: true }) };
}
test("durable jobs bind policy, deduplicate across restarts and reject invalid inputs/clock rollback", () => {
  const f = setup(); let q;
  try {
    q = new Queue(f.path, market(), f.clock); assert.equal(q.enqueue(TX).inserted, true); q.close();
    q = new Queue(f.path, market(), f.clock); assert.equal(q.enqueue(TX.toUpperCase().replace('0X','0x')).inserted, false);
    assert.throws(() => q.enqueue('0x'+'0'.repeat(64))); assert.throws(() => q.enqueue('../secret'));
    f.set(999); assert.throws(() => q.claim(), /clock/); f.set(1000); assert.ok(q.claim()); q.close(); q = null;
    assert.throws(() => new Queue(f.path, { ...market(), confirmations: 21 }), /policy/);
    assert.throws(() => new Queue(':memory:', market()), /Durable/);
  } finally { q?.close(); f.clean(); }
});
test("crashed leases expire, replacement is fenced and stale completion cannot change it", () => {
  const f=setup(); let q;
  try {
    q=new Queue(f.path,market(),f.clock); q.enqueue(TX); const old=q.claim(); assert.equal(q.claim(),null);q.close();
    f.set(old.leaseUntil);q=new Queue(f.path,market(),f.clock);const fresh=q.claim();assert.equal(fresh.attempt,2);
    assert.notEqual(old.fence,fresh.fence);assert.throws(()=>q.complete(old),/superseded/);assert.equal(q.complete(fresh).state,'done');
    assert.equal(q.enqueue(TX).inserted,false);assert.equal(q.claim(),null);assert.deepEqual(q.stats(),{pending:0,leased:0,done:1,exhausted:0});
  } finally {q?.close();f.clean();}
});
test("verification failures retry with backoff, exhaust at five attempts and never reset on restart", async () => {
  const f=setup();let q,j;
  try {
    q=new Queue(f.path,market(),f.clock);j=new Journal(f.journal,market());q.enqueue(TX);
    for(let i=1;i<=5;i++) {
      const result=await observeNextReceipt(q,j,clients({ unavailable:true }));assert.equal(result.state,i===5?'exhausted':'pending');
      assert.equal(q.claim(),null);q.close();f.set(1000+i*120_000);q=new Queue(f.path,market(),f.clock);
    }
    assert.equal(q.stats().exhausted,1);assert.equal(q.enqueue(TX).inserted,false);assert.equal(q.claim(),null);assert.equal(j.list().length,0);
  } finally {q?.close();j?.close();f.clean();}
});
test("journal-before-completion crash replays idempotently and mismatched policy fails before claim", async () => {
  const f=setup();let q,j;
  try {
    q=new Queue(f.path,market(),f.clock);j=new Journal(f.journal,market());q.enqueue(TX);
    const wrong=new Journal(join(f.dir,'wrong.sqlite'),{...market(),confirmations:21});
    await assert.rejects(observeNextReceipt(q,wrong,clients()),/policy/);wrong.close();assert.equal(q.stats().pending,1);
    const lease=q.claim();await j.refresh(clients(),lease.tx);q.close();j.close();
    f.set(lease.leaseUntil);q=new Queue(f.path,market(),f.clock);j=new Journal(f.journal,market());
    assert.equal((await observeNextReceipt(q,j,clients())).state,'done');assert.equal(j.list().length,1);
    assert.equal((await observeNextReceipt(q,j,clients())).state,'idle');
  } finally {q?.close();j?.close();f.clean();}
});
test("failed rechecks retain journal quarantine through queued retries",async()=>{
  const f=setup();let q,j;
  try{q=new Queue(f.path,market(),f.clock);j=new Journal(f.journal,market());await j.refresh(clients(),TX);q.enqueue(TX);
    await observeNextReceipt(q,j,clients({unavailable:true}));assert.equal(j.list()[0].state,'quarantined');
    f.set(200000);assert.equal((await observeNextReceipt(q,j,clients())).state,'pending');assert.equal(j.list()[0].state,'quarantined');
  }finally{q?.close();j?.close();f.clean();}
});
test("two independent processes can claim only one active lease",{timeout:20000},async()=>{
  const f=setup(),children=[];
  try{
    const q=new Queue(f.path,market());q.enqueue(TX);q.close();
    const worker=`import {ReceiptObservationQueue as Q} from './scripts/arbitrage-observer-queue.mjs';import {market} from './tests/fixtures/arbitrage-receipts.mjs';const q=new Q(process.argv[1],market());process.send('ready');process.once('message',()=>{const l=q.claim();q.close();process.send({claimed:!!l});process.disconnect()});`;
    for(let i=0;i<2;i++)children.push(spawn(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',worker,f.path],{stdio:['ignore','ignore','pipe','ipc']}));
    await Promise.all(children.map(c=>once(c,'message')));const results=children.map(c=>once(c,'message')),exits=children.map(c=>once(c,'exit'));children.forEach(c=>c.send('go'));
    assert.deepEqual((await Promise.all(results)).map(([r])=>r.claimed).sort(),[false,true]);assert.ok((await Promise.all(exits)).every(([c])=>c===0));
  }finally{children.forEach(c=>c.kill());f.clean();}
});
test("operator CLI persists enqueue/status and hides provider/path failures",()=>{
  const f=setup();
  try{
    const manifest=join(f.dir,'market.json');writeFileSync(manifest,JSON.stringify(market()));
    const run=(action,extra=[])=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/run-receipt-observer.mjs',manifest,f.path,f.journal,action,...extra],{encoding:'utf8',env:{...process.env,FORTUNE_ARBITRAGE_READ_RPC_URL:'https://secret-provider.invalid/private-key'}});
    let r=run('enqueue',[TX]);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).inserted,true);
    r=run('status');assert.equal(JSON.parse(r.stdout).pending,1);
    r=run('once');assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/secret-provider|private-key|market.json|queue.sqlite/);
  }finally{f.clean();}
});
test("five abandoned claims exhaust persistently, including at the exact lease boundary",()=>{
  const f=setup();let q;
  try{
    q=new Queue(f.path,market(),f.clock);q.enqueue(TX);let last;
    for(let attempt=1;attempt<=5;attempt++){
      last=q.claim();assert.equal(last.attempt,attempt);f.set(last.leaseUntil);
      assert.throws(()=>q.complete(last),/expired/);q.close();q=new Queue(f.path,market(),f.clock);
    }
    assert.equal(q.claim(),null);assert.equal(q.stats().exhausted,1);q.close();q=new Queue(f.path,market(),f.clock);
    assert.equal(q.claim(),null);assert.equal(q.enqueue(TX).inserted,false);
  }finally{q?.close();f.clean();}
});
