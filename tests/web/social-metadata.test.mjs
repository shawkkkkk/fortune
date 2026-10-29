import test from 'node:test';
import assert from 'node:assert/strict';
import { readIdentityDetail } from '../../lib/social-fees-server.ts';
const addr = n => '0x' + n.toString(16).padStart(40, '0');
const id = '0x' + '01'.repeat(32);
function fixture(kind, decimals) {
  const identity = { identityId: id, tokenCount: kind === 'balance' ? 1 : 0, curveCount: kind === 'curve' ? 1 : 0 };
  const rpc = { async readContract({ functionName: f }) {
    if (f === 'tokensOf') return [addr(2)];
    if (f === 'curvesOf') return [addr(3)];
    if (f === 'owed' || f === 'claimable') return 1_234_567n;
    if (f === 'curveSharesOf') return [addr(2), [id], [10000]];
    if (f === 'state') return { phase: 0, creatorFeesOwed: 1_234_567n };
    if (f === 'launchToken') return addr(4);
    if (f === 'rescueCreatorClaims') return 0n;
    if (f === 'name' || f === 'symbol') return 'FIXTURE';
    if (f === 'decimals') { if (decimals instanceof Error) throw decimals; return decimals; }
    throw Error('Unexpected read');
  }};
  return { identity, rpc };
}
for (const kind of ['balance', 'curve']) {
  test(`social ${kind} never invents units after failed or malformed decimals`, async () => {
    for (const decimals of [new Error('RPC failure'), undefined, null, '6', true, -1, 256, 6.5, NaN]) {
      const { identity, rpc } = fixture(kind, decimals);
      await assert.rejects(readIdentityDetail(addr(1), identity, rpc));
    }
  });
  test(`social ${kind} preserves exact raw amounts and reported uint8 units`, async () => {
    for (const decimals of [0, 6, 18, 255]) {
      const { identity, rpc } = fixture(kind, decimals);
      const result = await readIdentityDetail(addr(1), identity, rpc);
      if (kind === 'balance') {
        assert.equal(result.balances[0].decimals, decimals);
        assert.equal(result.balances[0].owed, '1234567');
        assert.equal(result.balances[0].claimable, '1234567');
      } else {
        assert.equal(result.curves[0].pairDecimals, decimals);
        assert.equal(result.curves[0].uncollected, '1234567');
      }
    }
  });
}

test('actual viem HTTP/ABI reads preserve six-decimal balances and reject missing units', async () => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { createPublicClient, http, parseAbi, decodeFunctionData, encodeFunctionResult } = await import('viem');
  const { SOCIAL_FEE_VAULT_ABI } = await import('../../lib/custom-pairs-artifacts.ts');
  const abi = [...SOCIAL_FEE_VAULT_ABI, ...parseAbi(['function decimals() view returns(uint8)', 'function symbol() view returns(string)'])];
  let unavailable = false;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    try {
      assert.equal(message.method, 'eth_call');
      const { functionName } = decodeFunctionData({ abi, data: message.params[0].data });
      if (unavailable && functionName === 'decimals') throw Error('fixture unavailable');
      const values = { tokensOf: [addr(2)], owed: 1234567n, claimable: 1234567n, symbol: 'SIX', decimals: 6 };
      assert.ok(Object.hasOwn(values, functionName));
      const result = encodeFunctionResult({ abi, functionName, result: values[functionName] });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    } catch {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Unavailable' } }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const rpc = createPublicClient({ transport: http(`http://127.0.0.1:${server.address().port}`, { retryCount: 0, timeout: 1000 }) });
    const { identity } = fixture('balance', 6);
    const result = await readIdentityDetail(addr(1), identity, rpc);
    assert.equal(result.balances[0].decimals, 6);
    assert.equal(result.balances[0].claimable, '1234567');
    unavailable = true;
    await assert.rejects(readIdentityDetail(addr(1), identity, rpc));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
