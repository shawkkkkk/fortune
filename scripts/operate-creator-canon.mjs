import { openSync,fstatSync,readSync,closeSync,constants } from 'node:fs';
import { createPublicClient,http } from 'viem';
import { CreatorCanonRegistry } from './creator-canon-registry.mjs';
import { restoreCharacter } from '../lib/creator-character.ts';
const json=(path,max)=>{
  const fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);
  try {
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size>max)throw Error('Size/type');
    const raw=Buffer.alloc(max+1);let size=0;
    while(size<raw.length){const n=readSync(fd,raw,size,raw.length-size,null);if(!n)break;size+=n;}
    if(size>max)throw Error('Size');
    return new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(0,size));
  }finally{closeSync(fd);}
};
let book;
try {
  if(process.env.FORTUNE_CREATOR_CANON_ENABLED!=='true')throw Error('Disabled');
  const [mode,path,policyPath,inputPath,...extra]=process.argv.slice(2);
  if(!['init','prepare','accept','latest'].includes(mode)||!path||!policyPath||extra.length
    ||(['prepare','accept'].includes(mode)!==Boolean(inputPath)))throw Error('Arguments');
  const policy=JSON.parse(json(policyPath,16384));
  if(mode==='init'){CreatorCanonRegistry.initialize(path,policy);console.log(JSON.stringify({initialized:true,executionAuthorized:false}));}
  else {
    book=new CreatorCanonRegistry(path,policy,{readOnly:mode!=='accept'});
    if(mode==='latest')console.log(JSON.stringify(book.latest()));
    if(mode==='prepare'){
      const draft=restoreCharacter(json(inputPath,32768),policy.token);
      console.log(JSON.stringify(book.prepare(draft.fields),(_,v)=>typeof v==='bigint'?v.toString():v));
    }
    if(mode==='accept'){
      const envelope=JSON.parse(json(inputPath,40960));
      const urls=[process.env.FORTUNE_CANON_READ_RPC_URL,process.env.FORTUNE_CANON_SECONDARY_RPC_URL].map(x=>new URL(x||''));
      if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Distinct reviewed HTTPS origins required');
      const clients=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:8000,retryCount:0,fetchOptions:{redirect:'error'}})}));
      console.log(JSON.stringify(await book.accept(envelope,clients)));
    }
  }
}catch{console.error('Creator canon operation stopped. Check explicit enablement, reviewed policy, existing protected registry, exact profile/revision, creator signature, read providers and host clock. No wallet action or publication was performed.');process.exitCode=1;}
finally{book?.close();}
