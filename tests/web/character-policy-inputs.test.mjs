import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {CreatorCanonRegistry} from '../../scripts/creator-canon-registry.mjs';
import {characterRecordReader} from '../../scripts/character-record-reader.mjs';
import {characterProvenanceReader} from '../../scripts/character-provenance-reader.mjs';
import {revalidateCharacterRecord} from '../../scripts/revalidate-character-record.mjs';
import {emptyCharacter} from '../../lib/creator-character.ts';
import {policy,signature,creatorFor,client,now} from '../fixtures/creator-canon.mjs';
const targets=[['character-record-reader.mjs','characterRecordReader'],['character-provenance-reader.mjs','characterProvenanceReader'],['revalidate-character-record.mjs','revalidateCharacterRecord']];
for(const [file,name] of targets)test(`${name} rejects writerless FIFO policy without blocking startup or revalidation`,{skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-character-policy-fifo-'));try{
  const fifo=join(dir,'policy.fifo'),link=join(dir,'link');assert.equal(spawnSync('mkfifo',[fifo]).status,0);symlinkSync(fifo,link);
  for(const policyPath of [fifo,link]){
   const source=`import {${name} as read} from ${JSON.stringify(resolve('scripts',file))};const config=${JSON.stringify({path:join(dir,'missing.sqlite'),policyPath,token:policy.token})};try{await read(config,[{},{}]);process.exitCode=1;}catch{console.log('rejected');}`;
   const r=spawnSync(process.execPath,['--import',resolve('scripts/register-ts.mjs'),'--input-type=module','-e',source],{encoding:'utf8',timeout:3000});
   assert.equal(r.error,undefined,'Policy read must not wait for a FIFO writer');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'rejected');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('all actual character readers retain exact16KiB policy, strict UTF8, regular symlink and unchanged read-only storage',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-character-policy-')),path=join(dir,'canon.sqlite'),policyPath=join(dir,'policy.json');try{
  CreatorCanonRegistry.initialize(path,policy,now);const book=new CreatorCanonRegistry(path,policy,{now:()=>now});let creator;
  try{const p=book.prepare(emptyCharacter);creator=await creatorFor(p);await book.accept({update:p.update,signature},[client(creator),client(creator)]);}finally{book.close();}
  const raw=JSON.stringify(policy),valid=raw+' '.repeat(16384-Buffer.byteLength(raw)),config={path,policyPath,token:policy.token},before=readFileSync(path);
  const readAll=async cfg=>{const readers=[client(creator),client(creator)];const history=await characterRecordReader({...cfg,now:()=>now})(policy.token);assert.equal(history.record.revision,1);
   assert.equal((await characterProvenanceReader(cfg,readers,{now:()=>now})(policy.token)).executionAuthorized,false);
   assert.equal((await revalidateCharacterRecord(cfg,readers,{now:()=>now})).currentAuthorization,null);};
  writeFileSync(policyPath,valid);await readAll(config);
  const link=join(dir,'regular-link');symlinkSync(policyPath,link);await readAll({...config,policyPath:link});
  for(const bad of [valid+' ',Buffer.from([0xff]),'{}']){
   writeFileSync(policyPath,bad);let rpc=0;const c={getBlockNumber:async()=>{rpc++;throw Error('network');}};
   assert.throws(()=>characterRecordReader({...config,now:()=>now}));assert.throws(()=>characterProvenanceReader(config,[c,{...c}],{now:()=>now}));
   await assert.rejects(revalidateCharacterRecord(config,[c,{...c}],{now:()=>now}));assert.equal(rpc,0);
  }
  assert.deepEqual(readFileSync(path),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
