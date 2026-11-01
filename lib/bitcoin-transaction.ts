import { createHash } from 'node:crypto';
import { inspectRunestoneScripts } from '@/lib/bitcoin-runestone';

const MAX_BYTES = 100000;
const MAX_MONEY = 21000000n * 100000000n;
const hash = (b: Buffer) => createHash('sha256').update(createHash('sha256').update(b).digest()).digest().reverse().toString('hex');

/** Offline bounded serialization inspection, not consensus or UTXO validation. */
export function inspectBitcoinTransaction(raw: unknown, expectedTxid: unknown) {
  if (typeof raw !== 'string' || raw.length > 2 + MAX_BYTES * 2 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(raw)
    || typeof expectedTxid !== 'string' || !/^[0-9a-f]{64}$/.test(expectedTxid)) throw Error('Transaction input');
  const bytes = Buffer.from(raw.slice(2), 'hex'); let offset = 0;
  function read(n: number) {
    if (!Number.isSafeInteger(n) || n < 0 || n > bytes.length - offset) throw Error('Truncated transaction');
    const b = bytes.subarray(offset, offset + n); offset += n; return b;
  }
  function compact(max: number): number {
    const prefix = read(1)[0];
    const n = prefix < 253 ? BigInt(prefix) : prefix === 253 ? BigInt(read(2).readUInt16LE())
      : prefix === 254 ? BigInt(read(4).readUInt32LE()) : read(8).readBigUInt64LE();
    if ((prefix === 253 && n < 253n) || (prefix === 254 && n <= 65535n) || (prefix === 255 && n <= 4294967295n)
      || n > BigInt(max)) throw Error('CompactSize bound or noncanonical encoding');
    return Number(n);
  }
  const versionBytes = read(4), version = versionBytes.readInt32LE();
  let witness = false;
  if (bytes[offset] === 0) { read(1); if (read(1)[0] !== 1) throw Error('Witness flags'); witness = true; }
  const baseStart = offset;
  const inputCount = compact(128); if (!inputCount) throw Error('Empty inputs');
  const inputOutpoints: { txid: string; outputIndex: number }[] = [];
  for (let i = 0; i < inputCount; i++) {
    inputOutpoints.push({ txid: Buffer.from(read(32)).reverse().toString('hex'), outputIndex: read(4).readUInt32LE() });
    read(compact(10000)); read(4);
  }
  const outputCount = compact(128); if (!outputCount) throw Error('Empty outputs');
  const scripts: string[] = [], values: string[] = []; let total = 0n;
  for (let i = 0; i < outputCount; i++) {
    const value = read(8).readBigInt64LE(); total += value;
    if (value < 0n || value > MAX_MONEY || total > MAX_MONEY) throw Error('Output value');
    values.push(value.toString()); scripts.push('0x' + read(compact(10000)).toString('hex'));
  }
  const baseEnd = offset;
  if (witness) {
    let present = false;
    for (let i = 0; i < inputCount; i++) {
      const count = compact(1024); present ||= count > 0;
      for (let j = 0; j < count; j++) read(compact(MAX_BYTES));
    }
    if (!present) throw Error('Superfluous witness');
  }
  const lockBytes = read(4), lockTime = lockBytes.readUInt32LE();
  if (offset !== bytes.length) throw Error('Trailing transaction bytes');
  const stripped = witness ? Buffer.concat([versionBytes, bytes.subarray(baseStart, baseEnd), lockBytes]) : bytes;
  const txid = hash(stripped), wtxid = hash(bytes);
  if (txid !== expectedTxid) throw Error('Transaction ID mismatch');
  // Serialized BIP141 dimensions only; no script/sigop or relay-policy evaluation.
  const weightUnits = stripped.length * 3 + bytes.length;
  const serializationSize = { baseBytes: stripped.length, witnessRelatedBytes: bytes.length - stripped.length,
    weightUnits, virtualBytes: Math.ceil(weightUnits / 4), sigopAdjustedVirtualBytes: null };
  return {
    schemaVersion: 1, source: 'local-supplied-bitcoin-transaction', txid, wtxid,
    serializedTxidMatches: true, outputScriptsBoundToSuppliedBytes: true,
    version, lockTime, inputCount, inputOutpoints, outputCount, hasWitness: witness, byteLength: bytes.length, serializationSize,
    outputValuesSats: values, declaredOutputTotalSats: total.toString(),
    runestone: inspectRunestoneScripts(scripts),
    transactionVerified: false, networkVerified: false, inclusionVerified: false, finalityVerified: false,
    inputValuesVerified: false, feesSats: null, feeRateSatsPerVbyte: null, signaturesVerified: false, runeBalancesVerified: false,
    etchingAccepted: false, mintAccepted: false, custodyVerified: false, bridgeBackingVerified: false,
    executionAuthorized: false, fullBitcoinRunesReadiness: false,
  };
}
