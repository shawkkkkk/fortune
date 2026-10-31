// Offline interpretation of supplied output scripts, pinned to ord's decoder.
// This does not validate a Bitcoin transaction, etching, mint or bridge backing.
export const RUNESTONE_SOURCE = 'ordinals/ord@b7ccfcf6e1b4f47cb578cb43997c37a4f9f16414';
const U128 = (1n << 128n) - 1n, U64 = (1n << 64n) - 1n, U32 = (1n << 32n) - 1n;
const MAX_BYTES = 65536, MAX_INTEGERS = 8192;
type Flaw = 'invalid-script' | 'opcode' | 'varint' | 'truncated-field' | 'trailing-integers'
  | 'edict-rune-id' | 'edict-output' | 'supply-overflow' | 'unrecognized-flag' | 'unrecognized-even-tag';
type Id = { block: bigint; tx: bigint };
type Terms = { cap: bigint | null; amount: bigint | null; height: [bigint | null, bigint | null]; offset: [bigint | null, bigint | null] };
type Etching = { divisibility: bigint | null; premine: bigint | null; rune: bigint | null; spacers: bigint | null; symbol: string | null; terms: Terms | null; turbo: boolean };

function runeId(block: bigint, tx: bigint): Id | null {
  return block <= U64 && tx <= U32 && !(block === 0n && tx > 0n) ? { block, tx } : null;
}

function payload(script: Uint8Array): Uint8Array | Flaw {
  const chunks: Uint8Array[] = []; let length = 0;
  for (let i = 2; i < script.length;) {
    const opcode = script[i++]; let size = opcode;
    if (opcode >= 76 && opcode <= 78) {
      const width = 1 << (opcode - 76);
      if (i + width > script.length) return 'invalid-script';
      size = 0;
      for (let j = 0; j < width; j++) size += script[i++] * 2 ** (8 * j);
    } else if (opcode > 75) return 'opcode';
    if (size > script.length - i) return 'invalid-script';
    chunks.push(script.subarray(i, i + size)); length += size; i += size;
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function integers(bytes: Uint8Array): bigint[] | 'varint' {
  const result: bigint[] = [];
  for (let offset = 0; offset < bytes.length;) {
    let value = 0n, terminated = false;
    for (let i = 0; offset < bytes.length; i++) {
      const byte = bytes[offset++];
      if (i > 18 || (i === 18 && (byte & 124) !== 0)) return 'varint';
      value |= BigInt(byte & 127) << BigInt(7 * i);
      if ((byte & 128) === 0) { terminated = true; break; }
    }
    if (!terminated) return 'varint';
    if (result.length === MAX_INTEGERS) throw Error('Runestone integer bound');
    result.push(value);
  }
  return result;
}

function decipher(values: bigint[], outputCount: number) {
  const fields = new Map<bigint, bigint[]>();
  const edicts: { id: Id; amount: bigint; output: bigint }[] = [];
  let flaw: Flaw | null = null;
  for (let i = 0; i < values.length; i += 2) {
    const tag = values[i];
    if (tag === 0n) {
      let previous: Id = { block: 0n, tx: 0n };
      for (let j = i + 1; j < values.length; j += 4) {
        if (j + 4 > values.length) { flaw = 'trailing-integers'; break; }
        const [blockDelta, txDelta, amount, output] = values.slice(j, j + 4);
        const next = runeId(previous.block + blockDelta, blockDelta === 0n ? previous.tx + txDelta : txDelta);
        if (!next) { flaw = 'edict-rune-id'; break; }
        // Equality is ord's distribute-to-all-non-OP_RETURN-outputs sentinel.
        if (output > U32 || output > BigInt(outputCount)) { flaw = 'edict-output'; break; }
        edicts.push({ id: next, amount, output }); previous = next;
      }
      break;
    }
    if (i + 1 === values.length) { flaw = 'truncated-field'; break; }
    const list = fields.get(tag) ?? []; list.push(values[i + 1]); fields.set(tag, list);
  }
  // Invalid recognized fields stay unconsumed, matching ord's Tag::take.
  function take<T>(tag: bigint, count: number, convert: (v: bigint[]) => T | null): T | null {
    const list = fields.get(tag);
    if (!list || list.length < count) return null;
    const value = convert(list.slice(0, count));
    if (value !== null) { list.splice(0, count); if (!list.length) fields.delete(tag); }
    return value;
  }
  const one = (tag: bigint, max = U128) => take(tag, 1, ([v]) => v <= max ? v : null);
  let flags = one(2n) ?? 0n;
  const flag = (mask: bigint) => { const present = (flags & mask) !== 0n; flags &= ~mask; return present; };
  let etching: Etching | null = null;
  if (flag(1n)) {
    const divisibility = one(1n, 38n), premine = one(6n), rune = one(4n), spacers = one(3n, 0x7ffffffn);
    const symbol = take(5n, 1, ([v]) => v <= 0x10ffffn && !(v >= 0xd800n && v <= 0xdfffn) ? String.fromCodePoint(Number(v)) : null);
    const terms: Terms | null = flag(2n) ? {
      cap: one(8n), height: [one(12n, U64), one(14n, U64)], amount: one(10n), offset: [one(16n, U64), one(18n, U64)],
    } : null;
    etching = { divisibility, premine, rune, spacers, symbol, terms, turbo: flag(4n) };
  }
  const mint = take(20n, 2, ([block, tx]) => runeId(block, tx));
  const pointer = take(22n, 1, ([v]) => v <= U32 && v < BigInt(outputCount) ? v : null);
  if (etching && (etching.premine ?? 0n) + (etching.terms?.cap ?? 0n) * (etching.terms?.amount ?? 0n) > U128) flaw ??= 'supply-overflow';
  if (flags !== 0n) flaw ??= 'unrecognized-flag';
  if ([...fields.keys()].some(tag => tag % 2n === 0n)) flaw ??= 'unrecognized-even-tag';
  return flaw ? { kind: 'cenotaph', flaw, mint, etchingRune: etching?.rune ?? null }
    : { kind: 'runestone', edicts, etching, mint, pointer };
}

/** All ordered output scripts must be supplied; no transaction parsing or index lookup. */
export function inspectRunestoneScripts(outputScripts: unknown) {
  if (!Array.isArray(outputScripts) || outputScripts.length > 128) throw Error('Runestone output bound');
  let size = 0;
  const scripts: Uint8Array[] = [];
  for (const script of outputScripts) {
    if (typeof script !== 'string' || script.length > 2 + MAX_BYTES * 2 || !/^0x(?:[0-9a-fA-F]{2})*$/.test(script)) throw Error('Runestone script hex');
    size += (script.length - 2) / 2;
    if (size > MAX_BYTES) throw Error('Runestone byte bound');
    scripts.push(Uint8Array.from(script.slice(2).match(/../g) ?? [], byte => parseInt(byte, 16)));
  }
  const outputIndex = scripts.findIndex(script => script[0] === 0x6a && script[1] === 0x5d);
  let artifact: object = { kind: 'none' };
  if (outputIndex >= 0) {
    const bytes = payload(scripts[outputIndex]);
    const decoded = typeof bytes === 'string' ? bytes : integers(bytes);
    artifact = typeof decoded === 'string' ? { kind: 'cenotaph', flaw: decoded, mint: null, etchingRune: null }
      : decipher(decoded, scripts.length);
  }
  // Every protocol integer remains exact decimal text, including u128 amounts.
  const jsonArtifact: object = JSON.parse(JSON.stringify(artifact, (_, v) => typeof v === 'bigint' ? v.toString() : v));
  return {
    schemaVersion: 1, source: 'local-supplied-bitcoin-output-scripts', decoderSource: RUNESTONE_SOURCE,
    outputCount: scripts.length, outputIndex: outputIndex < 0 ? null : outputIndex, artifact: jsonArtifact,
    transactionVerified: false, outputListCompletenessVerified: false, networkVerified: false,
    etchingAccepted: false, mintAccepted: false, balancesVerified: false, finalityVerified: false,
    custodyVerified: false, bridgeBackingVerified: false, executionAuthorized: false, fullBitcoinRunesReadiness: false,
  };
}
