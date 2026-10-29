import {readFileSync,statSync} from 'node:fs';
import {characterRecordReader} from './character-record-reader.mjs';
import {revalidateCharacterRecord} from './revalidate-character-record.mjs';
import {projectToken} from '../lib/project-canon.ts';

function policyBytes(path){
  if(statSync(path).size>16384)throw Error('Policy bound');
  const bytes=readFileSync(path);if(bytes.length>16384)throw Error('Policy bound');
  return bytes;
}
/** Explicit operator opt-in: fresh observation only, never stored or session authority. */
export function characterProvenanceReader(config,clients,{now=Date.now}={}){
  const fixed=Object.freeze({path:config.path,policyPath:config.policyPath,token:projectToken(config.token)});
  const pinned=policyBytes(fixed.policyPath);
  // Existing storage/policy must validate at startup, without network or creation.
  characterRecordReader({...fixed,now});
  if(!pinned.equals(policyBytes(fixed.policyPath))||!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Provenance configuration');
  const readers=Object.freeze([...clients]);
  return async token=>{
    if(projectToken(token)!==fixed.token||!pinned.equals(policyBytes(fixed.policyPath)))throw Error('Project/policy changed');
    const observation=await revalidateCharacterRecord(fixed,readers,{now});
    if(!pinned.equals(policyBytes(fixed.policyPath)))throw Error('Policy changed');
    return observation;
  };
}
