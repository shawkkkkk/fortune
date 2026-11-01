import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPublicClient, http, parseAbi, decodeFunctionData, encodeFunctionResult } from 'viem';
import { LAUNCH_RULES_ABI } from '../../lib/custom-pairs-artifacts.ts';
import { readOptionalRulesAddress, readLaunchRules } from '../../lib/custom-pairs-read.ts';

const addr = n => '0x' + n.toString(16).padStart(40, '0');
const blockNumber = 123n;
const required = ['rulesOf', 'capsOf', 'active', 'tradeRulesOf', 'flowOf'];
// Build complete ABI-shaped tuples; nonzero controls below are intentional.
const zeroTuple = name => Object.fromEntries(LAUNCH_RULES_ABI.find(x => x.name === name).outputs[0].components.map(c => [
  c.name, c.type === 'address' ? addr(0) : c.type.endsWith('[]') ? [] : c.type === 'bool' ? false : Number(c.type.slice(4)) > 48 ? 0n : 0,
]));
function fixture(options = {}) {
  const { gate = true, failed = '', active = true } = options;
  const decimals = Object.hasOwn(options, 'decimals') ? options.decimals : 6;
  const calls = [];
  const values = {
    rulesOf: { ...zeroTuple('rulesOf'), launchTimestamp: 100n, supply: 10n ** 24n, maxWalletBps: 100, sellCooldown: 60,
      gateToken: gate ? addr(3) : addr(0), gateMinBalance: gate ? 1_234_567n : 0n, gateSeconds: gate ? 300 : 0, exemptList: [addr(4)] },
    capsOf: [10n ** 22n, 0n, 0n], active,
    tradeRulesOf: [{ ...zeroTuple('tradeRulesOf'), marketHours: 1, maxGasPrice: 1_000_000_000n }, []],
    flowOf: [789n, 100n, 1, 0], symbol: 'SIX', decimals,
  };
  return { values, calls, rpc: { async readContract(request) {
    calls.push(request);
    assert.equal(request.blockNumber, blockNumber);
    if (request.functionName === failed || values[request.functionName] instanceof Error) throw Error('fixture read unavailable');
    assert.ok(Object.hasOwn(values, request.functionName));
    return values[request.functionName];
  } } };
}

test('a known rules contract never becomes null when a required read fails', async () => {
  for (const failed of required) {
    const { rpc } = fixture({ failed });
    await assert.rejects(readLaunchRules(rpc, addr(1), addr(2), blockNumber), undefined, failed);
  }
});

test('holder-gate units must be read successfully as uint8, never assumed', async () => {
  for (const decimals of [Error('unavailable'), undefined, null, '6', true, -1, 256, 6.5, NaN]) {
    const { rpc } = fixture({ decimals });
    await assert.rejects(readLaunchRules(rpc, addr(1), addr(2), blockNumber));
  }
});

test('successful rules retain controls, exact gate amount and boundary units even when inactive', async () => {
  for (const decimals of [0, 6, 18, 255]) {
    const { rpc, calls } = fixture({ decimals, active: false, failed: 'symbol' });
    const result = await readLaunchRules(rpc, addr(1), addr(2), blockNumber);
    assert.equal(result.active, false);
    assert.equal(result.maxWalletBps, 100);
    assert.equal(result.sellCooldown, 60);
    assert.deepEqual(result.exempt, [addr(4)]);
    assert.equal(result.marketHours, 1);
    assert.equal(result.maxGasPrice, '1000000000');
    assert.equal(result.gateMinBalance, '1234567');
    assert.deepEqual(result.gate, { symbol: 'TOKEN', decimals });
    assert.equal(result.volume, '789');
    assert.ok(calls.every(c => c.blockNumber === blockNumber));
  }
});

test('a successfully read rule set without a holder gate needs no gate-token metadata', async () => {
  const { rpc, calls } = fixture({ gate: false, failed: 'decimals' });
  const result = await readLaunchRules(rpc, addr(1), addr(2), blockNumber);
  assert.equal(result.gateToken, null);
  assert.equal(result.gate, null);
  assert.equal(result.maxWalletBps, 100);
  assert.equal(calls.length, 5);
});

test('actual viem HTTP/ABI rules reads retain six-decimal gates and reject RPC or decode failures', async () => {
  const abi = [...LAUNCH_RULES_ABI, ...parseAbi(['function symbol() view returns(string)', 'function decimals() view returns(uint8)'])];
  const { values } = fixture();
  let failed = '', malformed = false;
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    try {
      assert.equal(message.method, 'eth_call');
      assert.equal(message.params[1], '0x7b');
      const { functionName, args } = decodeFunctionData({ abi, data: message.params[0].data });
      calls.push(functionName);
      assert.equal(message.params[0].to, ['symbol', 'decimals'].includes(functionName) ? addr(3) : addr(2));
      if (required.includes(functionName)) assert.deepEqual(args, [addr(1)]);
      if (functionName === failed && !malformed) throw Error('fixture unavailable');
      const result = functionName === failed && malformed ? '0x' : encodeFunctionResult({ abi, functionName, result: values[functionName] });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    } catch {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Unavailable' } }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const rpc = createPublicClient({ transport: http(`http://127.0.0.1:${server.address().port}`, { retryCount: 0, timeout: 1000 }) });
    const result = await readLaunchRules(rpc, addr(1), addr(2), blockNumber);
    assert.deepEqual(result.gate, { symbol: 'SIX', decimals: 6 });
    assert.equal(result.gateMinBalance, '1234567');
    assert.equal(result.maxWalletBps, 100);
    assert.deepEqual(new Set(calls), new Set([...required, 'symbol', 'decimals']));
    for (failed of [...required, 'decimals']) {
      for (malformed of [false, true]) await assert.rejects(readLaunchRules(rpc, addr(1), addr(2), blockNumber));
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('public detail API propagates known-rule failures as generic 503 through its actual client', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { multicall3Abi } = await import('viem');
  const artifacts = await import('../../lib/custom-pairs-artifacts.ts');
  const abi = [...artifacts.CUSTOM_PAIR_CURVE_ABI, ...artifacts.CUSTOM_PAIR_FACTORY_ABI,
    ...artifacts.CUSTOM_PAIR_TOKEN_ABI, ...LAUNCH_RULES_ABI,
    ...parseAbi(['function name() view returns(string)', 'function symbol() view returns(string)', 'function totalSupply() view returns(uint256)'])];
  const { values } = fixture();
  const defaultValue = c => c.type === 'tuple' ? Object.fromEntries(c.components.map(x => [x.name, defaultValue(x)]))
    : c.type.endsWith('[]') ? [] : c.type === 'string' ? '' : c.type === 'bool' ? false : c.type === 'address' ? addr(0) : 0n;
  Object.assign(values, {
    curveIndexPlusOne: 1n,
    launchAt: { creator: addr(4), token: addr(1), curve: addr(5), pairToken: addr(3), pool: addr(0), createdAt: 100n },
    metadataOf: defaultValue(abi.find(x => x.name === 'metadataOf').outputs[0]),
    state: defaultValue(abi.find(x => x.name === 'state').outputs[0]),
    name: 'Fixture launch', pairDecimals: 6, graduationTarget: 100n, launchSupply: 10n ** 24n,
    protocolFeeBps: 50, creatorFeeBps: 50, totalSupply: 10n ** 24n, rules: addr(2),
    launchTimestamp: 100n, virtualReserve: 10n, creatorFeeRecipient: addr(4), GRADUATION_RESCUE_DELAY: 604800n,
    graduationPairDelivered: 0n, graduationLaunchTokens: 0n, graduationLiquidity: 0n, rescueCirculating: 0n, rescueHolderClaims: 0n,
  });
  let failed = '', malformedRules = false;
  const seen = [];
  function call(data) {
    const { functionName, args } = decodeFunctionData({ abi, data });
    seen.push(functionName);
    if (functionName === 'rules' && malformedRules) return '0x01';
    if (functionName === failed) throw Error('PRIVATE-UPSTREAM-SENTINEL');
    assert.ok(Object.hasOwn(values, functionName), functionName);
    return encodeFunctionResult({ abi, functionName, result: values[functionName] });
  }
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    try {
      let result;
      if (message.method === 'eth_getBlockByNumber') result = { number: '0x7b', hash: '0x' + 'ab'.repeat(32), timestamp: '0x64', transactions: [] };
      else if (message.method === 'eth_chainId') result = '0x61';
      else if (message.method === 'eth_getCode') result = '0x';
      else {
        assert.equal(message.method, 'eth_call');
        assert.equal(message.params[1], '0x7b');
        const { data } = message.params[0];
        // Production customPairClient batches reads through Multicall3.
        if (data.startsWith('0x82ad56cb')) {
          const { args } = decodeFunctionData({ abi: multicall3Abi, data });
          result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: args[0].map(c => {
            try { return { success: true, returnData: call(c.callData) }; }
            catch { return { success: false, returnData: '0x' }; }
          }) });
        } else result = call(data);
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    } catch {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'PRIVATE-UPSTREAM-SENTINEL' } }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const run = async () => {
      const { stdout } = await promisify(execFile)(process.execPath, ['--import', './scripts/register-ts.mjs', '--input-type=module', '-e',
        `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){return n(s==='next/server'?'next/server.js':s,c)}}); const {GET}=await import('./app/api/public/v1/custom-pairs/[curve]/route.ts'); const r=await GET(new Request('http://localhost/api'),{params:Promise.resolve({curve:'${addr(5)}'})}); console.log(JSON.stringify({status:r.status,body:await r.json()}));`],
      { cwd: new URL('../../', import.meta.url), timeout: 15000, env: { ...process.env,
        NEXT_PUBLIC_CHAIN_ID: '97', NEXT_PUBLIC_FORTUNE_CUSTOM_PAIR_FACTORY_ADDRESS: addr(6),
        BSC_TESTNET_RPC_URL: `http://127.0.0.1:${server.address().port}`, BSC_TESTNET_RPC_URLS: '',
      } });
      return JSON.parse(stdout);
    };
    const success = await run();
    assert.equal(success.status, 200, JSON.stringify(success));
    assert.equal(success.body.data.rules.maxWalletBps, 100);
    assert.equal(success.body.data.rules.gate.decimals, 6);
    malformedRules = true;
    const discoveryFailure = await run();
    assert.equal(discoveryFailure.status, 503, 'malformed rules discovery must not become no-rules/200');
    assert.ok(!JSON.stringify(discoveryFailure).includes('PRIVATE-UPSTREAM-SENTINEL'));
    malformedRules = false;
    for (failed of ['tradeRulesOf', 'decimals']) {
      const failure = await run();
      assert.equal(failure.status, 503);
      assert.ok(!JSON.stringify(failure).includes('PRIVATE-UPSTREAM-SENTINEL'));
      assert.equal(failure.body.error.code, 'dependency_unavailable');
    }
    assert.ok(seen.includes('tradeRulesOf') && seen.includes('decimals'));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});


test('optional discovery preserves valid addresses and typed legacy cases but rejects transport, malformed data and explicit reverts', async()=>{
 const {BaseError,ContractFunctionZeroDataError,ContractFunctionRevertedError,encodeErrorResult}=await import('viem');
 for(const value of [addr(0),addr(2)])assert.equal(await readOptionalRulesAddress(async()=>value),value);
 const absent=new ContractFunctionZeroDataError({functionName:'rules'}),empty=new ContractFunctionRevertedError({abi:[],functionName:'rules',data:'0x'});
 for(const error of [absent,empty,new BaseError('outer',{cause:absent}),new BaseError('outer',{cause:empty})])assert.equal(await readOptionalRulesAddress(async()=>{throw error;}),addr(0));
 for(const error of [new Error('transport'),new BaseError('outer',{cause:new Error('transport')}),new Error('ContractFunctionZeroDataError'),new ContractFunctionRevertedError({abi:[],functionName:'rules',data:encodeErrorResult({abi:parseAbi(['error Error(string)']),errorName:'Error',args:['blocked']})})])await assert.rejects(readOptionalRulesAddress(async()=>{throw error;}));
 for(const value of [null,undefined,'0x','0x01',addr(1)+'00',true])await assert.rejects(readOptionalRulesAddress(async()=>value));
});

test('actual HTTP discovery rejects RPC and malformed ABI failures while preserving empty legacy replies', async()=>{
 let mode='address';const abi=parseAbi(['function rules() view returns(address)']);
 const server=createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;const m=JSON.parse(b);assert.equal(m.method,'eth_call');res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,...(mode==='rpc'?{error:{code:-32000,message:'PRIVATE-DISCOVERY'}}:{result:mode==='empty'?'0x':mode==='bad'?'0x01':encodeFunctionResult({abi,functionName:'rules',result:addr(2)})})}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');try{const rpc=createPublicClient({transport:http(`http://127.0.0.1:${server.address().port}`,{retryCount:0})});const read=()=>readOptionalRulesAddress(()=>rpc.readContract({address:addr(1),abi,functionName:'rules',blockNumber:123n}));assert.equal(await read(),addr(2));mode='empty';assert.equal(await read(),addr(0));for(mode of ['rpc','bad'])await assert.rejects(read());}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
