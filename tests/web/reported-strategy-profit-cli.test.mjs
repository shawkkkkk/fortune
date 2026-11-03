import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ReportedStrategyProfitBook as Book } from '../../scripts/reported-strategy-profit-book.mjs';
const loader = resolve('scripts/register-ts.mjs'), script = resolve('scripts/reported-strategy-profit.mjs');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'fortune-profit-cli-')), path = join(dir, 'book.sqlite'), config = join(dir, 'policy.json'), report = join(dir, 'report.json');
  const policy = { scopeId: 'fixture', accountingAsset: 'fixture:6', buybackBps: 1000 };
  Book.initialize(path, policy, { enabled: true });
  const read = () => { const b = new Book(path, policy, { enabled: true }); try { return b.read(); } finally { b.close(); } };
  const initial = read(); writeFileSync(config, JSON.stringify({ bookPath: path, bookId: initial.bookId, policy }));
  const run = (args, env = {}) => spawnSync(process.execPath, ['--import', loader, script, ...args], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, FORTUNE_REPORTED_PROFIT_ENABLED: 'true', FORTUNE_REPORTED_PROFIT_WRITE_ENABLED: 'true', ...env } });
  const cycle = (id, n, proceeds, cost) => ({ id, accountingAsset: 'fixture:6', receiptIds: [`97:0x${String(n).padStart(64, '0')}:0`], reconciled: true,
    inventoryDelta: '0', proceeds, purchaseCost: cost, costs: { gas: '1', bridge: '1', rebalance: '1', other: '1' } });
  return { dir, path, config, report, policy, initial, read, run, cycle, clean: () => rmSync(dir, { recursive: true, force: true }) };
}
test('operator CLI invokes actual book/reducer across losses, profit, historical retry and reopen', () => {
  const f = fixture(); try {
    let first, original;
    for (const [id, n, proceeds, cost] of [['loss', 1, '14', '30'], ['profit', 2, '124', '0']]) {
      const request = { expectedHead: f.read().head, cycle: f.cycle(id, n, proceeds, cost) };
      writeFileSync(f.report, JSON.stringify(request)); const r = f.run(['append', f.config, f.report]); assert.equal(r.status, 0, r.stderr);
      if (!first) { first = JSON.parse(r.stdout).result; original = request; }
    }
    const r = f.run(['read', f.config]); assert.equal(r.status, 0, r.stderr); const v = JSON.parse(r.stdout).observation;
    assert.equal(v.total, 2); assert.equal(v.modeledBuybackAllocation, '10'); assert.equal(v.modeledRetainedProfit, '90');
    assert.equal(v.realizedProfitVerified, false); assert.equal(v.executionAuthorized, false); assert.equal(v.currentAuthorization, null);
    writeFileSync(f.report, JSON.stringify(original)); const retry = f.run(['append', f.config, f.report]); assert.equal(retry.status, 0, retry.stderr);
    assert.deepEqual(JSON.parse(retry.stdout).result, { ...first, inserted: false }); assert.deepEqual(f.read(), v);
  } finally { f.clean(); }
});
test('disabled/write-disabled/missing and foreign identity commands cannot initialize or append', () => {
  const f = fixture(); try {
    const missing = join(f.dir, 'missing');
    for (const [args, env] of [[['append', missing, missing], { FORTUNE_REPORTED_PROFIT_ENABLED: 'false' }],
      [['append', f.config, missing], { FORTUNE_REPORTED_PROFIT_WRITE_ENABLED: 'false' }], [['read', missing], {}], [['read', f.config, 'extra'], {}]]) {
      const r = f.run(args, env); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.doesNotMatch(r.stderr, new RegExp(f.dir));
    }
    assert.equal(existsSync(missing), false);
    writeFileSync(f.config, JSON.stringify({ bookPath: f.path, bookId: 'a'.repeat(64), policy: f.policy }));
    assert.equal(f.run(['read', f.config]).status, 1); assert.equal(f.read().total, 0);
  } finally { f.clean(); }
});
test('bounded strict input and stale/duplicate reports reject without changing history', () => {
  const f = fixture(); try {
    const request = { expectedHead: f.initial.head, cycle: f.cycle('a', 1, '100', '0') };
    writeFileSync(f.report, JSON.stringify(request)); assert.equal(f.run(['append', f.config, f.report]).status, 0); const before = f.read();
    for (const report of ['x'.repeat(12289), Buffer.from([0xff]), JSON.stringify({ ...request, cycle: { ...request.cycle, proceeds: 100 } }),
      JSON.stringify({ ...request, cycle: f.cycle('b', 2, '100', '0') }), JSON.stringify({ ...request, expectedHead: before.head, cycle: f.cycle('b', 1, '100', '0') })]) {
      writeFileSync(f.report, report); const r = f.run(['append', f.config, f.report]); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.deepEqual(f.read(), before);
    }
  } finally { f.clean(); }
});
