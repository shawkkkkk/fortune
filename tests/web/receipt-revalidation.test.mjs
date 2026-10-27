import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { ArbitrageFillJournal as Journal } from "../../scripts/arbitrage-fill-journal.mjs";
import { revalidateFillBatch } from "../../scripts/revalidate-arbitrage-fills.mjs";
import { market, receiptClient, TX, h } from "../fixtures/arbitrage-receipts.mjs";
const clients = options => [receiptClient(options), receiptClient(options)];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fortune-revalidate-")), path = join(dir, 'journal.sqlite');
  return { dir, path, journal: new Journal(path, market()), age(ms=600_000) { const db=new DatabaseSync(path); db.prepare('UPDATE fills SET observed_at_ms=?').run(Date.now()-ms);db.close(); }, clean(){rmSync(dir,{recursive:true,force:true});} };
}
test('revalidation refreshes aged evidence, persists freshness and does not recheck fresh rows',async()=>{
  const f=setup();let j=f.journal;
  try{
    await j.refresh(clients(),TX);f.age();assert.equal(j.dueForRevalidation(Date.now()).length,1);
    const r=await revalidateFillBatch(j,clients());assert.equal(r.refreshed,1);assert.equal(r.healthy,true);assert.equal(r.executionAuthorized,false);
    j.close();j=new Journal(f.path,market());assert.equal(j.dueForRevalidation(Date.now()).length,0);
    assert.equal((await revalidateFillBatch(j,clients({unavailable:true}))).selected,0);
  }finally{j.close();f.clean();}
});
test('failed and changed rechecks quarantine persistently and never automatically restore trust',async()=>{
  for(const options of [{unavailable:true},{blockHash:h(900)}]){
    const f=setup();let j=f.journal;
    try{await j.refresh(clients(),TX);f.age();const r=await revalidateFillBatch(j,clients(options));
      assert.equal(r.failed,1);assert.equal(r.quarantined,1);assert.equal(r.healthy,false);j.close();j=new Journal(f.path,market());
      assert.equal((await revalidateFillBatch(j,clients())).healthy,false);assert.equal(j.list()[0].state,'quarantined');
    }finally{j.close();f.clean();}
  }
});
test('a changed swap log identity quarantines the original transaction without inserting a trusted replacement',async()=>{
  const f=setup(),j=f.journal;
  try{
    await j.refresh(clients(),TX);f.age();
    const moved=clients().map(c=>({...c,async getTransactionReceipt(){const r=await c.getTransactionReceipt();r.logs[2].logIndex=7;return r;}}));
    const r=await revalidateFillBatch(j,moved);assert.equal(r.failed,1);assert.equal(j.list().length,1);
    assert.equal(j.list()[0].state,'quarantined');assert.equal(j.conflicts()[0].swapLogIndex,7);
    await assert.rejects(j.refresh(clients(),TX),/quarantined/);
  }finally{j.close();f.clean();}
});
test('bounded oldest-first selection drains beyond a batch and exact cutoff is eligible',async()=>{
  const f=setup(),j=f.journal;
  try{
    await j.refresh(clients(),TX);
    const db=new DatabaseSync(f.path),row=db.prepare('SELECT * FROM fills').get(),now=Date.now();
    for(let i=1;i<=12;i++){
      const tx=h(1000+i),payload=JSON.parse(row.payload);payload.transactionHash=tx;payload.receiptId=`97:${tx}:2`;
      db.prepare('INSERT INTO fills VALUES(?,?,?,?,?)').run(payload.receiptId,JSON.stringify(payload),row.block_hash,now-300_000-i,'observed');
    }
    db.prepare('UPDATE fills SET observed_at_ms=? WHERE receipt_id=?').run(now-300_000,`97:${TX}:2`);db.close();
    assert.equal(j.dueForRevalidation(now,300_000,100).length,13);
    // These fixture-only synthetic IDs are deliberately not accepted by the real verifier.
    const first=await revalidateFillBatch(j,clients(),{limit:10});assert.equal(first.selected,10);assert.equal(first.remainingDue,3);assert.equal(first.healthy,false);
    const next=await revalidateFillBatch(j,clients(),{limit:10});assert.equal(next.selected,3);assert.equal(next.refreshed,1);assert.equal(next.quarantined,12);
  }finally{j.close();f.clean();}
});
test('invalid bounds and future observations fail before any provider request',async()=>{
  const f=setup(),j=f.journal;
  try{
    for(const args of [[-1],[Date.now(),999],[Date.now(),86_400_001],[Date.now(),1000,101],[NaN]])assert.throws(()=>j.dueForRevalidation(...args));
    await j.refresh(clients(),TX);f.age(-10000);
    await assert.rejects(revalidateFillBatch(j,clients({unavailable:true})),/clock/);
    assert.equal(j.list()[0].state,'observed');
  }finally{j.close();f.clean();}
});
test('operator CLI refuses missing or uninitialized journals and hides private details',()=>{
  const f=setup();f.journal.close();
  try{
    const manifest=join(f.dir,'policy.json');writeFileSync(manifest,JSON.stringify(market()));
    for(const path of [join(f.dir,'missing.sqlite'),join(f.dir,'empty.sqlite')]){
      if(path.includes('empty'))writeFileSync(path,'');
      const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/run-fill-revalidation.mjs',manifest,path],{encoding:'utf8',env:{...process.env,FORTUNE_ARBITRAGE_READ_RPC_URL:'https://private.invalid/key'}});
      assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/private.invalid|policy.json|missing.sqlite|empty.sqlite/);
      if(path.includes('missing'))assert.equal(existsSync(path),false);else {const db=new DatabaseSync(path,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM sqlite_master').get().n,0);db.close();}
    }
  }finally{f.clean();}
});
