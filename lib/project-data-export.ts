import { createHash } from 'node:crypto';
import { projectSnapshot } from '@/lib/project-snapshot';
import { projectToken } from '@/lib/project-canon';

/** Public API observation only. The digest identifies bytes; it authenticates nobody. */
export function projectDataExport(value: unknown, token: string, now = Date.now()) {
  token = projectToken(token);
  const snapshot = projectSnapshot(value, token, now);
  const payloadUtf8 = JSON.stringify({
    schemaVersion: 1, source: 'Fortune public project API attestation',
    sourceUrl: `https://fortunepad.fun/api/public/v1/tokens/${token}/project`,
    apiTimestamp: snapshot.canon.provenance.apiTimestamp,
    market: snapshot.market, treasuryBalance: null,
    limitations: snapshot.limitations,
  });
  if (Buffer.byteLength(payloadUtf8, 'utf8') > 16384) throw Error('Export bound');
  return { schemaVersion: 1, kind: 'fortune-project-data-export',
    encoding: 'UTF-8', digestAlgorithm: 'SHA-256', payloadUtf8,
    sha256: createHash('sha256').update(payloadUtf8, 'utf8').digest('hex'),
    sourceAuthenticated: false, independentRpcVerified: false, finalityVerified: false,
    currentAuthorization: null, executionAuthorized: false,
    integrityScope: 'SHA-256 identifies the exact UTF-8 payload string only. Anyone can rewrite the payload and recompute it. No signature, source authentication, independent RPC, canonicality, finality, audit or execution approval.',
  };
}
