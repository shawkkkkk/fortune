// Documentation consistency only. Never grants deployment or baseline acceptance.
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dir=mkdtempSync(join(tmpdir(),'fortune-handoff-fingerprint-'));
try{
 const destination=join(dir,'fingerprint.json');
 execFileSync(process.execPath,[join(root,'scripts/mainnet-candidate-fingerprint.mjs')],{cwd:root,env:{...process.env,FORTUNE_MAINNET_FINGERPRINT:destination},stdio:'pipe'});
 const actual=JSON.parse(readFileSync(destination,'utf8'));
 const text=readFileSync(join(root,'docs/RELEASE_HANDOFF.md'),'utf8');
 const matches=[...text.matchAll(/<!-- fortune-current-candidate -->\s*```json\s*([\s\S]*?)```\s*<!-- \/fortune-current-candidate -->/g)];
 if(matches.length!==1)throw Error('Unique current-candidate record required');
 const declared=JSON.parse(matches[0][1]);
 if(Object.keys(declared).sort().join()!=='acceptance,aggregateSha256,fileCount,historicalAggregateSha256,schemaVersion'
  ||declared.schemaVersion!==1||declared.acceptance!=='not-established'
  ||! /^[0-9a-f]{64}$/.test(declared.aggregateSha256)||! /^[0-9a-f]{64}$/.test(declared.historicalAggregateSha256)
  ||declared.aggregateSha256!==actual.aggregateSha256||declared.fileCount!==actual.files.length)
  throw Error('Handoff differs from measured source or implies acceptance');
 console.log(JSON.stringify({consistent:true,aggregateSha256:actual.aggregateSha256,fileCount:actual.files.length,releaseApproval:false}));
}catch{
 console.error('Release handoff fingerprint check failed. Measure the current source and review the handoff; consistency is not baseline acceptance or deployment approval.');process.exitCode=1;
}finally{rmSync(dir,{recursive:true,force:true});}
