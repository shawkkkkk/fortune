import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const commands = [
 ['inspect-runestone.mjs','FORTUNE_RUNESTONE_DECODE_ENABLED','Runestone inspection unavailable.\n'],
 ['inspect-bitcoin-transaction.mjs','FORTUNE_BITCOIN_TRANSACTION_READ_ENABLED','Bitcoin transaction inspection unavailable.\n'],
 ['inspect-bitcoin-merkle.mjs','FORTUNE_BITCOIN_MERKLE_READ_ENABLED','Bitcoin Merkle observation unavailable.\n'],
];
for (const [script,gate,message] of commands) test(`${script} rejects actual writerless FIFO and FIFO symlink before blocking; disabled and directory paths stay private`, {skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-fifo-'));
 const fifo=join(dir,'pipe'),link=join(dir,'link'),folder=join(dir,'folder');
 try {
  const made=spawnSync('mkfifo',[fifo],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);
  symlinkSync(fifo,link);mkdirSync(folder);
  for(const [path,enabled] of [[fifo,'true'],[link,'true'],[folder,'true'],[fifo,'false']]){
   const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/'+script,path],{encoding:'utf8',env:{...process.env,[gate]:enabled},timeout:3000});
   assert.equal(r.error,undefined,`${script} blocked before regular-file validation: ${r.error?.code}`);
   assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,message);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
