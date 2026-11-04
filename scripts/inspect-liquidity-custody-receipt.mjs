import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPublicClient, http } from 'viem';
import { inspectLiquidityCustodyDepositReceipt } from '../lib/liquidity-custody-deposit-receipt.ts';
import { inspectLiquidityCustodyReleaseReceipt } from '../lib/liquidity-custody-release-receipt.ts';

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
  if (process.env.FORTUNE_LP_CUSTODY_RECEIPT_READ_ENABLED !== 'true') throw Error('Disabled');
  const [kind, path, ...extra] = process.argv.slice(2);
  if (!['deposit','release'].includes(kind) || !path || extra.length) throw Error('Arguments');
  const pinned = policyBytes(path);
  const policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pinned));
  const urls = [process.env.FORTUNE_LP_READ_RPC_URL, process.env.FORTUNE_LP_SECONDARY_RPC_URL]
    .map(v => new URL(v || ''));
  if (urls.some(u => u.protocol !== 'https:' || u.username || u.password || u.hash)
    || urls[0].origin === urls[1].origin) throw Error('Providers');
  const clients = urls.map(u => createPublicClient({ transport: http(u.href, {
    timeout: 5000, retryCount: 0, fetchOptions: { redirect: 'error', credentials: 'omit' },
  }) }));
  if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
  // Preserve literal reviewed bytes around every awaited read and original receivers.
  const started = Date.now(); let last = started, closed = false;
  const live = () => { const now = Date.now(); if (closed || !Number.isSafeInteger(started) || started < 0 || !Number.isSafeInteger(now) || now < last || now-started > 30000) throw Error('Read lifetime'); last = now; };
  const assertPinned = () => { live(); if (!pinned.equals(policyBytes(path))) throw Error('Policy changed'); live(); };
  const guarded = clients.map(client => new Proxy(client, {get(target,key) {
    const value = Reflect.get(target,key,target);
    if (!['getChainId','getBlockNumber','getBlock','getCode','getTransaction','getTransactionReceipt','readContract'].includes(String(key)) || typeof value !== 'function') return value;
    return async(...args) => { assertPinned(); const result = await Reflect.apply(value,target,args); assertPinned(); return result; };
  }}));
  const inspect = kind === 'deposit' ? inspectLiquidityCustodyDepositReceipt : inspectLiquidityCustodyReleaseReceipt;
  let observation;
  try { observation = await inspect(guarded, policy); } finally { closed = true; }
  if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
  console.log(JSON.stringify({ source: 'operator-liquidity-custody-receipt', kind,
    policySha256: createHash('sha256').update(pinned).digest('hex'), observation,
    currentAuthorization: null, executionAuthorized: false, fullManagedLiquidityReadiness: false,
  }));
} catch {
  console.error('Liquidity custody receipt unavailable: check explicit enablement, bounded policy and reviewed read providers. No transaction was submitted.');
  process.exitCode = 1;
}
