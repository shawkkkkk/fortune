import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { inspectBitcoinTransaction } from '../lib/bitcoin-transaction.ts';
import { inspectBitcoinPrevouts } from '../lib/bitcoin-prevout-accounting.ts';

try {
  if (process.env.FORTUNE_BITCOIN_TRANSACTION_READ_ENABLED !== 'true') throw Error('Disabled');
  if (process.argv.length !== 3) throw Error('Arguments');
  const fd = openSync(process.argv[2], constants.O_RDONLY | constants.O_NONBLOCK); let input;
  try {
    if (!fstatSync(fd).isFile()) throw Error('Regular file required');
    const bytes = Buffer.alloc(262145); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size > 262144) throw Error('Input bound');
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally { closeSync(fd); }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw Error('Input schema');
  const keys = Object.keys(input).sort().join(',');
  if (keys !== 'expectedTxid,rawTransaction' && keys !== 'expectedTxid,previousTransactions,rawTransaction') throw Error('Input schema');
  if (keys.includes('previousTransactions') && process.env.FORTUNE_BITCOIN_PREVOUT_READ_ENABLED !== 'true') throw Error('Disabled');
  const result = keys.includes('previousTransactions')
    ? inspectBitcoinPrevouts(input.rawTransaction, input.expectedTxid, input.previousTransactions)
    : inspectBitcoinTransaction(input.rawTransaction, input.expectedTxid);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write('Bitcoin transaction inspection unavailable.\n'); process.exitCode = 1;
}
