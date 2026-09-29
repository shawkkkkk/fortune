import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMIT_IF_OWNER_SCRIPT, MemoryStore, RELEASE_IF_OWNER_SCRIPT, UpstashStore, commitIfOwnerCommand, holderStore, splitCommand } from "../../lib/holder-store.ts";
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
    commitIfOwner: async (...args) => {
      const written = await inner.commitIfOwner(...args);
      if (written) commits += 1;
      if (commits === 1) await inner.pipeline([["SET", holderKeys(97).lock, "thief", "PX", "60000"]]);
      return written;
    },
    releaseIfOwner: (...args) => inner.releaseIfOwner(...args),
  };
  const run = await advanceHolderIndex(options(chain, stealing));
  assert.equal(run.status, "busy");
  assert.equal(commits, 1, "no commit after the lock was lost");
  const [lock] = await inner.pipeline([["GET", holderKeys(97).lock]]);
  assert.equal(lock, "thief", "the other run's lock is left alone");
});

/** Everything the index keeps for the chain and TOKEN, for before/after comparisons. */
async function snapshot(store) {
  const keys = holderKeys(97);
  return store.pipeline([["HGETALL", keys.state], ["HGETALL", keys.tokens], ["HGETALL", keys.bal(TOKEN)], ["ZREVRANGE", keys.rank(TOKEN), "0", "-1", "WITHSCORES"], ["HGETALL", keys.shield(TOKEN)], ["SMEMBERS", keys.buyers(TOKEN)]]);
}

/**
 * Wraps a store so its run stops at its first ownership check: right after
 * reading the lock when that is its own request, or just before the atomic
 * commit that performs the check on the server.
 */
function pausedAtOwnershipCheck(store, lockKey) {
  let reached;
  let resume;
  const atCheck = new Promise((resolve) => (reached = resolve));
  const gate = new Promise((resolve) => (resume = resolve));
  let paused = false;
  const pause = async () => {
    if (paused) return;
    paused = true;
    reached();
    await gate;
  };
  return {
    atCheck,
    resume,
    store: {
      async pipeline(commands) {
        const result = await store.pipeline(commands);
        if (commands.some(([name, key]) => name === "GET" && key === lockKey)) await pause();
        return result;
      },
      async commitIfOwner(...args) {
        await pause();
        return store.commitIfOwner(...args);
      },
      releaseIfOwner: (...args) => store.releaseIfOwner(...args),
    },
  };
}

test("a writer paused at its ownership check, whose lease then expires, can never write", async () => {
  let clock = 1_000_000;
  const shared = new MemoryStore(() => clock);
  const keys = holderKeys(97);
  const chain = scenario();
  assert.equal((await advanceHolderIndex(options(chain, shared))).cursor, "280");
  chain.transfer(TOKEN, E, G, 10, 290); // first range after the cursor
  chain.transfer(TOKEN, A, B, 5, 320); // a later range
  chain.head = 360n; // ranges 281-305, 306-330, 331-340

  // The old writer stops at its first commit, then its lease (budget + 60 s) runs out.
  const old = pausedAtOwnershipCheck(shared, keys.lock);
  const oldRun = advanceHolderIndex(options(chain, old.store, { lockId: "old-writer" }));
  await old.atCheck;
  clock += 120_001;

  // A new writer takes the expired lease and folds every range.
  const fresh = await advanceHolderIndex(options(chain, shared, { lockId: "new-writer" }));
  assert.equal(fresh.status, "ok", fresh.message);
  assert.equal(fresh.cursor, "340");
  const before = await snapshot(shared);

  // The old writer resumes and must change nothing: no rollback of the cursor, no second fold.
  old.resume();
  const stale = await oldRun;
  assert.equal(stale.status, "busy");
  assert.deepEqual(await snapshot(shared), before, "the old writer wrote nothing");
  assert.deepEqual(await balancesOf(shared, TOKEN), { [CURVE]: "830", [A]: "55", [B]: "5", [D]: "20", [E]: "30", [G]: "10" });
  const next = await advanceHolderIndex(options(chain, shared));
  assert.equal(next.chunks, 0);
  assert.deepEqual(await balancesOf(shared, TOKEN), Object.fromEntries([...chain.balances(TOKEN, 340n)].filter(([, value]) => value > 0n).map(([holder, value]) => [holder, value.toString()])), "balances match the chain");

  // An old writer that resumes while a new one holds the lock leaves that lock alone.
  const late = pausedAtOwnershipCheck(shared, keys.lock);
  chain.transfer(TOKEN, E, D, 1, 350);
  chain.head = 380n;
  const lateRun = advanceHolderIndex(options(chain, late.store, { lockId: "late-writer" }));
  await late.atCheck;
  clock += 120_001;
  await shared.pipeline([["SET", keys.lock, "current-writer", "NX", "PX", "60000"]]);
  late.resume();
  assert.equal((await lateRun).status, "busy");
  const [lock] = await shared.pipeline([["GET", keys.lock]]);
  assert.equal(lock, "current-writer", "the current writer keeps its lock");
});

test("the in-memory store keeps Redis semantics for the commands the index uses", async () => {
  let clock = 1_000;
  const store = new MemoryStore(() => clock);
  assert.deepEqual(await store.pipeline([["SET", "k", "1", "NX", "PX", "100"], ["SET", "k", "2", "NX", "PX", "100"], ["GET", "k"]]), ["OK", null, "1"]);
  clock += 101;
  assert.deepEqual(await store.pipeline([["GET", "k"], ["SET", "k", "3", "NX", "PX", "100"], ["PEXPIRE", "k", "500"]]), [null, "OK", 1]);
  clock += 400;
  assert.deepEqual(await store.pipeline([["GET", "k"], ["PEXPIRE", "missing", "5"]]), ["3", 0]);
  await store.pipeline([["ZADD", "z", "1.5", "a", "3", "b", "3", "c"], ["HSET", "h", "a", "1", "b", "2"]]);
  assert.deepEqual(await store.pipeline([["ZREVRANGE", "z", "0", "1", "WITHSCORES"], ["ZCARD", "z"], ["ZSCORE", "z", "a"], ["HMGET", "h", "a", "x"]]), [["c", "3", "b", "3"], 3, "1.5", ["1", null]]);
  await store.pipeline([["HDEL", "h", "a", "b"], ["ZREM", "z", "a", "b", "c"]]);
  assert.deepEqual(await store.pipeline([["HGETALL", "h"], ["ZCARD", "z"]]), [[], 0]);
  await assert.rejects(store.pipeline([["HGET", "k", "x"]]), /WRONGTYPE/);

  // Commits and releases happen only for the lock's owner, and a commit extends the lease.
  await store.pipeline([["SET", "lock", "me", "PX", "100"]]);
  assert.equal(await store.commitIfOwner("lock", "you", 1_000, [["HSET", "w", "f", "1"]]), false);
  assert.deepEqual(await store.pipeline([["HGETALL", "w"]]), [[]], "a refused commit writes nothing");
  assert.equal(await store.commitIfOwner("lock", "me", 1_000, [["HSET", "w", "f", "1"], ["SADD", "s", "x"]]), true);
  assert.deepEqual(await store.pipeline([["HGETALL", "w"], ["SMEMBERS", "s"]]), [["f", "1"], ["x"]]);
  clock += 900;
  assert.deepEqual(await store.pipeline([["GET", "lock"]]), ["me"], "the commit extended the lease");
  assert.equal(await store.releaseIfOwner("lock", "you"), false);
  assert.equal(await store.releaseIfOwner("lock", "me"), true);
  assert.equal(await store.commitIfOwner("lock", "me", 1_000, [["HSET", "w", "f", "2"]]), false, "a released lock is never this run's again");
});

test("long commands are split into equivalent ones that Lua can unpack", () => {
  const fields = Array.from({ length: 1_500 }, (_, i) => [`f${i}`, String(i)]).flat();
  const parts = splitCommand(["HSET", "h", ...fields], 1_000);
  assert.ok(parts.length > 1 && parts.every((part) => part.length <= 1_000 && part[0] === "HSET" && part[1] === "h" && part.length % 2 === 0));
  assert.deepEqual(parts.flatMap((part) => part.slice(2)), fields, "pairs stay together and in order");
  const members = Array.from({ length: 2_500 }, (_, i) => `m${i}`);
  assert.deepEqual(splitCommand(["SADD", "s", ...members], 1_000).flatMap((part) => part.slice(2)), members);
  assert.deepEqual(splitCommand(["DEL", "a", "b"]), [["DEL", "a", "b"]]);
  const [eval_, script, numkeys, ...rest] = commitIfOwnerCommand("lock", "me", 5_000, [["HSET", "h", "f", "1"], ["DEL", "a", "b"], ["SADD", "h2", "x"]]);
  assert.equal(eval_, "EVAL");
  assert.equal(script, COMMIT_IF_OWNER_SCRIPT);
  assert.equal(numkeys, 5);
  assert.deepEqual(rest, ["lock", "h", "a", "b", "h2", "me", 5_000, 4, "HSET", "h", "f", "1", 3, "DEL", "a", "b", 3, "SADD", "h2", "x"]);
});

// A minimal RESP client, enough to run the scripts on a real Redis server.
function parseResp(buffer, at) {
  const eol = buffer.indexOf("\r\n", at);
  if (eol < 0) return null;
  const type = String.fromCharCode(buffer[at]);
  const head = buffer.toString("utf8", at + 1, eol);
  const next = eol + 2;
  if (type === "+") return { value: head, end: next };
  if (type === "-") return { value: new Error(head), end: next };
  if (type === ":") return { value: Number(head), end: next };
  if (type === "$") {
    const length = Number(head);
    if (length < 0) return { value: null, end: next };
    return buffer.length < next + length + 2 ? null : { value: buffer.toString("utf8", next, next + length), end: next + length + 2 };
  }
  if (type === "*") {
    const items = [];
    let position = next;
    for (let i = 0; i < Number(head); i += 1) {
      const item = parseResp(buffer, position);
      if (!item) return null;
      items.push(item.value);
      position = item.end;
    }
    return { value: items, end: position };
  }
  throw new Error("Unexpected RESP reply " + type);
}

async function redisClient(path) {
  const socket = createConnection(path);
  await new Promise((resolve, reject) => socket.once("connect", resolve).once("error", reject));
  let buffer = Buffer.alloc(0);
  const waiting = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (let parsed = parseResp(buffer, 0); parsed && waiting.length; parsed = parseResp(buffer, 0)) {
      buffer = buffer.subarray(parsed.end);
      const { resolve, reject } = waiting.shift();
      if (parsed.value instanceof Error) reject(parsed.value);
      else resolve(parsed.value);
    }
  });
  return {
    send: (args) => new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
      socket.write(`*${args.length}\r\n` + args.map((arg) => `$${Buffer.byteLength(String(arg))}\r\n${arg}\r\n`).join(""));
    }),
    close: () => socket.end(),
  };
}

test("the commit and release scripts hold on a real Redis server", async (t) => {
  if (spawnSync("redis-server", ["--version"]).error) return t.skip("redis-server is not installed");
  const dir = mkdtempSync(join(tmpdir(), "fortune-redis-"));
  const path = join(dir, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", path, "--save", "", "--appendonly", "no", "--dir", dir], { stdio: "ignore" });
  try {
    for (let i = 0; i < 100 && !existsSync(path); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const redis = await redisClient(path);
    try {
      await redis.send(["SET", "lock", "me", "PX", "1000"]);
      assert.equal(await redis.send(commitIfOwnerCommand("lock", "you", 60_000, [["HSET", "h", "f", "1"]])), 0);
      assert.equal(await redis.send(["EXISTS", "h"]), 0, "a refused commit writes nothing");

      // The owner's commit extends the lease and applies every write, including one longer than Lua can unpack at once.
      const fields = Array.from({ length: 6_000 }, (_, i) => [`f${i}`, String(i)]).flat();
      await redis.send(["SET", "gone", "x"]);
      assert.equal(await redis.send(commitIfOwnerCommand("lock", "me", 60_000, [["HSET", "h", ...fields], ["ZADD", "z", "5", "a"], ["SADD", "s", "x"], ["DEL", "gone"]])), 1);
      assert.equal(await redis.send(["HLEN", "h"]), 6_000);
      assert.deepEqual(await redis.send(["ZRANGE", "z", "0", "-1", "WITHSCORES"]), ["a", "5"]);
      assert.deepEqual(await redis.send(["SMEMBERS", "s"]), ["x"]);
      assert.equal(await redis.send(["EXISTS", "gone"]), 0);
      assert.ok((await redis.send(["PTTL", "lock"])) > 59_000, "the commit extended the lease");
      await assert.rejects(redis.send(["EVAL", COMMIT_IF_OWNER_SCRIPT, 2, "lock", "h", "me", 60_000, fields.length + 2, "HSET", "h", ...fields]), /unpack|too many/i, "unsplit, the same write is too long for Lua");

      // Only the owner releases, and a lock that is gone is nobody's.
      assert.equal(await redis.send(["EVAL", RELEASE_IF_OWNER_SCRIPT, 1, "lock", "you"]), 0);
      assert.equal(await redis.send(["GET", "lock"]), "me");
      assert.equal(await redis.send(["EVAL", RELEASE_IF_OWNER_SCRIPT, 1, "lock", "me"]), 1);
      assert.equal(await redis.send(commitIfOwnerCommand("lock", "me", 60_000, [["HSET", "h", "f0", "changed"]])), 0);
      assert.equal(await redis.send(["HGET", "h", "f0"]), "0");
    } finally {
      redis.close();
    }
  } finally {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the index runs through the Upstash client on a real Redis server, and a paused writer still cannot write", async (t) => {
  if (spawnSync("redis-server", ["--version"]).error) return t.skip("redis-server is not installed");
  const dir = mkdtempSync(join(tmpdir(), "fortune-redis-"));
  const path = join(dir, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", path, "--save", "", "--appendonly", "no", "--dir", dir], { stdio: "ignore" });
  let rest;
  try {
    for (let i = 0; i < 100 && !existsSync(path); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const redis = await redisClient(path);
    // Upstash's REST pipeline endpoint, in front of the real server.
    rest = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const rows = [];
        for (const command of JSON.parse(body)) {
          rows.push(await redis.send(command).then((result) => ({ result }), (error) => ({ error: error.message })));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(rows));
      });
    });
    await new Promise((resolve) => rest.listen(0, "127.0.0.1", resolve));
    const store = new UpstashStore(`http://127.0.0.1:${rest.address().port}`, "token", fetch, /^http:\/\/127\.0\.0\.1:\d+$/);
    const keys = holderKeys(97);
    try {
      const chain = scenario();
      const first = await advanceHolderIndex(options(chain, store));
      assert.equal(first.status, "ok", first.message);
      assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "60", [D]: "20", [E]: "40" });
      assert.deepEqual((await view(store)).shield.tax, [{ asset: WBNB, amount: "5" }]);

      chain.transfer(TOKEN, E, G, 10, 290);
      chain.transfer(TOKEN, A, B, 5, 320);
      chain.head = 360n;
      const old = pausedAtOwnershipCheck(store, keys.lock);
      const oldRun = advanceHolderIndex(options(chain, old.store, { lockId: "old-writer" }));
      await old.atCheck;
      await redis.send(["DEL", keys.lock]); // the old writer's lease runs out
      assert.equal((await advanceHolderIndex(options(chain, store, { lockId: "new-writer" }))).cursor, "340");
      const before = await snapshot(store);
      old.resume();
      assert.equal((await oldRun).status, "busy");
      assert.deepEqual(await snapshot(store), before, "the old writer wrote nothing");
      assert.deepEqual(await balancesOf(store, TOKEN), { [CURVE]: "830", [A]: "55", [B]: "5", [D]: "20", [E]: "30", [G]: "10" });
      assert.equal(await redis.send(["EXISTS", keys.lock]), 0, "every run released its lock");
    } finally {
      redis.close();
    }
  } finally {
    rest?.close();
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
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

test("the Upstash client sends pipelines and owner-checked scripts over REST and fails loudly", async () => {
  const seen = [];
  let reply = (commands) => [200, commands.map((command) => ({ result: command[0] === "GET" ? "v" : command[0] === "EVAL" ? 1 : "OK" }))];
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
    assert.equal(await store.commitIfOwner("lock", "me", 5_000, [["HSET", "h", "f", 2]]), true);
    assert.equal(await store.releaseIfOwner("lock", "me"), true);
    assert.deepEqual(seen.map((row) => [row.path, row.auth]), [["/pipeline", "Bearer secret-token"], ["/pipeline", "Bearer secret-token"], ["/pipeline", "Bearer secret-token"]]);
    assert.deepEqual(seen[0].commands, [["SET", "k", "1"], ["GET", "k"]], "every argument is sent as a string");
    assert.deepEqual(seen[1].commands, [commitIfOwnerCommand("lock", "me", 5_000, [["HSET", "h", "f", 2]]).map(String)], "one script does the check and the writes");
    assert.deepEqual(seen[2].commands, [["EVAL", RELEASE_IF_OWNER_SCRIPT, "1", "lock", "me"]]);
    reply = (commands) => [200, commands.map(() => ({ result: 0 }))];
    assert.equal(await store.commitIfOwner("lock", "me", 5_000, [["HSET", "h", "f", 2]]), false, "a refused commit reads as false");
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
