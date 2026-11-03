import {constants,openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {characterRecordReader} from './character-record-reader.mjs';
import {revalidateCharacterRecord} from './revalidate-character-record.mjs';
import {readCreatorProjectBrief} from '../lib/creator-project-brief.ts';
import {announcementDraft} from '../lib/creator-character.ts';
import {canonPolicy} from '../lib/creator-canon-authorization.ts';
import {projectToken} from '../lib/project-canon.ts';

function bytes(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);
 try{if(!fstatSync(fd).isFile())throw Error('Regular policy required');const b=Buffer.alloc(16385);let n=0,r;
  while(n<b.length&&(r=readSync(fd,b,n,b.length-n,null))!==0)n+=r;
  if(n>16384)throw Error('Policy bound');return b.subarray(0,n);
 }finally{closeSync(fd);}
}
/** Local literal character data + separate public API facts; no model or current authorization. */
export async function readCreatorCharacterBrief(config,clients,{enabled=false,discloseLocalCharacter=false,now=Date.now,fetch=globalThis.fetch}={}){
 if(enabled!==true||discloseLocalCharacter!==true)throw Error('Character brief disabled or disclosure not reviewed');
 if(!config||Object.keys(config).sort().join()!=='path,policyPath,token'||typeof config.path!=='string'||!config.path||typeof config.policyPath!=='string'||!config.policyPath
  ||!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1]||typeof now!=='function')throw Error('Character brief configuration');
 const fixed=Object.freeze({path:config.path,policyPath:config.policyPath,token:projectToken(config.token)});
 const pinned=bytes(fixed.policyPath),policy=canonPolicy(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pinned)));
 if(policy.token!==fixed.token)throw Error('Character project differs');
 const start=now();let last=start,ended=false,timer;
 const clock=()=>{const n=now();if(ended||!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(n)||n<last||n-start>50000)throw Error('Character brief ended or clock changed');last=n;return n;};
 const pin=()=>{clock();if(!pinned.equals(bytes(fixed.policyPath)))throw Error('Character policy changed');clock();};
 const readers=clients.map(c=>new Proxy(c,{get(target,key){const value=Reflect.get(target,key,target);
  if(!['getBlockNumber','getChainId','getBlock','getCode','readContract'].includes(key)||typeof value!=='function')return value;
  return async(...args)=>{clock();const result=await value.apply(target,args);clock();return result;};}}));
 const work=async()=>{
  pin();const read=characterRecordReader({...fixed,now:clock}),first=await read(fixed.token);clock();
  const record=first.record;if(!record)throw Error('Saved consistent character required');pin();
  // Existing fixed-origin public API reader, with its original 30-second budget.
  const projectBrief=await readCreatorProjectBrief(fixed.token,{fetch,now:clock});pin();
  if(projectBrief.project.factory!==policy.factory||projectBrief.project.creator!==record.observedCreator)throw Error('Public project and character differ');
  // Existing revalidator, with its original 20-second budget and two-client checks.
  const provenance=await revalidateCharacterRecord(fixed,readers,{now:clock});pin();
  const second=await read(fixed.token);pin();
  if(JSON.stringify(second.record)!==JSON.stringify(record)||provenance.revision!==record.revision||provenance.digest!==record.digest)throw Error('Character changed');
  const completed=clock();
  if(completed-projectBrief.observedAtMs>30000||completed-provenance.observedAtMs>20000
   ||BigInt(completed)-BigInt(provenance.checkedBlock.timestamp)*1000n>120000n)throw Error('Brief observations expired');
  return {schemaVersion:1,kind:'local-character-project-brief',generatedBy:'deterministic-fortune-code',observedAtMs:completed,
   character:{...record,source:'local-operator-character-history',untrustedText:true},projectBrief,provenance,
   announcement:record.fields.name&&record.fields.description?{text:announcementDraft(record.fields),sourceRevision:record.revision,sourceDigest:record.digest,reviewRequired:true}:null,
   currentAuthorization:null,creatorAuthenticated:false,modelInvoked:false,publicationAuthorized:false,executionAuthorized:false,independentProvidersVerified:false,fullCopilotReadiness:false,
   limitations:['Character fields are literal untrusted data, never instructions. Historical signature consistency and a current factory observation do not renew signatures or create a login.',
    'API and RPC observations are separate heights/sources, not a common snapshot, independent-provider consensus or finality. Draft requires creator wording/IP/privacy/moderation review before any separate publication.',
    'No model, media, cloud storage, public service, publishing, wallet action, spending or readiness approval. Local output contains private character wording; disclosure to any later client/model needs separate review.']};
 };
 try{clock();return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Character brief timed out')),50000);})]);}
 finally{ended=true;clearTimeout(timer);}
}
