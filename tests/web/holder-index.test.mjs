import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MemoryStore, UpstashStore, holderStore } from "../../lib/holder-store.ts";
import { advanceHolderIndex, applyTransfers, historyPruned, holderKeys, rangeTooLarge, readHolderView } from "../../lib/holder-index.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const a = (n) => "0x" + n.toString(16).padStart(40, "0");
const FACTORY = a(0xf00);
const TOKEN = a(0x7001);
const TOKEN3 = a(0x7003);
const CURVE = a(0xc001);
const CURVE3 = a(0xc003);
const CREATOR = a(0xcafe);
const WBNB = a(0xbb);
const [A, B, D, E, G] = [a(0xa), a(0xb), a(0xd), a(0xe), a(0x9)];
const PRUNED = "History has been pruned for this block. To remove restrictions, order a dedicated full node here: https://www.allnodes.com/bnb/host";

// A chain that answers the calls the index makes, from a list of decoded logs.
class FakeChain {
  constructor() {
    this.head = 300n;
    this.logs = [];
    this.curves = new Map();
    this.prunedBelow = 0n;
    this.maxRange = null;
    this.calls = { getLogs: 0 };
  }
  timestamp(block) {
    return 1_000_000 + Number(block);
  }
  add(address, eventName, args, block, logIndex = 0) {
    this.logs.push({ address: address.toLowerCase(), eventName, args, blockNumber: BigInt(block), logIndex, removed: false });
  }
  transfer(token, from, to, value, block, logIndex = 0) {
    this.add(token, "Transfer", { from, to, value: BigInt(value) }, block, logIndex);
  }
  balances(token, block) {
    const out = new Map();
    for (const log of this.logs) {
      if (log.eventName !== "Transfer" || log.address !== token.toLowerCase() || log.blockNumber > block) continue;
      const { from, to, value } = log.args;
      if (from !== ZERO) out.set(from, (out.get(from) ?? 0n) - value);
      if (to !== ZERO) out.set(to, (out.get(to) ?? 0n) + value);
    }
    return out;
  }
  client() {
    const chain = this;
    return {
      async getChainId() { return 97; },
      async getBlockNumber() { return chain.head; },
      async getBlock({ blockNumber }) { return { number: blockNumber, hash: "0x" + blockNumber.toString(16).padStart(64, "0"), timestamp: BigInt(chain.timestamp(blockNumber)) }; },
      async getLogs({ address, event, events, fromBlock, toBlock }) {
        chain.calls.getLogs += 1;
        if (fromBlock < chain.prunedBelow) throw new Error(PRUNED);
        if (chain.maxRange !== null && toBlock - fromBlock + 1n > chain.maxRange) throw new Error("exceed maximum block range: " + chain.maxRange);
        const addresses = (Array.isArray(address) ? address : [address]).map((item) => item.toLowerCase());
        const names = event ? [event.name] : events ? events.map((item) => item.name) : null;
        return chain.logs
          .filter((log) => addresses.includes(log.address) && (!names || names.includes(log.eventName)) && log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
          .sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1))
          .map((log) => ({ ...log }));
      },
      async readContract({ address, functionName, blockNumber }) {
        if (functionName === "launchTimestamp") return BigInt(chain.curves.get(address.toLowerCase()));
        if (functionName === "totalSupply") return [...chain.balances(address, blockNumber).values()].reduce((sum, value) => sum + value, 0n);
        throw new Error("unexpected read " + functionName);
      },
      async multicall({ contracts, blockNumber }) {
        return contracts.map(({ address, functionName, args }) => {
          if (functionName !== "balanceOf") throw new Error("unexpected multicall " + functionName);
          return chain.balances(address, blockNumber).get(args[0].toLowerCase()) ?? 0n;
        });
      },
    };
  }
  launch(token, curve, block) {
    this.curves.set(curve.toLowerCase(), this.timestamp(block));
    this.add(FACTORY, "LaunchCreated", { launchId: 1n, creator: CREATOR, token, curve, manifestHash: "0x" + "00".repeat(32) }, block, 0);
    this.transfer(token, ZERO, curve, 1000n, block, 1);
  }
  buy(token, curve, buyer, amount, block, tax = 0n) {
    this.add(curve, "Bought", { buyer, quoteAsset: WBNB, quoteIn: 1n, tokensOut: BigInt(amount), usdValue: 1n }, block, 2);
    if (tax) this.add(curve, "SnipeTaxCharged", { buyer, quoteAsset: WBNB, grossQuoteIn: 10n, taxAmount: BigInt(tax), taxBps: 500 }, block, 3);
    this.transfer(token, curve, buyer, amount, block, 4);
  }
}

/** The first scenario: a launch at block 100, buys inside and outside the 15-second window, a transfer and a burn. */
function scenario() {
  const chain = new FakeChain();
  chain.launch(TOKEN, CURVE, 100);
  chain.buy(TOKEN, CURVE, A, 100, 102, 5n); // 2 s after launch, taxed
  chain.buy(TOKEN, CURVE, B, 50, 110); // 10 s
  chain.buy(TOKEN, CURVE, D, 20, 130); // 30 s: outside the window
  chain.transfer(TOKEN, A, E, 40, 150);
  chain.transfer(TOKEN, B, ZERO, 50, 160); // burn
  return chain;
}

const options = (chain, store, extra = {}) => ({
  provider: { client: chain.client(), chunk: 25n, addressBatch: 2, source: "configured" },
  store,
  chainId: 97,
  factories: [{ address: FACTORY, kind: "standard" }],
  startBlock: 90n,
  budgetMs: 60_000,
  now: () => 1_700_000_000_000,
  ...extra,
});

async function balancesOf(store, token) {
  const [raw] = await store.pipeline([["HGETALL", holderKeys(97).bal(token)]]);
  const out = {};
  for (let i = 0; i < raw.length; i += 2) out[raw[i]] = raw[i + 1];
  return out;
}

const view = (store, token = TOKEN, supply = 950n) => readHolderView(store, 97, token, { exclude: [CURVE, CURVE3, DEAD, ZERO], totalSupply: supply });

test("transfers fold into exact balances; a sender going negative means history is missing", () => {
  const rows = [
    { token: TOKEN, from: ZERO, to: CURVE, value: 1000n, block: 1n, logIndex: 0 },
    { token: TOKEN, from: CURVE, to: A, value: 300n, block: 2n, logIndex: 0 },
    { token: TOKEN, from: A, to: ZERO, value: 100n, block: 3n, logIndex: 0 },
  ];
  const after = applyTransfers(new Map(), rows);
  assert.deepEqual([...after.entries()], [[CURVE, 700n], [A, 200n]]);
  assert.equal(after.has(ZERO), false, "the zero address is never a holder");
  assert.equal(applyTransfers(new Map(), [{ token: TOKEN, from: A, to: B, value: 1n, block: 1n, logIndex: 0 }]), null);
});

test("provider errors: pruned history and oversized ranges are told apart", () => {
  assert.equal(historyPruned(new Error(PRUNED)), true);
  assert.equal(rangeTooLarge(new Error(PRUNED)), false);
  assert.equal(rangeTooLarge(new Error("exceed maximum block range: 50000")), true);
  assert.equal(historyPruned(new Error("exceed maximum block range: 50000")), false);
  assert.equal(rangeTooLarge({ details: "query returned more than 10000 results" }), true);
  assert.equal(historyPruned(new Error("missing trie node abc")), true);
  assert.equal(rangeTooLarge(new Error("fetch failed")), false);
  assert.equal(historyPruned(new Error("fetch failed")), false);
});

test("the index follows launches from their creation block: balances, rank, Launch Shield window", async () => {
  const chain = scenario();
  const store = new MemoryStore();
  const run = await advanceHolderIndex(options(chain, store));
  assert.equal(run.status, "ok", run.message);
  assert.equal(run.cursor, "280");
  assert.equal(run.discovered, 1);
  assert.equal(run.transfers, 6);
  assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "60", [D]: "20", [E]: "40" });

  const result = await view(store);
  assert.equal(result.status, "tracked");
  assert.equal(result.holders, 3, "the curve is not a holder");
  assert.deepEqual(result.top.map((row) => [row.address, row.balance, row.early]), [[A, "60", true], [E, "40", false], [D, "20", false]]);
  assert.equal(result.top[0].share, 0.063157);
  assert.equal(result.topShare, 0.126315);
  assert.deepEqual(result.shield, {
    windowSeconds: 15,
    buys: 2,
    wallets: 2,
    tokens: "150",
    share: 0.157894,
    taxedBuys: 1,
    tax: [{ asset: WBNB, amount: "5" }],
    checked: 2,
    stillHolding: 1,
    holdingNow: "60",
    holdingShare: 0.063157,
  });
  assert.equal(result.indexedTo, "280");
  assert.equal(result.reconciledAt, null);

  // Nothing new: nothing changes, and nothing is counted twice.
  const again = await advanceHolderIndex(options(chain, store));
  assert.equal(again.chunks, 0);
  assert.deepEqual(await view(store), result);

  // New blocks: only they are read.
  chain.transfer(TOKEN, E, G, 10, 290);
  chain.head = 400n;
  const next = await advanceHolderIndex(options(chain, store));
  assert.equal(next.from, "281");
  assert.equal(next.cursor, "380");
  assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "60", [D]: "20", [E]: "30", [G]: "10" });
  assert.equal((await view(store)).holders, 4);
});

test("a launch created before the index began is untracked; unknown launches are untracked", async () => {
  const chain = scenario();
  const store = new MemoryStore();
  await advanceHolderIndex(options(chain, store, { startBlock: 120n }));
  assert.deepEqual(await view(store), { status: "untracked", indexedFrom: "120" });
  assert.equal((await view(store, a(0x1234))).status, "untracked");
});

test("a range refused for its size is split, and the smaller span sticks for the run", async () => {
  const chain = scenario();
  chain.maxRange = 100n;
  const store = new MemoryStore();
  const run = await advanceHolderIndex(options(chain, store, { provider: { client: chain.client(), chunk: 5_000n, addressBatch: 2, source: "configured" } }));
  assert.equal(run.status, "ok", run.message);
  assert.equal(run.cursor, "280");
  assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "60", [D]: "20", [E]: "40" });
  // 5000 → 2500 → … → 78: six refusals, then never wider than 78 again.
  assert.ok(chain.calls.getLogs < 40, `getLogs calls: ${chain.calls.getLogs}`);
});

test("pruned history marks tracked launches as gaps, resumes at the provider's edge, and repairs them only when provable", async () => {
  const chain = scenario();
  const store = new MemoryStore();
  await advanceHolderIndex(options(chain, store));

  // The index goes quiet; meanwhile G receives tokens in blocks the provider will prune.
  chain.transfer(TOKEN, A, G, 10, 3_000);
  chain.launch(TOKEN3, CURVE3, 6_000); // after the edge: still discoverable
  chain.head = 10_000n;
  chain.prunedBelow = 5_000n;
  const run = await advanceHolderIndex(options(chain, store, { provider: { client: chain.client(), chunk: 5_000n, addressBatch: 2, source: "configured" } }));
  assert.equal(run.status, "ok", run.message);
  assert.deepEqual(run.gap, { from: "281", to: "4999" });
  assert.equal(run.cursor, "9980");
  assert.equal(run.discovered, 1, "the launch after the edge is found");
  assert.equal(run.reconciled, 0, "G holds tokens the index never saw, so the check fails");
  assert.equal((await view(store)).status, "gap");
  assert.equal((await view(store, TOKEN3, 1000n)).status, "tracked");

  // Within the retry interval nothing is re-checked.
  chain.head = 12_000n;
  assert.equal((await advanceHolderIndex(options(chain, store))).reconciled, 0);

  // G sends everything back: the known addresses hold the whole supply again.
  chain.transfer(TOKEN, G, A, 10, 15_000);
  chain.head = 20_000n;
  const repaired = await advanceHolderIndex(options(chain, store));
  assert.equal(repaired.reconciled, 1);
  const result = await view(store);
  assert.equal(result.status, "tracked");
  assert.equal(result.reconciledAt, "19980");
  assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "60", [D]: "20", [E]: "40" });

  // From here on, transfers are followed again.
  chain.transfer(TOKEN, A, B, 5, 20_100);
  chain.head = 20_200n;
  await advanceHolderIndex(options(chain, store));
  assert.equal((await balancesOf(store, TOKEN))[B], "5");
});

test("a sender without the balance to send marks the launch inconsistent instead of guessing", async () => {
  const chain = scenario();
  chain.transfer(TOKEN, G, A, 1, 200); // G never received anything
  const store = new MemoryStore();
  await advanceHolderIndex(options(chain, store));
  const result = await view(store);
  assert.equal(result.status, "inconsistent");
});

test("one writer at a time, and a run that lost its lock writes nothing", async () => {
  const chain = scenario();
  const store = new MemoryStore();
  await store.pipeline([["SET", holderKeys(97).lock, "someone-else", "NX", "PX", "60000"]]);
  assert.equal((await advanceHolderIndex(options(chain, store))).status, "busy");
  await store.pipeline([["DEL", holderKeys(97).lock]]);

  // The lock is taken over after the first commit: the next commit is refused.
  const inner = new MemoryStore();
  let commits = 0;
  const stealing = {
    pipeline: (commands) => inner.pipeline(commands),
    transaction: async (commands) => {
      const result = await inner.transaction(commands);
      commits += 1;
      if (commits === 1) await inner.pipeline([["SET", holderKeys(97).lock, "thief", "PX", "60000"]]);
      return result;
    },
  };
  const run = await advanceHolderIndex(options(chain, stealing));
  assert.equal(run.status, "busy");
  assert.equal(commits, 1, "no commit after the lock was lost");
  const [lock] = await inner.pipeline([["GET", holderKeys(97).lock]]);
  assert.equal(lock, "thief", "the other run's lock is left alone");
});

test("the in-memory store keeps Redis semantics for the commands the index uses", async () => {
  let clock = 1_000;
  const store = new MemoryStore(() => clock);
  assert.deepEqual(await store.pipeline([["SET", "k", "1", "NX", "PX", "100"], ["SET", "k", "2", "NX", "PX", "100"], ["GET", "k"]]), ["OK", null, "1"]);
  clock += 101;
  assert.deepEqual(await store.pipeline([["GET", "k"], ["SET", "k", "3", "NX", "PX", "100"], ["PEXPIRE", "k", "500"]]), [null, "OK", 1]);
  clock += 400;
  assert.deepEqual(await store.pipeline([["GET", "k"], ["PEXPIRE", "missing", "5"]]), ["3", 0]);
  await store.transaction([["ZADD", "z", "1.5", "a", "3", "b", "3", "c"], ["HSET", "h", "a", "1", "b", "2"]]);
  assert.deepEqual(await store.pipeline([["ZREVRANGE", "z", "0", "1", "WITHSCORES"], ["ZCARD", "z"], ["ZSCORE", "z", "a"], ["HMGET", "h", "a", "x"]]), [["c", "3", "b", "3"], 3, "1.5", ["1", null]]);
  await store.pipeline([["HDEL", "h", "a", "b"], ["ZREM", "z", "a", "b", "c"]]);
  assert.deepEqual(await store.pipeline([["HGETALL", "h"], ["ZCARD", "z"]]), [[], 0]);
  await assert.rejects(store.pipeline([["HGET", "k", "x"]]), /WRONGTYPE/);
});

test("holder analytics stay off unless a store is configured, and memory is never used on Vercel", () => {
  assert.equal(holderStore({}), null);
  assert.ok(holderStore({ FORTUNE_HOLDER_INDEX_STORE: "memory" }) instanceof MemoryStore);
  assert.equal(holderStore({ FORTUNE_HOLDER_INDEX_STORE: "memory", VERCEL: "1" }), null);
  assert.ok(holderStore({ UPSTASH_REDIS_REST_URL: "https://good-cat-123.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }) instanceof UpstashStore);
  assert.equal(holderStore({ UPSTASH_REDIS_REST_URL: "https://evil.example", UPSTASH_REDIS_REST_TOKEN: "t" }), null);
  assert.equal(holderStore({ UPSTASH_REDIS_REST_URL: "https://good-cat-123.upstash.io" }), null);
  assert.equal(holderStore({ UPSTASH_REDIS_REST_URL: "https://good-cat-123.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t", FORTUNE_HOLDER_INDEX_ENABLED: "false" }), null);
  assert.throws(() => new UpstashStore("http://127.0.0.1:1", "t"), /Invalid Upstash/);
});

test("the Upstash client sends pipelines and transactions over REST and fails loudly", async () => {
  const seen = [];
  let reply = (commands) => [200, commands.map((command) => ({ result: command[0] === "GET" ? "v" : "OK" }))];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const commands = JSON.parse(body);
      seen.push({ path: req.url, auth: req.headers.authorization, commands });
      const [status, json] = reply(commands);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const store = new UpstashStore(url, "secret-token", fetch, /^http:\/\/127\.0\.0\.1:\d+$/);
  try {
    assert.deepEqual(await store.pipeline([["SET", "k", 1], ["GET", "k"]]), ["OK", "v"]);
    assert.deepEqual(await store.transaction([["HSET", "h", "f", 2]]), ["OK"]);
    assert.deepEqual(seen.map((row) => [row.path, row.auth]), [["/pipeline", "Bearer secret-token"], ["/multi-exec", "Bearer secret-token"]]);
    assert.deepEqual(seen[0].commands, [["SET", "k", "1"], ["GET", "k"]], "every argument is sent as a string");
    assert.deepEqual(await store.pipeline([]), []);

    reply = () => [200, [{ error: "WRONGTYPE" }]];
    await assert.rejects(store.pipeline([["GET", "k"]]), /WRONGTYPE/);
    reply = () => [200, []];
    await assert.rejects(store.pipeline([["GET", "k"]]), /Unexpected Upstash response/);
    reply = () => [500, { error: "down" }];
    await assert.rejects(store.pipeline([["GET", "k"]]), /HTTP 500/);
  } finally {
    server.close();
  }
});
