import {readFileSync,statSync} from 'node:fs';
import {keccak256,parseAbi} from 'viem';
import {characterRecordReader} from './character-record-reader.mjs';
import {canonPolicy} from '../lib/creator-canon-authorization.ts';
const ABI=parseAbi(['function launches(uint256) view returns(address,address,address,address,address,address,address,bytes32,bytes32,uint64)']);
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)&&!/^0x0{64}$/.test(x);
function policyBytes(path){if(statSync(path).size>16384)throw Error('Policy bound');const b=readFileSync(path);if(b.length>16384)throw Error('Policy bound');return new TextDecoder('utf-8',{fatal:true}).decode(b);}
/** One explicit observation. Never renews a signature, persists trust or authorizes a session. */
export async function revalidateCharacterRecord(config,clients,{now=Date.now}={}){
 const start=now();let timer,last=start,expired=false;
 const time=()=>{const n=now();if(expired||!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(n)||n<last||n-start>20000)throw Error('Observation clock');last=n;return n;};
 const call=async(c,method,args)=>{time();const result=await c[method](args);time();return result;};
 const work=async()=>{
  time();const raw=policyBytes(config.policyPath),p=canonPolicy(JSON.parse(raw));
  if(p.token!==config.token||!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Project/clients differ');
  const reader=characterRecordReader({...config,now});
  const first=await reader(p.token),r=first.record;
  if(!r||r.observedFactory!==p.factory||!r.signatureConsistent)throw Error('Existing consistent history required');
  if(policyBytes(config.policyPath)!==raw)throw Error('Policy changed');
  const heads=await Promise.all(clients.map(c=>call(c,'getBlockNumber',{cacheTime:0})));
  if(heads.some(h=>typeof h!=='bigint'||h<20n||h>=(1n<<64n))||(heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n)throw Error('Heads differ');
  const blockNumber=(heads[0]<heads[1]?heads[0]:heads[1])-20n,oldNumber=BigInt(r.observedBlockNumber);
  if(oldNumber>blockNumber)throw Error('History newer than checked block');
  const observations=await Promise.all(clients.map(async c=>{
   if(await call(c,'getChainId')!==97)throw Error('Chain differs');
   const old=await call(c,'getBlock',{blockNumber:oldNumber}),block=await call(c,'getBlock',{blockNumber});
   if(old.number!==oldNumber||old.hash!==r.observedBlockHash||block.number!==blockNumber||!hash(block.hash)||typeof block.timestamp!=='bigint'
    ||block.timestamp*1000n>BigInt(time()+5000)||BigInt(time())-block.timestamp*1000n>120000n)throw Error('Block differs or stale');
   const code=await call(c,'getCode',{address:p.factory,blockNumber});
   if(!code||code==='0x'||keccak256(code)!==p.factoryCodeHash)throw Error('Factory differs');
   const row=await call(c,'readContract',{address:p.factory,abi:ABI,functionName:'launches',args:[BigInt(p.launchIndex)],blockNumber});
   if(!Array.isArray(row)||row.length!==10||row[0]?.toLowerCase()!==r.observedCreator||row[1]?.toLowerCase()!==p.token||typeof row[9]!=='bigint'||row[9]===0n)throw Error('Creator/project differs');
   const creatorCode=await call(c,'getCode',{address:r.observedCreator,blockNumber});
   if(creatorCode!==undefined&&creatorCode!=='0x')throw Error('Contract/delegated creator unsupported');
   const after=await call(c,'getBlock',{blockNumber}),oldAfter=await call(c,'getBlock',{blockNumber:oldNumber});
   if(after.number!==blockNumber||after.hash!==block.hash||after.timestamp!==block.timestamp||oldAfter.number!==oldNumber||oldAfter.hash!==old.hash||await call(c,'getChainId')!==97)throw Error('Snapshot changed');
   return {number:blockNumber.toString(),hash:block.hash,timestamp:block.timestamp.toString()};
  }));
  if(JSON.stringify(observations[0])!==JSON.stringify(observations[1]))throw Error('Providers disagree');
  const second=await reader(p.token);
  if(JSON.stringify(second.record)!==JSON.stringify(r)||policyBytes(config.policyPath)!==raw)throw Error('Local history/policy changed');
  return Object.freeze({schemaVersion:1,source:'operator-character-rpc-recheck',chainId:97,token:p.token,revision:r.revision,digest:r.digest,
   historicalBlock:{number:r.observedBlockNumber,hash:r.observedBlockHash},checkedBlock:observations[0],observedAtMs:time(),
   storedSignatureConsistent:true,historicalBlockMatched:true,factoryCreatorMatched:true,currentAuthorization:null,executionAuthorized:false,
   limitations:['Point-in-time trusted RPC observations, not independent providers, EIP-1898 hash-bound reads or finality.',
    'Expired historical signatures are not renewed. No login, IP/license/moderation, publication or financial authority.',
    'Protected host/files/clock remain trusted; no persisted trust, revalidation service or recovery.']});
 };
 try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Recheck timed out'));},20000);})]);}
 finally{expired=true;clearTimeout(timer);}
}
