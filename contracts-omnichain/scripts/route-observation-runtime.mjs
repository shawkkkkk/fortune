// Two separate zero-account LOCAL EVMs. No fork, generated keys or public writes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createPublicClient, createWalletClient, http, keccak256, pad, toHex, encodeAbiParameters, decodeAbiParameters } from 'viem';
import { inspectOmnichainRoute, encodeRouteUln, ULN_PARAMETERS, EXECUTOR_PARAMETERS } from '../../lib/omnichain-route.ts';

const GOV = '0x0000000000000000000000000000000000001111', WORKER = '0x0000000000000000000000000000000000002222';
const reportPath = resolve('.tmp/omnichain-route-runtime.json'); rmSync(reportPath, { force: true });
const artifact = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const token = artifact('../out/FortuneOmnichainToken.sol/FortuneOmnichainToken.json');
const endpoint = artifact('../node_modules/@layerzerolabs/oapp-evm/artifacts/EndpointV2Mock.sol/EndpointV2Mock.json');
const send = artifact('../node_modules/@layerzerolabs/lz-evm-messagelib-v2/artifacts/contracts/uln/uln302/SendUln302.sol/SendUln302.json');
const receive = artifact('../node_modules/@layerzerolabs/lz-evm-messagelib-v2/artifacts/contracts/uln/uln302/ReceiveUln302.sol/ReceiveUln302.json');
const nodes = []; let stage = 'startup';
try {
  const binary = process.env.FORTUNE_ANVIL_BIN; assert.ok(binary);
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8' }); assert.equal(version.status, 0); assert.match(version.stdout, /Version: 1\.7\.1/);
  const networks = [];
  for (const [i, chainId] of [97, 84532].entries()) {
    const lease = createServer(); lease.listen(0, '127.0.0.1'); await once(lease, 'listening');
    const port = lease.address().port; await new Promise(r => lease.close(r));
    const node = spawn(binary, ['--timestamp', String(Math.floor(Date.now() / 1000) - 60), '--host', '127.0.0.1', '--port', String(port), '--chain-id', String(chainId), '--accounts', '0', '--hardfork', 'prague', '--quiet'], { stdio: 'ignore' });
    nodes.push(node); let failed = false; node.on('error', () => { failed = true; });
    const transport = () => http(`http://127.0.0.1:${port}`, { timeout: 5000, retryCount: 0 });
    const rpc = createPublicClient({ transport: transport() }); let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if (await rpc.getChainId() === chainId) { ready = true; break; } } catch {}
      if (failed || node.exitCode !== null) break; await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(ready); assert.deepEqual(await rpc.request({ method: 'eth_accounts' }), []);
    await rpc.request({ method: 'anvil_impersonateAccount', params: [GOV] });
    await rpc.request({ method: 'anvil_setBalance', params: [GOV, toHex(100n * 10n ** 18n)] });
    // Synthetic worker code only proves address/runtime/config reading, not DVN or executor operation.
    await rpc.request({ method: 'anvil_setCode', params: [WORKER, '0x60006000f3'] });
    const wallet = createWalletClient({ account: GOV, transport: transport(), chain: { id: chainId, name: 'local fixture', nativeCurrency: { name: 'Fixture', symbol: 'FIX', decimals: 18 }, rpcUrls: { default: { http: [] } } } });
    const receipt = async hash => { const r = await rpc.waitForTransactionReceipt({ hash, pollingInterval: 20, timeout: 15000 }); assert.equal(r.status, 'success', 'Local fixture transaction reverted'); return r; };
    const deploy = async (a, args) => (await receipt(await wallet.deployContract({ abi: a.abi, bytecode: typeof a.bytecode === 'string' ? a.bytecode : a.bytecode.object, args, gas: 15_000_000n }))).contractAddress;
    const write = async (address, a, functionName, args) => receipt(await wallet.writeContract({ address, abi: a.abi, functionName, args, gas: 5_000_000n }));
    const pin = async address => ({ address, codeHash: keccak256(await rpc.getCode({ address })) });
    stage = `local deployments ${chainId}`;
    const eid = 40001 + i, ep = await deploy(endpoint, [eid, GOV]), sl = await deploy(send, [ep, 100000n, 0n]), rl = await deploy(receive, [ep]);
    const t = await deploy(token, ['Fortune local route', 'FLR', ep, GOV, GOV, 300n * 10n ** 18n, BigInt(i + 1) * 100n * 10n ** 18n, pad('0x01')]);
    const worker = await pin(WORKER), uln = { confirmations: '20', required: [worker], optional: [], threshold: 0 };
    networks.push({ rpc, write, readers: [createPublicClient({ transport: transport() }), createPublicClient({ transport: transport() })],
      policy: { chainId, eid, token: await pin(t), endpoint: await pin(ep), sendLibrary: await pin(sl), receiveLibrary: await pin(rl), owner: GOV, delegate: GOV,
        initialAllocation: String(BigInt(i + 1) * 100n * 10n ** 18n), executor: worker, maxMessageSize: 10000, send: uln, receive: uln } });
  }
  stage = 'explicit route configuration';
  for (const [i, n] of networks.entries()) {
    const p = n.policy, remote = networks[1 - i].policy, raw = decodeAbiParameters(ULN_PARAMETERS, encodeRouteUln(p.send, true))[0];
    // Defaults establish supported EIDs in the upstream ULN, but application config
    // below is explicit; the reader also rejects inherited application values.
    for (const [a, lib] of [[send, p.sendLibrary], [receive, p.receiveLibrary]]) {
      await n.write(lib.address, a, 'setDefaultUlnConfigs', [[{ eid: remote.eid, config: { ...raw, optionalDVNCount: 0 } }]]);
      await n.write(p.endpoint.address, endpoint, 'registerLibrary', [lib.address]);
    }
    await n.write(p.endpoint.address, endpoint, 'setSendLibrary', [p.token.address, remote.eid, p.sendLibrary.address]);
    await n.write(p.endpoint.address, endpoint, 'setReceiveLibrary', [p.token.address, remote.eid, p.receiveLibrary.address, 0n]);
    const executor = encodeAbiParameters(EXECUTOR_PARAMETERS, [{ maxMessageSize: p.maxMessageSize, executor: p.executor.address }]);
    await n.write(p.endpoint.address, endpoint, 'setConfig', [p.token.address, p.sendLibrary.address, [{ eid: remote.eid, configType: 2, config: encodeRouteUln(p.send, true) }, { eid: remote.eid, configType: 1, config: executor }]]);
    await n.write(p.endpoint.address, endpoint, 'setConfig', [p.token.address, p.receiveLibrary.address, [{ eid: remote.eid, configType: 2, config: encodeRouteUln(p.receive, true) }]]);
    await n.write(p.token.address, token, 'setPeer', [remote.eid, pad(remote.token.address)]);
  }
  const confirm = async () => { for (const n of networks) await n.rpc.request({ method: 'anvil_mine', params: ['0x14', '0x0'] }); };
  const policy = { manifestHash: pad('0x01'), globalSupplyCap: String(300n * 10n ** 18n), networks: networks.map(n => n.policy) };
  const readers = networks.map(n => n.readers); await confirm();
  stage = 'actual dual-chain configuration read'; const observed = await inspectOmnichainRoute(readers, policy);
  assert.equal(observed.configurationMatches, true); assert.equal(observed.executionAuthorized, false);
  const n = networks[0], p = n.policy, remote = networks[1].policy;
  stage = 'changed peer rejection';
  await n.write(p.token.address, token, 'setPeer', [remote.eid, pad(GOV)]); await confirm();
  await assert.rejects(inspectOmnichainRoute(readers, policy), /identity/);
  await n.write(p.token.address, token, 'setPeer', [remote.eid, pad(remote.token.address)]);
  stage = 'changed effective executor rejection';
  await n.write(p.endpoint.address, endpoint, 'setConfig', [p.token.address, p.sendLibrary.address, [{ eid: remote.eid, configType: 1, config: encodeAbiParameters(EXECUTOR_PARAMETERS, [{ maxMessageSize: 9999, executor: p.executor.address }]) }]]); await confirm();
  await assert.rejects(inspectOmnichainRoute(readers, policy), /executor/);
  stage = 'inherited application ULN rejection';
  await n.write(p.endpoint.address, endpoint, 'setConfig', [p.token.address, p.sendLibrary.address, [
    { eid: remote.eid, configType: 1, config: encodeAbiParameters(EXECUTOR_PARAMETERS, [{ maxMessageSize: 10000, executor: p.executor.address }]) },
    { eid: remote.eid, configType: 2, config: encodeAbiParameters(ULN_PARAMETERS, [{ confirmations: 0n, requiredDVNCount: 0, optionalDVNCount: 0, optionalDVNThreshold: 0, requiredDVNs: [], optionalDVNs: [] }]) },
  ]]); await confirm();
  await assert.rejects(inspectOmnichainRoute(readers, policy), /application ULN/);
  const result = { localChainIds: [97, 84532], fixtureEndpointIds: [40001, 40002], actualOftAndUlnConfigurationRead: true,
    changedPeerRejected: true, changedExecutorRejected: true, inheritedApplicationUlnRejected: true, snapshot: observed,
    twoLocalEvmInstances: true, independentPublicProviders: false, endpointIsUpstreamMock: true, workersAreSynthetic: true,
    generatedAccounts: 0, privateKeysUsed: false, publicBroadcasts: false, messageDeliveryTested: false, securityReadiness: false, executionAuthorized: false };
  mkdirSync(resolve('.tmp'), { recursive: true }); writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(`Local omnichain route verification failed at ${stage}: ${error.name}. No public transaction was submitted.`); process.exitCode = 1; }
finally {
  await Promise.all(nodes.map(async node => { if (node.exitCode === null) { node.kill('SIGTERM'); const force = setTimeout(() => node.kill('SIGKILL'), 2000); await once(node, 'exit').catch(() => {}); clearTimeout(force); } }));
}
