import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {CreatorCanonRegistry as Registry} from '../../scripts/creator-canon-registry.mjs';
import {emptyCharacter} from '../../lib/creator-character.ts';
import {policy,signature,creatorFor,client,now} from '../fixtures/creator-canon.mjs';
const fields={...emptyCharacter,name:'Fixture character'};
async function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'fortune-canon-uri-')),cwd=process.cwd();
 try{process.chdir(dir);await run(dir);}finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
}
async function accept(book){
 const prepared=book.prepare(fields),creator=await creatorFor(prepared);
 await book.accept({update:prepared.update,signature},[client(creator),client(creator)]);
 return book.latest();
}
test('creator registry rejects URI initialization before creating a literal file',async()=>{
 for(const prefix of ['file:','FiLe:'])for(const query of ['?mode=memory&cache=shared','?mode=rwc']){
  await fixture(async dir=>{const uri=prefix+basename(dir)+'.sqlite'+query;
   assert.throws(()=>Registry.initialize(uri,policy,now));assert.equal(existsSync(uri),false);
  });
 }
});
test('creator registry cannot accept ephemeral signed history behind an unrelated literal URI file',async()=>{
 await fixture(async dir=>{
  const disk=join(dir,'disk.sqlite');Registry.initialize(disk,policy,now);
  const uri='file:'+basename(dir)+'.sqlite?mode=memory&cache=shared';writeFileSync(uri,'',{mode:0o600});
  const original=new DatabaseSync(disk,{readOnly:true}),memory=new DatabaseSync(uri);let book,accepted=false;
  try{
   for(const t of original.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all())memory.exec(t.sql);
   const m=original.prepare('SELECT * FROM canon_policy').get();
   memory.prepare('INSERT INTO canon_policy VALUES(?,?,?,?,?)').run(m.singleton,m.version,m.policy,m.registry_id,m.last_clock);
   try{book=new Registry(uri,policy,{now:()=>now});accepted=true;}catch(e){assert.match(e.message,/memory and URI/);}
   if(accepted){
    const record=await accept(book);assert.equal(record.update.revision,1);
    assert.equal(record.currentAuthorization,null);assert.equal(record.executionAuthorized,false);
    assert.equal(memory.prepare('SELECT count(*) AS n FROM canon_versions').get().n,1);
    book.close();book=undefined;
   }else assert.equal(memory.prepare('SELECT count(*) AS n FROM canon_versions').get().n,0);
  }finally{book?.close();original.close();memory.close();}
  const fresh=new DatabaseSync(uri);try{assert.equal(fresh.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='canon_versions'").get().n,0);}finally{fresh.close();}
  assert.equal(statSync(uri).size,0);
  const preserved=new Registry(disk,policy,{readOnly:true,now:()=>now});try{assert.equal(preserved.latest(),null);}finally{preserved.close();}
  assert.equal(accepted,false,'Creator history committed only to ephemeral memory while the checked literal file stayed empty');
 });
});
test('ordinary relative and absolute creator registries preserve accepted history and replay rejection after reopen',async()=>{
 for(const absolute of [false,true])await fixture(async dir=>{
  const path=absolute?join(dir,'canon.sqlite'):'canon.sqlite';Registry.initialize(path,policy,now);
  let book=new Registry(path,policy,{now:()=>now});
  try{
   const record=await accept(book);book.close();book=new Registry(path,policy,{now:()=>now});
   assert.deepEqual(book.latest(),record);
   await assert.rejects(book.accept({update:record.update,signature},[client(),client()]),/Revision/);
   assert.deepEqual(book.latest(),record);
  }finally{book.close();}
 });
});
test('creator registry rejects direct memory targets before filesystem initialization and opening',async()=>{
 await fixture(async()=>{
  assert.throws(()=>Registry.initialize(':memory:',policy,now),/memory and URI/);assert.equal(existsSync(':memory:'),false);
  writeFileSync(':memory:','',{mode:0o600});assert.throws(()=>new Registry(':memory:',policy,{now:()=>now}),/memory and URI/);assert.equal(statSync(':memory:').size,0);
 });
});
