import {createHash} from 'node:crypto';
import {projectToken} from '../lib/project-canon.ts';
import {inspectLiquidityCustody,validateLiquidityCustodyPolicy} from '../lib/managed-liquidity-custody.ts';
import {readCharacterPolicyBytes as policyBytes} from './character-policy-bytes.mjs';

/** Fixed operator selection; no caller-controlled project, path, policy or provider. */
export function projectLiquidityCustodyReader(config,clients,options={}){
 if(options.enabled!==true||options.discloseCustody!==true)throw Error('Custody observation disclosure disabled');
 const token=projectToken(config.token),path=config.policyPath,pinned=policyBytes(path);
 const policy=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pinned));
 validateLiquidityCustodyPolicy(policy);
 if(typeof policy.positionId!=='string'||![policy.token0.address,policy.token1.address].some(a=>projectToken(a)===token)
  ||!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Project custody configuration');
 const readers=Object.freeze([...clients]),policyHash=createHash('sha256').update(pinned).digest('hex');
 const pin=()=>{if(!pinned.equals(policyBytes(path)))throw Error('Custody policy changed');};pin();
 return async requestedToken=>{
  if(projectToken(requestedToken)!==token)throw Error('Fixed custody project required');
  const start=Date.now();let last=start,ended=false;
  const fence=()=>{const now=Date.now();if(ended||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<last||now-start>30000)throw Error('Custody read ended or clock invalid');last=now;};
  const check=()=>{fence();pin();fence();};
  const guarded=readers.map(c=>new Proxy(c,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);
   if(!['getBlockNumber','getChainId','getBlock','getCode','readContract'].includes(String(key)))return value;
   return async(...args)=>{check();const result=await Reflect.apply(value,target,args);check();return result;};
  }}));
  try{
   check();const custody=await inspectLiquidityCustody(guarded,policy);check();
   return Object.freeze({source:'operator-selected-project-liquidity-custody-rpc-observation',projectToken:token,policyHash,custody,
    projectCustodyVerified:false,currentAuthorization:null,executionAuthorized:false,fullManagedLiquidityReadiness:false});
  }finally{ended=true;}
 };
}
