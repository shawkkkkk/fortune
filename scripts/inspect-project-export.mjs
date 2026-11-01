import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { inspectProjectDataExport } from '../lib/project-export-inspector.ts';
import { projectToken } from '../lib/project-canon.ts';

try {
  if (process.env.FORTUNE_PROJECT_EXPORT_INSPECT_ENABLED !== 'true') throw Error('Disabled');
  if (process.argv.length !== 4) throw Error('Arguments');
  const token = projectToken(process.argv[3]);
  const fd = openSync(process.argv[2], 'r'); let input;
  try {
    if (!fstatSync(fd).isFile()) throw Error('Regular file required');
    const bytes = Buffer.alloc(65537); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size > 65536) throw Error('Input bound');
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally { closeSync(fd); }
  process.stdout.write(`${JSON.stringify(inspectProjectDataExport(input, token))}\n`);
} catch {
  process.stderr.write('Project export inspection unavailable.\n'); process.exitCode = 1;
}
