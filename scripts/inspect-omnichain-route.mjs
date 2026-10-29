import { readFileSync, statSync } from 'node:fs';
import { createPublicClient, http } from 'viem';
import { inspectOmnichainRoute } from '../lib/omnichain-route.ts';
try {
  if (process.env.FORTUNE_OMNICHAIN_ROUTE_READ_ENABLED !== 'true') throw Error('Disabled');
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length || statSync(path).size > 32768) throw Error('Policy');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  const urls = ['FORTUNE_ROUTE_A_RPC_URL', 'FORTUNE_ROUTE_A_SECONDARY_RPC_URL', 'FORTUNE_ROUTE_B_RPC_URL', 'FORTUNE_ROUTE_B_SECONDARY_RPC_URL']
    .map(name => new URL(process.env[name] || ''));
  if (urls.some(u => u.protocol !== 'https:' || u.username || u.password || u.hash) || new Set(urls.map(u => u.origin)).size !== 4) throw Error('Reviewed HTTPS read providers required');
  const clients = urls.map(u => createPublicClient({ transport: http(u.href, { timeout: 5000, retryCount: 0, fetchOptions: { redirect: 'error' } }) }));
  console.log(JSON.stringify(await inspectOmnichainRoute([[clients[0], clients[1]], [clients[2], clients[3]]], policy)));
} catch {
  console.error('Paused testnet route observation unavailable: check explicit enablement, reviewed policy and read providers. No transaction was submitted.');
  process.exitCode = 1;
}
