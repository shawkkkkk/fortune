import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectToken } from '../lib/project-canon.ts';
import { inspectLiquidityPosition, validateLiquidityPositionPolicy } from '../lib/managed-liquidity-position.ts';

function policyBytes(path) {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384) throw Error('Policy bound');
    const bytes = Buffer.alloc(16385); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size > 16384) throw Error('Policy bound');
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}
const exact = (v, fields) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === [...fields].sort().join(',');

/** Startup-pinned operator selection. No caller-controlled paths, projects or RPCs. */
export function projectLiquidityReader(config, clients) {
  const token = projectToken(config.token), path = config.policyPath, pinned = policyBytes(path);
  const policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pinned));
  if (!exact(policy, ['chainId','manager','factory','pool','token0','token1','fee','positionId','owner'])
    || typeof policy.positionId !== 'string'
    || ['manager','factory','pool','token0','token1'].some(k => !exact(policy[k], ['address','codeHash']))) throw Error('Literal LP policy required');
  validateLiquidityPositionPolicy(policy);
  if (![policy.token0.address, policy.token1.address].some(a => projectToken(a) === token)
    || !Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error('Project LP configuration');
  const readers = Object.freeze([...clients]);
  const policyHash = createHash('sha256').update(pinned).digest('hex');
  if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
  return async requestedToken => {
    if (projectToken(requestedToken) !== token || !pinned.equals(policyBytes(path))) throw Error('Project/policy changed');
    const position = await inspectLiquidityPosition(readers, policy);
    if (!pinned.equals(policyBytes(path))) throw Error('Policy changed');
    return Object.freeze({ source: 'operator-selected-project-liquidity-rpc-observation', projectToken: token,
      policyHash, position, projectCustodyVerified: false, independentProvidersVerified: false,
      currentAuthorization: null, fullManagedLiquidityReadiness: false, executionAuthorized: false });
  };
}
