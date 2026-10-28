import { readFileSync, statSync } from 'node:fs';
import { inspectLegacyNativeGasBudget, migrateLegacyNativeGasBudget } from './native-gas-budget-migration.mjs';
try{
  const [mode,path,manifest,backupPath,digest,confirmation]=process.argv.slice(2);
  if(!['inspect','migrate'].includes(mode)||!path||!manifest||statSync(manifest).size>16384)throw Error('Arguments');
  const raw=readFileSync(manifest,'utf8');if(Buffer.byteLength(raw)>16384)throw Error('Manifest bound');const policy=JSON.parse(raw);
  let result;
  if(mode==='inspect'&&process.argv.length===5)result=inspectLegacyNativeGasBudget(path,policy);
  else if(mode==='migrate'&&process.argv.length===8&&confirmation==='--offline-workers-stopped')result=migrateLegacyNativeGasBudget({path,backupPath,reviewedPolicy:policy,expectedSourceDigest:digest,offlineWorkersStopped:true});
  else throw Error('Arguments');
  console.log(JSON.stringify(result));
}catch{console.error('Native gas migration stopped. Check offline worker shutdown, reviewed policy/source digest, initialized v1 file and fresh protected backup path. Preserve all files; no automatic recovery or spending authority.');process.exitCode=1;}
