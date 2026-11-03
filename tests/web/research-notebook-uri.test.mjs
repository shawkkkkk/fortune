import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {ProjectResearchNotebook as Book} from '../../scripts/project-research-notebook.mjs';
const token='0x'+'12'.repeat(20),now=1000;
const document={kind:'observation',title:'Fixture only',body:'Unverified local test observation',sources:[],corrects:0};
function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'fortune-notebook-uri-')),cwd=process.cwd();
 try{process.chdir(dir);run(dir);}finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
}
test('notebook rejects SQLite URI initialization before creating a literal filesystem file',()=>{
 for(const prefix of ['file:','FiLe:'])for(const query of ['?mode=memory&cache=shared','?mode=rwc']){
  fixture(dir=>{const uri=prefix+basename(dir)+'.sqlite'+query;
   assert.throws(()=>Book.initialize(uri,token,now));
   assert.equal(existsSync(uri),false);
  });
 }
});
test('notebook cannot accept committed shared-memory history through an unrelated literal URI file',()=>{
 fixture(dir=>{
  const disk=join(dir,'disk.sqlite');Book.initialize(disk,token,now);
  const uri='file:'+basename(dir)+'.sqlite?mode=memory&cache=shared';writeFileSync(uri,'',{mode:0o600});
  const original=new DatabaseSync(disk,{readOnly:true}),memory=new DatabaseSync(uri);let book,accepted=false;
  try{
   const tables=original.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
   for(const table of tables)memory.exec(table.sql);
   const metadata=original.prepare('SELECT * FROM notebook').get();
   memory.prepare('INSERT INTO notebook VALUES(?,?,?,?,?)').run(metadata.singleton,metadata.version,metadata.token,metadata.id,metadata.last_clock);
   try{book=new Book(uri,token,{now:()=>now});accepted=true;}catch(error){assert.match(error.message,/URI/);}
   if(accepted){
    const request={id:'memory-request-0001',expectedHead:book.read().head,document};
    assert.equal(book.append(request).replayed,false);
    assert.equal(book.read().total,1);
    assert.equal(memory.prepare('SELECT count(*) AS n FROM notes').get().n,1);
    book.close();book=undefined;
   }else assert.equal(memory.prepare('SELECT count(*) AS n FROM notes').get().n,0);
  }finally{book?.close();original.close();memory.close();}
  const reopened=new DatabaseSync(uri);
  try{assert.equal(reopened.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='notes'").get().n,0);}finally{reopened.close();}
  assert.equal(statSync(uri).size,0);
  const preserved=new Book(disk,token,{readOnly:true,now:()=>now});
  try{assert.equal(preserved.read().total,0);}finally{preserved.close();}
  assert.equal(accepted,false,'Committed notebook history was accepted in ephemeral SQLite memory while its literal filesystem file stayed empty');
 });
});
test('ordinary relative and absolute notebook files preserve history and original retry identity after reopen',()=>{
 for(const absolute of [false,true])fixture(dir=>{
  const path=absolute?join(dir,'notes.sqlite'):'notes.sqlite';Book.initialize(path,token,now);
  let book=new Book(path,token,{now:()=>now});
  try{
   const request={id:'disk-request-00001',expectedHead:book.read().head,document},result=book.append(request);
   book.close();book=new Book(path,token,{now:()=>now+10});
   assert.equal(book.read().total,1);assert.equal(book.readEntry(request.id).recordedAtMs,now);
   assert.deepEqual(book.append(request),{...result,replayed:true});
  }finally{book.close();}
 });
});

test('direct SQLite memory target is rejected before initialization or opening filesystem storage',()=>{
 fixture(()=>{
  assert.throws(()=>Book.initialize(':memory:',token,now),/SQLite memory and URI/);
  assert.equal(existsSync(':memory:'),false);
  writeFileSync(':memory:','',{mode:0o600});
  assert.throws(()=>new Book(':memory:',token,{now:()=>now}),/SQLite memory and URI/);
  assert.equal(statSync(':memory:').size,0);
 });
});
