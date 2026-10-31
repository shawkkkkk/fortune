import { createHash } from 'node:crypto';
import { inspectBitcoinTransaction } from '@/lib/bitcoin-transaction';

const HASH = /^[0-9a-f]{64}$/;
const doubleHash = (bytes: Buffer) => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
const display = (bytes: Buffer) => Buffer.from(bytes).reverse().toString('hex');
const internal = (value: unknown) => {
  if (typeof value !== 'string' || !HASH.test(value)) throw Error('Merkle hash');
  return Buffer.from(value, 'hex').reverse();
};

/** A path to caller-supplied header bytes, never a trusted Bitcoin chain proof. */
export function inspectBitcoinMerkleObservation(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Merkle request');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'expectedBlockHash,expectedTxid,headerHex,rawTransaction,siblings,transactionCount,transactionIndex') throw Error('Merkle schema');
  if (typeof v.headerHex !== 'string' || !/^0x[0-9a-fA-F]{160}$/.test(v.headerHex)) throw Error('Header bytes');
  const header = Buffer.from(v.headerHex.slice(2), 'hex');
  const expectedBlockHash = internal(v.expectedBlockHash);
  const actualBlockHash = doubleHash(header);
  if (!actualBlockHash.equals(expectedBlockHash)) throw Error('Header hash mismatch');
  const count = v.transactionCount, index = v.transactionIndex;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 1000000
    || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= count
    || !Array.isArray(v.siblings) || v.siblings.length > 32) throw Error('Merkle bounds');
  let depth = 0;
  for (let width = count; width > 1; width = Math.ceil(width / 2)) depth++;
  if (v.siblings.length !== depth) throw Error('Merkle depth');
  const siblings = v.siblings.map(internal);
  // Consume the actual bounded transaction parser and existing Runestone engine.
  const transaction = inspectBitcoinTransaction(v.rawTransaction, v.expectedTxid);
  let current = internal(transaction.txid), position = index, width = count;
  for (const sibling of siblings) {
    const missingRightSibling = position % 2 === 0 && position + 1 === width;
    if (missingRightSibling) {
      if (!sibling.equals(current)) throw Error('Odd-width duplicate mismatch');
    } else if (sibling.equals(current)) {
      // Detect visible duplicated pairs, not mutations hidden in other subtrees.
      throw Error('Duplicated pair on path');
    }
    current = doubleHash(position % 2 ? Buffer.concat([sibling, current]) : Buffer.concat([current, sibling]));
    position = Math.floor(position / 2); width = Math.ceil(width / 2);
  }
  if (!current.equals(header.subarray(36, 68))) throw Error('Merkle root mismatch');
  return {
    schemaVersion: 1, source: 'local-supplied-bitcoin-header-and-path',
    blockHash: display(actualBlockHash), merkleRoot: display(current),
    headerVersion: header.readInt32LE(0), previousBlockHash: display(header.subarray(4, 36)),
    headerTimestamp: header.readUInt32LE(68), compactTargetHex: '0x' + header.readUInt32LE(72).toString(16).padStart(8, '0'),
    nonce: header.readUInt32LE(76), claimedTransactionCount: count, claimedTransactionIndex: index,
    headerHashMatches: true, merklePathMatchesSuppliedHeader: true, transaction,
    headerTrusted: false, proofOfWorkVerified: false, canonicalChainVerified: false,
    transactionCountVerified: false, wholeTreeMutationChecked: false, witnessCommitmentVerified: false,
    transactionVerified: false, inclusionVerified: false, networkVerified: false, finalityVerified: false,
    custodyVerified: false, bridgeBackingVerified: false, executionAuthorized: false, fullBitcoinRunesReadiness: false,
  };
}
