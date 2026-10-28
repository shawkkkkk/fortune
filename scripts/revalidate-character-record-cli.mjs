import {createPublicClient,http} from 'viem';
import {revalidateCharacterRecord} from './revalidate-character-record.mjs';
try{
 if(process.env.FORTUNE_CHARACTER_RECHECK_ENABLED!=='true')throw Error('Disabled');
 const [path,policyPath,token,...extra]=process.argv.slice(2);if(!path||!policyPath||!token||extra.length)throw Error('Arguments');
 const urls=[process.env.FORTUNE_CANON_READ_RPC_URL,process.env.FORTUNE_CANON_SECONDARY_RPC_URL].map(x=>new URL(x||''));
 if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Reviewed origins required');
 const clients=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:8000,retryCount:0,fetchOptions:{redirect:'error'}})}));
 console.log(JSON.stringify(await revalidateCharacterRecord({path,policyPath,token},clients)));
}catch{console.error('Character provenance recheck stopped. Review explicit enablement, existing protected history, policy, providers and host clock. No authorization, publication or wallet action was granted.');process.exitCode=1;}
