import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
function fixture(work){
 const dir=mkdtempSync(join(tmpdir(),'fortune-handoff-test-'));
 try{
 execFileSync(process.execPath,['scripts/mainnet-candidate-fingerprint.mjs'],{env:{...process.env,FORTUNE_MAINNET_FINGERPRINT:join(dir,'measured.json')},stdio:'pipe'});
 const report=JSON.parse(readFileSync(join(dir,'measured.json'),'utf8'));
 for(const p of [...report.files.map(x=>x.file),'scripts/mainnet-candidate-fingerprint.mjs','scripts/check-release-handoff-fingerprint.mjs','docs/RELEASE_HANDOFF.md']){mkdirSync(dirname(join(dir,p)),{recursive:true});copyFileSync(p,join(dir,p));}
 execFileSync('git',['init','-q',dir]);execFileSync('git',['add','.'],{cwd:dir});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture snapshot'],{cwd:dir});
 const run=()=>spawnSync(process.execPath,['scripts/check-release-handoff-fingerprint.mjs'],{cwd:dir,encoding:'utf8'});
 work({dir,run,report});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('actual checker measures tracked source and distinguishes consistency from release approval',()=>fixture(({run,report})=>{
 const result=run();assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.aggregateSha256,report.aggregateSha256);assert.equal(value.fileCount,report.files.length);assert.equal(value.releaseApproval,false);
}));
test('a changed candidate file fails even when the handoff is untouched',()=>fixture(({dir,run})=>{
 writeFileSync(join(dir,'package.json'),readFileSync(join(dir,'package.json'),'utf8')+'\n');const result=run();assert.equal(result.status,1);assert.match(result.stderr,/check failed/);assert.equal(result.stderr.includes(dir),false);
}));
test('stale, duplicate, missing and acceptance-claim records fail closed',()=>fixture(({dir,run,report})=>{
 const path=join(dir,'docs/RELEASE_HANDOFF.md'),original=readFileSync(path,'utf8');
 for(const content of [original.replace(report.aggregateSha256,'0'.repeat(64)),original.replace(`"fileCount": ${report.files.length}`,`"fileCount": ${report.files.length-1}`),original.replace('"not-established"','"approved"'),original+'\n'+original,original.replaceAll('fortune-current-candidate','other-marker')]){writeFileSync(path,content);assert.equal(run().status,1);}
 writeFileSync(path,original);assert.equal(run().status,0);
}));
