import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { encodeAbiParameters, keccak256, pad } from 'viem';
import { inspectOmnichainRoute, encodeRouteUln, EXECUTOR_PARAMETERS } from '../../lib/omnichain-route.ts';
const a = n => '0x' + n.toString(16).padStart(40, '0'), h = n => '0x' + n.toString(16).padStart(64, '0');
const snapshotTime = BigInt(Math.floor(Date.now() / 1000));
const code = '0x6001600055', pin = n => ({ address: a(n), codeHash: keccak256(code) });
function policy() {
  const uln = () => ({ confirmations: '20', required: [pin(10)], optional: [], threshold: 0 });
  return { manifestHash: h(1), globalSupplyCap: '3000000000000000000', networks: [97, 84532].map((chainId, i) => ({
    chainId, eid: 40001 + i, token: pin(1), endpoint: pin(2), sendLibrary: pin(3), receiveLibrary: pin(4),
    owner: a(8), delegate: a(9), initialAllocation: String(BigInt(i + 1) * 10n ** 18n), executor: pin(5), maxMessageSize: 10000, send: uln(), receive: uln(),
  })) };
}
function fixture(p, i, alter = () => undefined) {
  const n = p.networks[i], remote = p.networks[1 - i]; let reads = 0;
  return {
    async getChainId() { return n.chainId; }, async getBlockNumber() { return 140n; },
    async getBlock({ blockNumber }) { assert.equal(blockNumber, 120n); return { number: blockNumber, hash: h(120 + i), timestamp: snapshotTime }; },
    async getCode({ blockNumber }) { assert.equal(blockNumber, 120n); return code; },
    async readContract({ address, functionName: f, args, blockNumber }) {
      assert.equal(blockNumber, 120n); reads++;
      const override = alter({ f, args, address, reads }); if (override !== undefined) return override;
      if (f === 'deploymentChainId') return BigInt(n.chainId);
      if (f === 'globalSupplyCap') return BigInt(p.globalSupplyCap);
      if (f === 'initialAllocation' || f === 'totalSupply') return BigInt(n.initialAllocation);
      if (f === 'permanentlyBurned') return 0n;
      if (f === 'launchManifestHash') return p.manifestHash;
      if (f === 'endpoint') return n.endpoint.address;
      if (f === 'owner') return n.owner;
      if (f === 'decimals') return 18; if (f === 'sharedDecimals') return 6; if (f === 'decimalConversionRate') return 10n ** 12n;
      if (f === 'bridgeEnabled' || f === 'isDefaultSendLibrary') return false;
      if (f === 'peerCount') return 1n; if (f === 'peers') { assert.deepEqual(args, [remote.eid]); return pad(remote.token.address); }
      if (f === 'eid') return n.eid; if (f === 'delegates') return n.delegate;
      if (f === 'isRegisteredLibrary' || f === 'isSupportedEid') return true;
      if (f === 'getSendLibrary') return n.sendLibrary.address; if (f === 'getReceiveLibrary') return [n.receiveLibrary.address, false];
      if (f === 'receiveLibraryTimeout') return [a(0), 0n];
      if (f === 'getConfig') return args[3] === 1 ? encodeAbiParameters(EXECUTOR_PARAMETERS, [{ maxMessageSize: n.maxMessageSize, executor: n.executor.address }]) : encodeRouteUln(address === n.endpoint.address && args[1] === n.sendLibrary.address ? n.send : n.receive);
      if (f === 'getAppUlnConfig') { const u = address === n.sendLibrary.address ? n.send : n.receive; return { confirmations: BigInt(u.confirmations), requiredDVNCount: u.required.length, optionalDVNCount: u.optional.length || 255, optionalDVNThreshold: u.threshold, requiredDVNs: u.required.map(v => v.address), optionalDVNs: u.optional.map(v => v.address) }; }
      if (f === 'executorConfigs') return [n.maxMessageSize, n.executor.address];
      throw Error('Unexpected RPC');
    },
  };
}
const clients = (p, alter) => p.networks.map((_, i) => [fixture(p, i, alter), fixture(p, i, alter)]);
test('paused route compares both chain identities, EIDs, raw/effective ULN and executor without granting readiness', async () => {
  const p = policy(); const r = await inspectOmnichainRoute(clients(p), p);
  assert.equal(r.configurationMatches, true); assert.equal(r.networks[0].eid, 40001); assert.equal(r.networks[1].chainId, 84532);
  for (const flag of ['executionAuthorized', 'securityReadiness', 'routeDeliveryVerified', 'globalSupplyReconciled', 'independentProvidersVerified']) assert.equal(r[flag], false);
  assert.equal(r.networks[0].bridgeEnabled, false); assert.ok(Object.isFrozen(r));
  const optional = policy(); optional.networks.forEach(n => { n.send.optional = [pin(11)]; n.send.threshold = 1; });
  assert.equal((await inspectOmnichainRoute(clients(optional), optional)).configurationMatches, true);
});
test('route preflight rejects invalid genesis/network/security policy before any network work', async () => {
  for (const change of [p => p.networks[0].chainId = 56, p => p.networks[1].chainId = 97, p => p.networks[1].eid = 40001,
    p => p.networks[0].initialAllocation = '0', p => p.globalSupplyCap = '1', p => p.networks[0].send.confirmations = '0',
    p => p.networks[0].send.required = [], p => p.networks[0].send.required = [pin(11), pin(10)], p => p.networks[0].send.optional = [pin(10)],
    p => p.networks[0].delegate = a(0), p => p.networks[0].maxMessageSize = 39]) {
    const p = policy(); change(p); await assert.rejects(inspectOmnichainRoute([[{}, {}], [{}, {}]], p));
  }
  const p = policy(), c = clients(p); c[1][1] = c[0][0]; await assert.rejects(inspectOmnichainRoute(c, p), /distinct/);
});
test('wrong peer, authority, enabled bridge, inherited config, library grace and malformed ABI fail closed', async () => {
  const mutations = { peers: h(9), owner: a(7), delegates: a(7), eid: 97, bridgeEnabled: true, peerCount: 2n, sharedDecimals: 5,
    getReceiveLibrary: [a(4), true], receiveLibraryTimeout: [a(4), 1n], isDefaultSendLibrary: true, getSendLibrary: a(6),
    getConfig: '0x', getAppUlnConfig: { confirmations: 0n, requiredDVNCount: 0, optionalDVNCount: 0, optionalDVNThreshold: 0, requiredDVNs: [], optionalDVNs: [] },
    executorConfigs: [0, a(0)], totalSupply: -1n, initialAllocation: 0n, launchManifestHash: h(2), isRegisteredLibrary: false, isSupportedEid: false };
  for (const [f, value] of Object.entries(mutations)) { const p = policy(); await assert.rejects(inspectOmnichainRoute(clients(p, x => x.f === f ? value : undefined), p)); }
});
test('route rejects stale/changed blocks, timestamp disagreement, wrong chains, code and divergent heads', async () => {
  for (const mode of ['stale', 'reorg', 'timestamp', 'chain', 'code', 'head']) {
    const p = policy(), c = clients(p), old = c[0][1]; let calls = 0;
    if (mode === 'chain') old.getChainId = async () => 56;
    else if (mode === 'code') old.getCode = async () => '0x';
    else if (mode === 'head') old.getBlockNumber = async () => 151n;
    else old.getBlock = async ({ blockNumber }) => ({ number: blockNumber, hash: h(mode === 'reorg' && ++calls > 1 ? 99 : 120), timestamp: snapshotTime - BigInt(mode === 'stale' ? 200 : mode === 'timestamp' ? 1 : 0) });
    await assert.rejects(inspectOmnichainRoute(c, p));
  }
});
test('failed peers fence delayed completions and policy is cloned before awaits', async () => {
  const p = policy(), c = clients(p); let release, reads = 0;
  c[0][0].getBlockNumber = async () => { throw Error('Peer failed'); };
  c[0][1].getBlockNumber = () => new Promise(resolve => { release = resolve; });
  c[0][1].getChainId = async () => { reads++; return 97; };
  await assert.rejects(inspectOmnichainRoute(c, p), /Peer failed/); release(140n); await new Promise(r => setImmediate(r)); assert.equal(reads, 0);
  const next = policy(), nextClients = clients(next), promise = inspectOmnichainRoute(nextClients, next); next.manifestHash = h(7);
  await assert.rejects(promise, /identity/); // Providers changed with caller policy; the captured policy did not.
});
test('route has a real wall deadline and late completion cannot start RPC work', { timeout: 40000 }, async () => {
  let reads = 0; const releases = [], p = policy();
  const c = p.networks.map(() => [0, 1].map(() => ({ getBlockNumber: () => new Promise(r => releases.push(r)), async getChainId() { reads++; return 97; } })));
  const start = Date.now(); await assert.rejects(inspectOmnichainRoute(c, p), /timed out/); assert.ok(Date.now() - start >= 29000);
  releases.forEach(r => r(140n)); await new Promise(r => setImmediate(r)); assert.equal(reads, 0);
});
test('operator CLI is disabled and errors disclose no path, URL or credentials', () => {
  const r = spawnSync(process.execPath, ['--import', './scripts/register-ts.mjs', 'scripts/inspect-omnichain-route.mjs', '/private/route-policy.json'], {
    encoding: 'utf8', env: { ...process.env, FORTUNE_OMNICHAIN_ROUTE_READ_ENABLED: '', FORTUNE_ROUTE_A_RPC_URL: 'https://credential.invalid/private' },
  });
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.doesNotMatch(r.stderr, /route-policy|credential.invalid|\/private/);
});

for(const delayedNetwork of [false,true]) test(`route freshness at completion: ${delayedNetwork ? 'waiting for the other network' : 'finishing local reads'}`, async () => {
  const realNow=Date.now;
  try {
    {
      let clock=Number(snapshotTime)*1000+119000;
      Date.now=()=>clock;
      const p=policy(),c=clients(p);let completed=0;
      for(const pair of c)for(const client of pair){
        const get=client.getBlock;let count=0;
        client.getBlock=async args=>{
          const b=await get(args);
          if(++count===2 && (!delayedNetwork || pair===c[1])){
            if(++completed===2)clock+=2000;
          }
          if(delayedNetwork && pair===c[1])b.timestamp=snapshotTime+100n;
          return b;
        };
      }
      await assert.rejects(inspectOmnichainRoute(c,p),/fresh|expired/i);
    }
  }finally{Date.now=realNow;}
});
