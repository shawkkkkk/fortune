import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPublicClient, http } from 'viem';
import { buildCounterBatchFunding } from '../lib/counter-batch-funding.ts';

function policyBytes(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384) throw Error('Policy bound');
    const bytes = Buffer.alloc(16385); let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > 16384) throw Error('Policy bound');
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

try {
  if (process.env.FORTUNE_COUNTER_BATCH_FUNDING_READ_ENABLED !== 'true') throw Error('Disabled');
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw Error('Arguments');
  const pinned = policyBytes(path);
  const policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pinned));
  const urls = [process.env.FORTUNE_COUNTER_READ_RPC_URL, process.env.FORTUNE_COUNTER_SECONDARY_RPC_URL]
    .map(v => new URL(v || ''));
  if (urls.some(u => u.protocol !== 'https:' || u.username || u.password || u.hash)
    || urls[0].origin === urls[1].origin) throw Error('Providers');
  const clients = urls.map(u => createPublicClient({ transport: http(u.href, {
    timeout: 5000, retryCount: 0, fetchOptions: { redirect: 'error', credentials: 'omit' },
  }) }));
  if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
  const review = await buildCounterBatchFunding(clients, policy);
  if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
  console.log(JSON.stringify({ source: 'operator-counter-snapshot-batch-funding-review',
    policySha256: createHash('sha256').update(pinned).digest('hex'), review,
    currentAuthorization: null, executionAuthorized: false, fullCounterReadiness: false,
  }));
} catch {
  console.error('Counter batch funding review unavailable: check explicit enablement, bounded policy and reviewed read providers. No transaction was submitted.');
  process.exitCode = 1;
}
