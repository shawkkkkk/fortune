import { readFileSync, statSync } from 'node:fs';
import { createPublicClient, http } from 'viem';
import { inspectPermanentBurn } from '../lib/omnichain-burn-receipt.ts';
try {
  if(process.env.FORTUNE_PERMANENT_BURN_READ_ENABLED!=='true')throw Error('Disabled');
  const [path,...extra]=process.argv.slice(2);
  if(!path||extra.length||statSync(path).size>8192)throw Error('Policy');
  const bytes=readFileSync(path);if(bytes.length>8192)throw Error('Policy');
  const policy=JSON.parse(bytes.toString('utf8'));
  const urls=[process.env.FORTUNE_BURN_READ_RPC_URL,process.env.FORTUNE_BURN_SECONDARY_RPC_URL].map(v=>new URL(v||''));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Providers');
  const clients=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:5000,retryCount:0,fetchOptions:{redirect:'error'}})}));
  console.log(JSON.stringify(await inspectPermanentBurn(clients,policy)));
}catch{console.error('Permanent burn observation unavailable: check explicit enablement, reviewed testnet policy and read providers. No transaction was submitted.');process.exitCode=1;}
