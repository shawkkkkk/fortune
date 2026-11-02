import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { createPublicClient, http, encodeFunctionResult, decodeFunctionData, keccak256 } from "viem";
import { ARBITRAGE_V3_ABI } from "../../lib/arbitrage-v3-quotes.ts";
import { observeV3Arbitrage } from "../../lib/arbitrage-v3-route.ts";

const addr = n => "0x" + n.toString(16).padStart(40, "0");
const identity = n => "0x" + n.toString(16).padStart(64, "0");
const runtime = "0x6001600055";
const pin = n => ({ address: addr(n), codeHash: keccak256(runtime) });
const market = () => ({ chainId: 97, factory: pin(1), quoter: pin(2), token: { ...pin(3), decimals: 18, identity: identity(10), profile: "plain-erc20" }, settlement: { ...pin(4), decimals: 6, identity: identity(11), profile: "plain-erc20" }, fee: 2500, confirmations: 20, maxBlockAgeMs: 10_000 });

// Real viem HTTP/ABI integration against a local JSON-RPC fixture; no live venue claim.
async function fixture(run, options = {}) {
  const calls = []; let blockReads = 0;
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body); calls.push(message);
    try {
      const { method, params = [] } = message; let result;
      if (method === "eth_chainId") result = options.chainHex || "0x61";
      else if (method === "eth_blockNumber") result = "0x78";
      else if (method === "eth_getBlockByNumber") {
        blockReads++;
        assert.equal(params[0], "0x64");
        result = { number: "0x64", hash: options.reorg && blockReads > 1 ? identity(99) : identity(1), timestamp: options.timestamp || "0x64", transactions: [] };
      } else if (method === "eth_getCode") {
        assert.equal(params[1], "0x64"); result = options.noCode === params[0] ? "0x" : runtime;
      } else if (method === "eth_call") {
        assert.equal(params[1], "0x64", "every contract read and simulation pins the same block");
        const target = params[0].to.toLowerCase();
        const { functionName, args } = decodeFunctionData({ abi: ARBITRAGE_V3_ABI, data: params[0].data });
        if (functionName === "factory") result = options.wrongFactory ? addr(99) : addr(1);
        else if (functionName === "getPool") { assert.deepEqual(args, [addr(3), addr(4), 2500]); result = options.noPool ? addr(0) : addr(5); }
        else if (functionName === "decimals") result = target === addr(3) ? 18 : (options.decimals ?? 6);
        else if (functionName === "token0") result = options.wrongToken ? addr(99) : addr(3);
        else if (functionName === "token1") result = addr(4);
        else if (functionName === "fee") result = options.fee ?? 2500;
        else if (functionName === "liquidity") result = options.empty ? 0n : 1000n;
        else if (functionName === "quoteExactOutputSingle" || functionName === "quoteExactInputSingle") {
          assert.equal(params[0].gas, "0x1e8480", "bounded simulation cannot walk ticks without a gas cap");
          if (options.revert) throw new Error("quote reverted");
          const p = args[0]; assert.equal(p.fee, 2500); assert.equal(p.sqrtPriceLimitX96, 0n);
          if (functionName === "quoteExactOutputSingle") {
            assert.equal(p.tokenIn, addr(4)); assert.equal(p.tokenOut, addr(3)); assert.equal(p.amount, 1000n);
          } else { assert.equal(p.tokenIn, addr(3)); assert.equal(p.tokenOut, addr(4)); assert.equal(p.amountIn, 1000n); }
          result = [options.zeroQuote ? 0n : functionName === "quoteExactOutputSingle" ? 100_000n : 110_000n, 1n << 96n, 2, 50_000n];
        } else throw new Error("unexpected function");
        result = encodeFunctionResult({ abi: ARBITRAGE_V3_ABI, functionName, result });
      } else throw new Error("non-read RPC rejected");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    } catch (error) {
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } }));
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = createPublicClient({ transport: http(`http://127.0.0.1:${server.address().port}`, { retryCount: 0, timeout: 1000 }), batch: { multicall: false } });
  try { await run(client, calls); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

const policy = () => ({buyMarket:market(),sellMarket:{...market(),chainId:84532},tokenUnits:1000n,costs:{gas:100n,bridge:100n,rebalance:100n,other:0n},maxQuoteAgeMs:10000,slippageBps:100,minProfit:100n,mode:'prefunded',sourceCash:200000n,destinationInventory:1000n});
const pair = run => fixture(buy=>fixture(sell=>run([buy,sell]),{chainHex:'0x14a34'}));
test('actual HTTP/ABI route combines exact-output buy and exact-input sell with full modeled costs and false authority',async()=>{
 await pair(async clients=>{const r=await observeV3Arbitrage(clients,policy(),()=>102000);assert.equal(r.buy.quote.quoteAmount,100000n);assert.equal(r.sell.quote.quoteAmount,110000n);assert.equal(r.evaluation.modeledNet,7600n);assert.equal(r.evaluation.candidate,true);assert.equal(r.buy.blockNumber,100n);assert.equal(r.sell.blockNumber,100n);assert.equal(r.observedAtMs,102000);assert.equal(r.currentAuthorization,null);for(const k of ['costsVerified','capitalVerified','inventoryVerified','independentProvidersVerified','finalityVerified','realizedProfitVerified','routeExecutionVerified','executionAuthorized','fullStrategyReadiness'])assert.equal(r[k],false);assert.equal(r.evaluation.executionAuthorized,false);
 for(const change of [{mode:'bridge-first'},{sourceCash:0n},{destinationInventory:0n},{minProfit:100000n},{costs:{gas:10000n,bridge:10000n,rebalance:10000n,other:0n}}])assert.equal((await observeV3Arbitrage(clients,{...policy(),...change},()=>102000)).evaluation.candidate,false);
 });
});
test('both market and accounting policies preflight before any RPC',async()=>{
 let calls=0;const c=Object.fromEntries(['getChainId','getBlockNumber','getBlock','getCode','readContract','simulateContract'].map(k=>[k,async()=>{calls++;return 97;}]));
 for(const change of [{sellMarket:market()},{sellMarket:{...policy().sellMarket,token:{...market().token,identity:identity(99)}}},{sellMarket:{...policy().sellMarket,settlement:{...market().settlement,decimals:18}}},{buyMarket:{...market(),confirmations:19}},{sellMarket:{...policy().sellMarket,chainId:56}},{tokenUnits:0n},{minProfit:-1n},{costs:{gas:0n,bridge:0n,rebalance:0n,other:0n,unreviewed:1n}},{costs:{gas:-1n,bridge:0n,rebalance:0n,other:0n}},{maxQuoteAgeMs:60001},{slippageBps:10001},{mode:'unreviewed'}])await assert.rejects(observeV3Arbitrage([c,{}],{...policy(),...change},()=>102000));
 await assert.rejects(observeV3Arbitrage([c,c],policy(),()=>102000));for(const clients of [[c,null],Array(2)])await assert.rejects(observeV3Arbitrage(clients,policy(),()=>102000));assert.equal(calls,0);
});
test('configuration is copied before RPC and original method receivers remain intact',async()=>{
 await pair(async clients=>{const p=policy();const wrapped=clients.map((c,i)=>{let w;w=Object.fromEntries(['getChainId','getBlockNumber','getBlock','getCode','readContract','simulateContract'].map(k=>[k,function(...args){assert.equal(this,w);if(i===0&&k==='getChainId'){p.sellMarket.token.identity=identity(99);p.minProfit=1000000n;}return c[k](...args);} ]));return w;});assert.equal((await observeV3Arbitrage(wrapped,p,()=>102000)).evaluation.candidate,true);});
});
test('fast quote cannot age beyond its own policy while waiting for another network',async()=>{
 await pair(async clients=>{let now=102000;const p=policy();p.buyMarket.maxBlockAgeMs=5000;let reads=0;const fast=new Proxy(clients[0],{get(t,k){const v=Reflect.get(t,k,t);if(k==='getBlock')return async(...a)=>{reads++;return v.apply(t,a);};return typeof v==='function'?v.bind(t):v;}});const slow=new Proxy(clients[1],{get(t,k){const v=Reflect.get(t,k,t);if(k==='getBlockNumber')return async(...a)=>{await new Promise(r=>setTimeout(r,100));assert.equal(reads,2);now=108000;return v.apply(t,a);};return typeof v==='function'?v.bind(t):v;}});await assert.rejects(observeV3Arbitrage([fast,slow],p,()=>now),/Route quote expired/);});
});
test('safe shared clock and failed-leg fencing block late reads on the other network',async()=>{
 let calls=0;const c=Object.fromEntries(['getChainId','getBlockNumber','getBlock','getCode','readContract','simulateContract'].map(k=>[k,async()=>{calls++;return 97;}]));for(const now of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(observeV3Arbitrage([c,{...c}],policy(),()=>now));assert.equal(calls,0);
 await pair(async clients=>{let now=102000;const bad=new Proxy(clients[0],{get(t,k){const v=Reflect.get(t,k,t);if(k==='getCode')return async(...a)=>{now=103000;const r=await v.apply(t,a);now=102500;return r;};return typeof v==='function'?v.bind(t):v;}});await assert.rejects(observeV3Arbitrage([bad,clients[1]],policy(),()=>now),/clock/);});
 await pair(async clients=>{let release,follow=0;const bad={...c,getChainId:async()=>{throw Error('peer');}},slow={...c,getChainId:()=>new Promise(r=>release=r),getBlockNumber:async()=>{follow++;return 120n;}};await assert.rejects(observeV3Arbitrage([bad,slow],policy(),()=>102000),/peer/);release(84532);await new Promise(r=>setImmediate(r));assert.equal(follow,0);});
});
test('one real twenty-second route deadline fences late RPC without granting partial results',{timeout:25000},async()=>{
 let release,follow=0;const c=Object.fromEntries(['getChainId','getBlockNumber','getBlock','getCode','readContract','simulateContract'].map(k=>[k,async()=>{throw Error('unexpected follow-on');}]));const pending=observeV3Arbitrage([{...c,getChainId:()=>new Promise(r=>release=r),getBlockNumber:async()=>{follow++;return 120n;}},{...c,getChainId:()=>new Promise(()=>{})}],policy(),()=>102000);await assert.rejects(pending,/Route observation timed out/);release(97);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
});

test("both snapshots are rechecked after both quote legs finish",async()=>{
 await pair(async clients=>{let reads=0;const changed=new Proxy(clients[0],{get(t,k){const v=Reflect.get(t,k,t);if(k==="getBlock")return async(...a)=>{const b=await v.apply(t,a);return ++reads===3?{...b,hash:identity(99)}:b;};return typeof v==="function"?v.bind(t):v;}});await assert.rejects(observeV3Arbitrage([changed,clients[1]],policy(),()=>102000),/Route snapshot changed/);assert.equal(reads,3);});
});
