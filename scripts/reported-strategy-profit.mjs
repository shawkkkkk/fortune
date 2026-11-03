import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { ReportedStrategyProfitBook } from './reported-strategy-profit-book.mjs';

function bytes(path, max) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw Error('Regular input required');
    const b = Buffer.alloc(max + 1); let size = 0;
    while (size < b.length) { const n = readSync(fd, b, size, b.length - size, null); if (!n) break; size += n; }
    if (size > max) throw Error('Input bound');
    return b.subarray(0, size);
  } finally { closeSync(fd); }
}
const json = b => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
function exact(v, keys) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== keys.sort().join()) throw Error('Literal fields required');
}
const amount = v => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(v) || BigInt(v) >= 1n << 128n) throw Error('Decimal uint128 required');
  return BigInt(v);
};
let book;
try {
  if (process.env.FORTUNE_REPORTED_PROFIT_ENABLED !== 'true') throw Error('Disabled');
  const [mode, configPath, reportPath, ...extra] = process.argv.slice(2);
  if (extra.length || !configPath || !['read', 'append'].includes(mode)
    || (mode === 'read' ? reportPath !== undefined : !reportPath || process.env.FORTUNE_REPORTED_PROFIT_WRITE_ENABLED !== 'true')) throw Error('Explicit mode required');
  const pinned = bytes(configPath, 16384), config = json(pinned);
  exact(config, ['bookPath', 'bookId', 'policy']);
  if (typeof config.bookId !== 'string' || !/^[0-9a-f]{64}$/.test(config.bookId)) throw Error('Book identity required');
  // Validate the existing complete history read-only before any writer is opened.
  book = new ReportedStrategyProfitBook(config.bookPath, config.policy, { enabled: true });
  const view = book.read();
  if (view.bookId !== config.bookId) throw Error('Book identity differs');
  if (mode === 'read') {
    if (!pinned.equals(bytes(configPath, 16384))) throw Error('Config changed');
    console.log(JSON.stringify({ configSha256: createHash('sha256').update(pinned).digest('hex'), observation: view }));
  } else {
    const report = json(bytes(reportPath, 12288));
    exact(report, ['cycle', 'expectedHead']);
    exact(report.cycle, ['id', 'accountingAsset', 'receiptIds', 'reconciled', 'inventoryDelta', 'proceeds', 'purchaseCost', 'costs']);
    exact(report.cycle.costs, ['gas', 'bridge', 'rebalance', 'other']);
    const cycle = { ...report.cycle, inventoryDelta: amount(report.cycle.inventoryDelta), proceeds: amount(report.cycle.proceeds), purchaseCost: amount(report.cycle.purchaseCost),
      costs: Object.fromEntries(Object.entries(report.cycle.costs).map(([k, v]) => [k, amount(v)])) };
    book.close(); book = undefined;
    if (!pinned.equals(bytes(configPath, 16384))) throw Error('Config changed');
    book = new ReportedStrategyProfitBook(config.bookPath, config.policy, { enabled: true, readOnly: false });
    if (book.read().bookId !== config.bookId || !pinned.equals(bytes(configPath, 16384))) throw Error('Book/config changed');
    const result = book.appendReportedCycle({ cycle, expectedHead: report.expectedHead });
    console.log(JSON.stringify({ configSha256: createHash('sha256').update(pinned).digest('hex'), bookId: config.bookId, result }));
  }
} catch {
  console.error('Reported profit unavailable. Inspect the existing book/history and reviewed inputs before any explicit retry; a failed command does not prove no commit. No financial transaction was submitted.');
  process.exitCode = 1;
} finally { book?.close(); }
