import {createHash} from 'node:crypto';
import {inspectVaultPermanentBurn} from '../lib/omnichain-burn-receipt.ts';
import {projectToken} from '../lib/project-canon.ts';
import {ProjectResearchNotebook} from './project-research-notebook.mjs';

const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const title='Vault burn RPC observation';
const limitations=[
 'Historical local research only. Trusted host storage can be rewritten; no authenticated source or independent timestamp.',
 'Two supplied clients do not prove independent providers, canonical chain or finality. No automatic reorg correction or revalidation.',
 'Inventory is not proof of fee funding, a buyback or legitimate capital origin. Block-end counters must not be summed.',
 'No consumed financial ledger, badge, public publication, global supply reconciliation or execution authority.'
];
function policy(value,token){
 if(!value||Object.keys(value).sort().join()!=='amount,caller,chainId,manifestHash,runtimeHash,token,transactionHash,vault,vaultRuntimeHash'||value.chainId!==97)throw Error('Capture policy');
 const p={chainId:97,token:projectToken(value.token),vault:projectToken(value.vault),caller:projectToken(value.caller)};
 if(p.token!==token||new Set([p.token,p.vault,p.caller]).size!==3)throw Error('Capture project');
 for(const key of ['runtimeHash','vaultRuntimeHash','manifestHash','transactionHash']){
  if(typeof value[key]!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value[key])||/^0x0{64}$/i.test(value[key]))throw Error('Capture pin');p[key]=value[key].toLowerCase();
 }
 if(typeof value.amount!=='string'||! /^[1-9][0-9]{0,38}$/.test(value.amount)||BigInt(value.amount)>=1n<<128n)throw Error('Capture amount');p.amount=value.amount;return p;
}
/** Explicit one-shot read -> existing append-only research store. Never a financial consumed ledger. */
export async function captureVaultBurn({path,token,expectedHead,policy:input},clients,{enabled=false}={}){
 if(enabled!==true)throw Error('Vault burn capture disabled');
 let last=0;const now=()=>{const n=Date.now();if(!Number.isSafeInteger(n)||n<1||n<last)throw Error('Capture clock');last=n;return n;};now();
 token=projectToken(token);const p=policy(structuredClone(input),token);
 if(typeof expectedHead!=='string'||! /^[0-9a-f]{64}$/.test(expectedHead))throw Error('Capture head');
 const id=sha(['vault-burn-rpc-observation-v1',97,p.token,p.vault,p.transactionHash]),policySha256=sha(p);
 const result=(entry,replayed,rpcReadPerformed)=>({sequence:entry.sequence,digest:entry.digest,recordedAtMs:entry.recordedAtMs,replayed,
  rpcReadPerformed,source:'local-unverified-operator-research',currentAuthorization:null,sourceAuthenticated:false,
  executionAuthorized:false,fullReadiness:false});
 let book=new ProjectResearchNotebook(path,token,{readOnly:true,now});
 try{
  const old=book.readEntry(id);
  if(old){const b=JSON.parse(old.body);if(old.previous!==expectedHead||old.kind!=='observation'||old.title!==title||old.corrects!==0||old.sources.length!==0
    ||b.schemaVersion!==1||b.kind!=='vault-burn-rpc-observation'||b.policySha256!==policySha256)throw Error('Capture conflict');
   // Deliberately return history without any RPC or new observation timestamp, even after other notes.
   return result(old,true,false);
  }
  const history=book.read();if(history.head!==expectedHead||history.total>=1000)throw Error('Capture head/capacity changed');
 }finally{book.close();}
 const observation=await inspectVaultPermanentBurn(clients,p);now();
 const document={kind:'observation',title,body:JSON.stringify({schemaVersion:1,kind:'vault-burn-rpc-observation',policySha256,observation,limitations}),sources:[],corrects:0};
 book=new ProjectResearchNotebook(path,token,{now});
 try{const appended=book.append({id,expectedHead,document});return result(book.readEntry(id),appended.replayed,true);}finally{book.close();}
}
