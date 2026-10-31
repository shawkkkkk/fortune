import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectRunestoneScripts, RUNESTONE_SOURCE } from '../../lib/bitcoin-runestone.ts';

const U128 = (1n << 128n) - 1n, U64 = (1n << 64n) - 1n, U32 = (1n << 32n) - 1n;
const hex = bytes => `0x${Buffer.from(bytes).toString('hex')}`;
// Test encoder uses division/remainder, separately from the decoder's shifts.
function encode(n) { const b = []; do { const q = n / 128n; b.push(Number(n % 128n) + (q ? 128 : 0)); n = q; } while (n); return b; }
function push(bytes, width = 0) {
  if (!width && bytes.length <= 75) return [bytes.length, ...bytes];
  width ||= bytes.length <= 255 ? 1 : 2;
  return [width === 1 ? 76 : width === 2 ? 77 : 78, ...Array.from({ length: width }, (_, i) => Math.floor(bytes.length / 2 ** (8 * i)) % 256), ...bytes];
}
const script = values => hex([106, 93, ...push(values.flatMap(v => encode(BigInt(v))))]);
const read = (values, count = 1) => inspectRunestoneScripts([script(values), ...Array(count - 1).fill('0x51')]).artifact;
const cenotaph = (values, flaw, count = 1) => assert.equal(read(values, count).flaw, flaw);

test('Runestone literal byte vectors independently cover pinned ord decoder examples', () => {
  // Adapted inputs/expectations from pinned runestone.rs/varint.rs tests;
  // these literals do not use this suite's encoder or claim Rust differential execution.
  const empty = { kind: 'runestone', edicts: [], etching: null, mint: null, pointer: null };
  for (const [bytes, expected] of [
    ['0x6a5d', empty],
    ['0x6a5d0400010102', { kind: 'cenotaph', flaw: 'trailing-integers', mint: null, etchingRune: null }],
    ['0x6a5d050001010200', { ...empty, edicts: [{ id: { block: '1', tx: '1' }, amount: '2', output: '0' }] }],
    ['0x6a5d0414011401', { ...empty, mint: { block: '1', tx: '1' } }],
    ['0x6a5d021401', { kind: 'cenotaph', flaw: 'unrecognized-even-tag', mint: null, etchingRune: null }],
    ['0x6a5d020202', { kind: 'cenotaph', flaw: 'unrecognized-flag', mint: null, etchingRune: null }],
    ['0x6a5d027f00', empty],
    ['0x6a5d027e00', { kind: 'cenotaph', flaw: 'unrecognized-even-tag', mint: null, etchingRune: null }],
    ['0x6a5d0180', { kind: 'cenotaph', flaw: 'varint', mint: null, etchingRune: null }],
  ]) assert.deepEqual(inspectRunestoneScripts([bytes]).artifact, expected, bytes);
});

test('Runestone first matching output wins, including malformed payload; prefix is an opcode', () => {
  for (const outputs of [[], ['0x'], ['0x6a'], ['0x6a015d'], ['0x016a5d'], ['0x6a4c']]) {
    assert.deepEqual(inspectRunestoneScripts(outputs).artifact, { kind: 'none' });
  }
  const r = inspectRunestoneScripts(['0x6a4c', '0x6a5d', script([20, 1, 20, 2])]);
  assert.equal(r.outputIndex, 1); assert.deepEqual(r.artifact, { kind: 'runestone', edicts: [], etching: null, mint: null, pointer: null });
  assert.equal(inspectRunestoneScripts(['0x6a5d51', '0x6a5d']).artifact.flaw, 'opcode');
  assert.equal(inspectRunestoneScripts(['0x6a5d4c', '0x6a5d']).artifact.flaw, 'invalid-script');
});

test('Runestone pushdata concatenation crosses varints; nonminimal pushes and OP_0 follow ord', () => {
  const expected = read([20, 128, 20, 1]);
  const bytes = [20, 128, 1, 20, 1];
  for (const width of [0, 1, 2, 4]) {
    assert.deepEqual(inspectRunestoneScripts([hex([106, 93, 0, ...push(bytes.slice(0, 2), width), ...push(bytes.slice(2), width)])]).artifact, expected);
  }
  for (const tail of [[76], [77, 1], [78, 0, 0, 0], [78, 255, 255, 255, 255], [2, 1], [76, 4, 0]]) {
    assert.equal(inspectRunestoneScripts([hex([106, 93, ...tail])]).artifact.flaw, 'invalid-script');
  }
  for (const opcode of [79, 81, 93, 106, 118, 255]) assert.equal(inspectRunestoneScripts([hex([106, 93, opcode])]).artifact.flaw, 'opcode');
});

test('Runestone lossless u128 varints: maximum, 19-byte nonminimal zero, overflow, overlong, unterminated', () => {
  assert.equal(read([2, 1, 6, U128]).etching.premine, U128.toString());
  for (const bytes of [[128], [...Array(18).fill(128), 4], [...Array(19).fill(128), 0]]) {
    assert.equal(inspectRunestoneScripts([hex([106, 93, ...push(bytes)])]).artifact.flaw, 'varint');
  }
  const nonminimal = [2, 1, 6, ...Array(18).fill(128), 0];
  assert.equal(inspectRunestoneScripts([hex([106, 93, ...push(nonminimal)])]).artifact.etching.premine, '0');
  for (let bit = 0; bit < 128; bit++) assert.equal(read([2, 1, 6, 1n << BigInt(bit)]).etching.premine, (1n << BigInt(bit)).toString());
  let state = 11n;
  for (let i = 0; i < 256; i++) { state = (state * 6364136223846793005n + 1442695040888963407n) & U128; assert.equal(read([2, 1, 6, state]).etching.premine, state.toString()); }
});

test('Runestone pinned upstream tag/flag cases preserve invalid/duplicate even fields and ignored odd fields', () => {
  assert.equal(read([127, 9, 1, 255]).kind, 'runestone');
  cenotaph([126, 0], 'unrecognized-even-tag'); cenotaph([2, 2], 'unrecognized-flag');
  cenotaph([2, 8], 'unrecognized-flag'); cenotaph([2, 1n << 127n], 'unrecognized-flag');
  cenotaph([4, 1], 'unrecognized-even-tag'); cenotaph([2, 0, 2, 0], 'unrecognized-even-tag');
  cenotaph([2, 1, 4, 1, 4, 2], 'unrecognized-even-tag');
  cenotaph([20, 1], 'unrecognized-even-tag'); cenotaph([20, 0, 20, 1], 'unrecognized-even-tag');
  cenotaph([22, 1], 'unrecognized-even-tag');
  assert.equal(read([22, 1], 2).pointer, '1');
  cenotaph([127], 'truncated-field'); cenotaph([0, 1, 0], 'trailing-integers');
  // Message flaws take precedence over subsequent flag/field flaws.
  cenotaph([2, 8, 0, 1], 'trailing-integers');
});

test('Runestone etching fields and terms use exact widths, scalar symbols and checked supply', () => {
  const a = read([2, 7, 4, U128, 1, 38, 3, 0x7ffffff, 5, 0x1f408, 6, 1000, 8, 10, 10, 100, 12, U64, 14, 5, 16, 2, 18, 9]);
  assert.equal(a.kind, 'runestone');
  assert.deepEqual(a.etching, { rune: U128.toString(), divisibility: '38', spacers: '134217727', symbol: '🐈', premine: '1000', turbo: true,
    terms: { cap: '10', amount: '100', height: [U64.toString(), '5'], offset: ['2', '9'] } });
  for (const [tag, value, field] of [[1, 39, 'divisibility'], [3, 0x8000000, 'spacers'], [5, 0xd800, 'symbol'], [5, 0x110000, 'symbol']]) {
    const r = read([2, 1, tag, value]); assert.equal(r.kind, 'runestone'); assert.equal(r.etching[field], null);
  }
  cenotaph([2, 3, 12, U64 + 1n], 'unrecognized-even-tag');
  cenotaph([2, 3, 6, U128, 8, 1, 10, 1], 'supply-overflow');
  cenotaph([2, 3, 8, U128, 10, 2], 'supply-overflow');
  assert.equal(read([2, 3, 8, U128, 10, 1]).kind, 'runestone');
  const c = read([2, 1, 4, 9, 20, 1, 20, 2, 126, 0]);
  assert.deepEqual(c, { kind: 'cenotaph', flaw: 'unrecognized-even-tag', mint: { block: '1', tx: '2' }, etchingRune: '9' });
});

test('Runestone delta edicts enforce u64/u32 IDs, zero-block rule and output sentinel', () => {
  assert.deepEqual(read([0, 1, 1, U128, 0, 0, 2, 0, 1, 1, 0, 3, 2], 2).edicts, [
    { id: { block: '1', tx: '1' }, amount: U128.toString(), output: '0' },
    { id: { block: '1', tx: '3' }, amount: '0', output: '1' },
    { id: { block: '2', tx: '0' }, amount: '3', output: '2' },
  ]);
  cenotaph([0, 0, 1, 1, 0], 'edict-rune-id');
  cenotaph([0, U64, 0, 1, 0, 1, 0, 1, 0], 'edict-rune-id');
  cenotaph([0, 1, U32, 1, 0, 0, 1, 1, 0], 'edict-rune-id');
  cenotaph([0, 1, U32 + 1n, 1, 0], 'edict-rune-id');
  cenotaph([0, 1, 1, 1, 2], 'edict-output'); cenotaph([0, 1, 1, 1, U32 + 1n], 'edict-output');
  assert.equal(read([20, U64, 20, U32]).mint.block, U64.toString());
  cenotaph([20, U64 + 1n, 20, 0], 'unrecognized-even-tag');
});

test('Runestone application bounds reject unsupported inputs instead of claiming protocol cenotaph', () => {
  for (const value of [null, {}, '0x6a5d', Array(129).fill('0x'), [null], ['6a5d'], ['0x0'], ['0xgg'], Array(1)]) assert.throws(() => inspectRunestoneScripts(value));
  assert.throws(() => inspectRunestoneScripts([`0x${'00'.repeat(65537)}`]));
  assert.throws(() => inspectRunestoneScripts([`0x${'00'.repeat(32768)}`, `0x${'00'.repeat(32769)}`]));
  assert.equal(inspectRunestoneScripts([`0x${'00'.repeat(65536)}`]).artifact.kind, 'none');
  assert.throws(() => inspectRunestoneScripts([hex([106, 93, ...push(Array(8193).fill(0))])]));
  assert.equal(inspectRunestoneScripts([hex([106, 93, ...push(Array(8192).fill(0))])]).artifact.flaw, 'trailing-integers');
});

test('Runestone inspection never claims transaction, completeness, network, acceptance or financial authority', () => {
  for (const outputs of [[], ['0x6a5d'], ['0x6a5d51']]) {
    const r = inspectRunestoneScripts(outputs);
    assert.equal(r.decoderSource, RUNESTONE_SOURCE);
    for (const field of ['transactionVerified', 'outputListCompletenessVerified', 'networkVerified', 'etchingAccepted', 'mintAccepted', 'balancesVerified', 'finalityVerified', 'custodyVerified', 'bridgeBackingVerified', 'executionAuthorized', 'fullBitcoinRunesReadiness']) assert.equal(r[field], false);
    assert.doesNotThrow(() => JSON.stringify(r));
  }
});

test('Runestone actual operator CLI consumes bounded local JSON, remains disabled and emits private errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fortune-runestone-'));
  const file = join(dir, 'scripts.json');
  const run = (path, enabled = 'true') => spawnSync(process.execPath, ['--import', './scripts/register-ts.mjs', 'scripts/inspect-runestone.mjs', path], {
    cwd: process.cwd(), env: { ...process.env, FORTUNE_RUNESTONE_DECODE_ENABLED: enabled }, encoding: 'utf8', timeout: 5000,
  });
  try {
    writeFileSync(file, JSON.stringify({ outputScripts: ['0x6a5d0414011402', '0x51'] }));
    const r = run(file); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, '');
    const data = JSON.parse(r.stdout); assert.equal(data.artifact.mint.block, '1'); assert.equal(data.executionAuthorized, false);
    for (const args of [[file, 'false'], [join(dir, 'SECRET_MISSING')], [dir]]) {
      const failed = run(...args); assert.equal(failed.status, 1); assert.equal(failed.stdout, ''); assert.equal(failed.stderr, 'Runestone inspection unavailable.\n');
    }
    for (const bytes of [Buffer.from('{"outputScripts":[],"extra":1}'), Buffer.from([0xff]), Buffer.alloc(196609, 32), Buffer.from('{')]) {
      writeFileSync(file, bytes); const failed = run(file); assert.equal(failed.status, 1); assert.equal(failed.stdout, ''); assert.equal(failed.stderr, 'Runestone inspection unavailable.\n');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
