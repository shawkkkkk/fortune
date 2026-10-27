import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { createPublicClient, http, encodeFunctionResult, decodeFunctionData, keccak256 } from "viem";
import { ARBITRAGE_V3_ABI, readV3MarketQuote, validateV3QuoteMarket } from "../../lib/arbitrage-v3-quotes.ts";
import { evaluateArbitrage } from "../../lib/arbitrage-policy.ts";

const addr = n => "0x" + n.toString(16).padStart(40, "0");
const identity = n => "0x" + n.toString(16).padStart(64, "0");
const runtime = "0x6001600055";
const pin = n => ({ address: addr(n), codeHash: keccak256(runtime) });
const market = () => ({ chainId: 97, factory: pin(1), quoter: pin(2), token: { ...pin(3), decimals: 18, identity: identity(10), profile: "plain-erc20" }, settlement: { ...pin(4), decimals: 6, identity: identity(11), profile: "plain-erc20" }, fee: 2500, confirmations: 2, maxBlockAgeMs: 10_000 });

// Real viem HTTP/ABI integration against a local JSON-RPC fixture; no live venue claim.
async function fixture(run, options = {}) {
  const calls = []; let blockReads = 0;
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body); calls.push(message);
    try {
      const { method, params = [] } = message; let result;
      if (method === "eth_chainId") result = options.chainHex || "0x61";
      else if (method === "eth_blockNumber") result = "0x66";
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

test("V3 HTTP adapter buys exact output, sells exact input and retains block provenance", async () => {
  await fixture(async (client, calls) => {
    for (const side of ["buy", "sell"]) {
      const r = await readV3MarketQuote(client, market(), side, 1000n, () => 102_000);
      assert.equal(r.quote.quoteAmount, side === "buy" ? 100_000n : 110_000n);
      assert.equal(r.quote.quotedAtMs, 100_000, "block time, not observation completion time");
      assert.equal(r.blockNumber, 100n); assert.equal(r.blockHash, identity(1));
      assert.equal(r.pool, addr(5)); assert.equal(r.executionAuthorized, false);
      assert.equal(r.gasEstimate, 50_000n);
    }
    assert.ok(calls.every(c => ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(c.method)));
  });
});

test("market configuration rejects mainnet, mutable-token profiles and absent review pins before RPC", async () => {
  const changes = [ { chainId: 56 }, { confirmations: 0 }, { confirmations: 257 }, { maxBlockAgeMs: 60_001 }, { fee: 1_000_000 },
    { quoter: { ...pin(2), codeHash: identity(0) } }, { factory: pin(2) },
    { token: { ...market().token, profile: "taxed" } }, { settlement: { ...market().settlement, decimals: 19 } } ];
  for (const change of changes) assert.throws(() => validateV3QuoteMarket({ ...market(), ...change }));
  await assert.rejects(readV3MarketQuote({}, market(), "bad", 1000n));
  await assert.rejects(readV3MarketQuote({}, market(), "buy", 0n));
});

test("RPC chain, canonical pool, active liquidity, token precision and code pins fail closed", async () => {
  for (const options of [{ chainHex: "0x38" }, { noCode: addr(2) }, { noPool: true }, { noCode: addr(5) }, { wrongFactory: true }, { wrongToken: true }, { fee: 500 }, { empty: true }, { decimals: 18 }, { zeroQuote: true }, { revert: true }]) {
    await fixture(async client => assert.rejects(readV3MarketQuote(client, market(), "buy", 1000n, () => 102_000)), options);
  }
  await fixture(async client => assert.rejects(readV3MarketQuote(client, { ...market(), quoter: { ...pin(2), codeHash: identity(33) } }, "buy", 1000n, () => 102_000)));
});

test("reorgs, old/future blocks, clock reversal and expiration during reads reject the observation", async () => {
  for (const options of [{ reorg: true }, { timestamp: "0x1" }, { timestamp: "0x70" }]) {
    await fixture(async client => assert.rejects(readV3MarketQuote(client, market(), "sell", 1000n, () => 102_000)), options);
  }
  for (const ending of [101_999, 111_000]) {
    let times = 0;
    await fixture(async client => assert.rejects(readV3MarketQuote(client, market(), "sell", 1000n, () => times++ ? ending : 102_000)));
  }
});

test("identity and precision bindings feed the spread policy without symbol-based dollar conversion", async () => {
  let buy, sell;
  await fixture(async client => { buy = (await readV3MarketQuote(client, market(), "buy", 1000n, () => 102_000)).quote; });
  await fixture(async client => { sell = (await readV3MarketQuote(client, { ...market(), chainId: 84532 }, "sell", 1000n, () => 102_000)).quote; }, { chainHex: "0x14a34" });
  const input = { buy, sell, nowMs: 102_000, maxQuoteAgeMs: 5000, costs: { gas: 100n, bridge: 100n, rebalance: 100n, other: 0n }, slippageBps: 100, minProfit: 100n, mode: "prefunded", sourceCash: 200_000n, destinationInventory: 1000n };
  assert.equal(evaluateArbitrage(input).candidate, true);
  assert.equal(evaluateArbitrage(input).executionAuthorized, false);
  let different;
  await fixture(async client => { different = (await readV3MarketQuote(client, { ...market(), chainId: 84532, settlement: { ...market().settlement, decimals: 18 } }, "sell", 1000n, () => 102_000)).quote; }, { chainHex: "0x14a34", decimals: 18 });
  assert.throws(() => evaluateArbitrage({ ...input, sell: different }), /denomination/);
});

test("operator CLI fails nonzero without exposing upstream or credential-bearing input", () => {
  const result = spawnSync(process.execPath, ["--import", "./scripts/register-ts.mjs", "scripts/quote-arbitrage-v3.mjs", "missing-manifest.json", "buy", "1000"], {
    encoding: "utf8", env: { ...process.env, FORTUNE_ARBITRAGE_READ_RPC_URL: "https://secret-user:secret-password@example.invalid/private-key" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /No transaction was submitted/);
  assert.doesNotMatch(result.stderr, /secret-user|secret-password|private-key|example.invalid|missing-manifest/);
});
