import { readFileSync, statSync } from 'node:fs';
import { createPublicClient, http } from 'viem';
import { inspectLiquidityPosition } from '../lib/managed-liquidity-position.ts';
try {
  const [path,...extra]=process.argv.slice(2);
  if(!path||extra.length||statSync(path).size>16384)throw Error('Arguments');
  const policy=JSON.parse(readFileSync(path,'utf8'));
  const urls=[process.env.FORTUNE_LP_READ_RPC_URL,process.env.FORTUNE_LP_SECONDARY_RPC_URL].map(x=>new URL(x||''));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Distinct reviewed HTTPS origins required');
  const clients=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:5000,retryCount:0})}));
  console.log(JSON.stringify(await inspectLiquidityPosition(clients,policy)));
}catch{console.error('LP observation unavailable: check reviewed testnet policy, position, read providers and canonical history. No transaction was submitted.');process.exitCode=1;}
