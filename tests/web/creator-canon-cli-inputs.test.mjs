import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreatorCanonRegistry } from '../../scripts/creator-canon-registry.mjs';
import { policy, now } from '../fixtures/creator-canon.mjs';
import { emptyCharacter, characterDraft } from '../../lib/creator-character.ts';
const fields={...emptyCharacter,name:'Cat',voice:'Quiet'};
const run = args => spawnSync(process.execPath, ['--import','./scripts/register-ts.mjs','scripts/operate-creator-canon.mjs',...args], {
  encoding:'utf8', timeout:3000, env:{...process.env,FORTUNE_CREATOR_CANON_ENABLED:'true',
    FORTUNE_CANON_READ_RPC_URL:'http://private.invalid/key',FORTUNE_CANON_SECONDARY_RPC_URL:'http://other.invalid/key'},
});
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'fortune-canon-input-')), db=join(dir,'canon.sqlite'), pp=join(dir,'policy.json'), dp=join(dir,'draft.json');
  CreatorCanonRegistry.initialize(db,policy,now);writeFileSync(pp,JSON.stringify(policy));writeFileSync(dp,JSON.stringify(characterDraft(policy.token,fields)));
  return {dir,db,pp,dp};
}
for (const role of ['policy','draft','envelope']) test(`creator CLI rejects writerless ${role} FIFO before any RPC or registry change`,{skip:process.platform==='win32'},()=>{
  const s=fixture();try {
    const fifo=join(s.dir,'input.fifo');assert.equal(spawnSync('mkfifo',[fifo]).status,0);
    const args=role==='policy'?['init',join(s.dir,'new.sqlite'),fifo]:role==='draft'?['prepare',s.db,s.pp,fifo]:['accept',s.db,s.pp,fifo];
    const r=run(args);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.equal(r.stdout,'');
    assert.doesNotMatch(r.stderr,/input\.fifo|private\.invalid|\/key/);assert.match(r.stderr,/Creator canon operation stopped/);
    assert.equal(existsSync(join(s.dir,'new.sqlite')),false);
    const book=new CreatorCanonRegistry(s.db,policy,{readOnly:true});try{assert.equal(book.latest(),null);}finally{book.close();}
  }finally{rmSync(s.dir,{recursive:true,force:true});}
});
test('creator CLI preserves bounded UTF8 regular preparation and rejects byte overflow/nonregular/invalid UTF8 inputs',()=>{
  const s=fixture();try {
    const text=JSON.stringify(characterDraft(policy.token,fields));writeFileSync(s.dp,text+' '.repeat(32768-Buffer.byteLength(text)));
    let r=run(['prepare',s.db,s.pp,s.dp]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).typedData.message.name,fields.name);
    for(const [mode,path,max] of [['prepare',s.dp,32768],['accept',join(s.dir,'signed.json'),40960]]) {
      for(const bytes of [Buffer.alloc(max+1,32),Buffer.from([0xff])]) {writeFileSync(path,bytes);r=run([mode,s.db,s.pp,path]);assert.equal(r.status,1);assert.equal(r.stdout,'');}
      r=run([mode,s.db,s.pp,s.dir]);assert.equal(r.status,1);assert.equal(r.stdout,'');
    }
    writeFileSync(s.pp,Buffer.alloc(16385,32));r=run(['latest',s.db,s.pp]);assert.equal(r.status,1);assert.equal(r.stdout,'');
    const book=new CreatorCanonRegistry(s.db,policy,{readOnly:true});try{assert.equal(book.latest(),null);}finally{book.close();}
  }finally{rmSync(s.dir,{recursive:true,force:true});}
});
