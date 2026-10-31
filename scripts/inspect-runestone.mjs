import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { inspectRunestoneScripts } from '../lib/bitcoin-runestone.ts';

try {
  if (process.env.FORTUNE_RUNESTONE_DECODE_ENABLED !== 'true') throw Error('Disabled');
  if (process.argv.length !== 3) throw Error('Arguments');
  const fd = openSync(process.argv[2], 'r'); let input;
  try {
    if (!fstatSync(fd).isFile()) throw Error('Regular file required');
    const bytes = Buffer.alloc(196609); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size > 196608) throw Error('Input bound');
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally { closeSync(fd); }
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).join(',') !== 'outputScripts') throw Error('Input schema');
  process.stdout.write(`${JSON.stringify(inspectRunestoneScripts(input.outputScripts))}\n`);
} catch {
  process.stderr.write('Runestone inspection unavailable.\n'); process.exitCode = 1;
}
