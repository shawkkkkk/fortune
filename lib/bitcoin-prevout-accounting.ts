import { inspectBitcoinTransaction } from '@/lib/bitcoin-transaction';

const MAX_MONEY = 21000000n * 100000000n;

/** Exact arithmetic over supplied bytes only; never a UTXO, fee quote or validity attestation. */
export function inspectBitcoinPrevouts(raw: unknown, expectedTxid: unknown, previousTransactions: unknown) {
  const transaction = inspectBitcoinTransaction(raw, expectedTxid);
  if (!Array.isArray(previousTransactions) || !previousTransactions.length || previousTransactions.length > 128) throw Error('Parent bound');
  const required = new Set<string>(), seen = new Set<string>();
  for (const input of transaction.inputOutpoints) {
    // Null outpoints are coinbase/special inputs, not spendable supplied funding.
    if (input.txid === '0'.repeat(64) || input.outputIndex === 0xffffffff) throw Error('Unsupported outpoint');
    const id = `${input.txid}:${input.outputIndex}`;
    if (seen.has(id) || input.txid === transaction.txid) throw Error('Repeated or self input');
    seen.add(id); required.add(input.txid);
  }
  const parents = new Map<string, ReturnType<typeof inspectBitcoinTransaction>>();
  let bytes = 0;
  for (const entry of previousTransactions) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).sort().join(',') !== 'expectedTxid,rawTransaction'
      || typeof entry.rawTransaction !== 'string' || typeof entry.expectedTxid !== 'string') throw Error('Parent schema');
    bytes += entry.rawTransaction.length;
    // Aggregate hex-character bound, in addition to each parser's byte limits.
    if (bytes > 200256 || parents.has(entry.expectedTxid) || !required.has(entry.expectedTxid)) throw Error('Unexpected or oversized parents');
    const parent = inspectBitcoinTransaction(entry.rawTransaction, entry.expectedTxid);
    parents.set(parent.txid, parent);
  }
  if (parents.size !== required.size) throw Error('Missing parent');
  let total = 0n;
  const inputs = transaction.inputOutpoints.map(input => {
    const parent = parents.get(input.txid)!;
    const value = parent.outputValuesSats[input.outputIndex];
    if (value === undefined) throw Error('Missing parent output');
    total += BigInt(value);
    if (total > MAX_MONEY) throw Error('Input total bound');
    return { ...input, suppliedValueSats: value };
  });
  const outputTotal = BigInt(transaction.declaredOutputTotalSats);
  if (total < outputTotal) throw Error('Negative implied fee');
  return {
    schemaVersion: 1, source: 'local-supplied-bitcoin-prevouts', transaction,
    suppliedPrevoutAccounting: { inputs, parentCount: parents.size, inputTotalSats: total.toString(),
      outputTotalSats: outputTotal.toString(), impliedFeeSats: (total - outputTotal).toString(),
      impliedFeeRatePerSerializedVbyte: { numeratorSats: (total - outputTotal).toString(),
        denominatorVbytes: transaction.serializationSize.virtualBytes.toString() },
      parentTxidsMatchSuppliedBytes: true, allInputOutpointsResolved: true },
    inputValuesVerified: false, feesSats: null, feeRateSatsPerVbyte: null, mempoolPolicyVerified: false, utxoUnspentVerified: false, parentTransactionsVerified: false,
    coinbaseMaturityVerified: false, signaturesVerified: false, transactionVerified: false,
    networkVerified: false, inclusionVerified: false, finalityVerified: false,
    runeBalancesVerified: false, custodyVerified: false, bridgeBackingVerified: false,
    executionAuthorized: false, fullBitcoinRunesReadiness: false,
  };
}
