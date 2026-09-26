import test from "node:test";
import assert from "node:assert/strict";
import { activityFor, covers, curveSpotPrice, isChartRange, rankMarkets, supplyBeforeTrade } from "../../lib/market-insights.ts";
import { readOfficialPools, readTokenDecimals, v3PriceInQuote } from "../../lib/market-pools.ts";
import { FORTUNE_NETWORK } from "../../lib/fortune-network.ts";
import { readLedger, resetLedgerState } from "../../lib/trade-ledger.ts";
import { formatPrice, formatUsd } from "../../lib/market-format.ts";

const E18 = 10n ** 18n;

test("curve spot prices are rebuilt exactly by walking supply back from the head", () => {
  const base = 1_000_000_000_000_000n; // $0.001
  const slope = 1_000_000n; // $1e-12 per token
  // Head supply after three trades: buy 600, sell 100, buy 500 (oldest first).
  let sold = 1_000n * E18;
  const newestFirst = [["buy", 500n * E18], ["sell", 100n * E18], ["buy", 600n * E18]];
  const prices = [];
  for (const [side, tokens] of newestFirst) {
    prices.push(curveSpotPrice(base, slope, sold));
    sold = supplyBeforeTrade(sold, side, tokens);
  }
  assert.equal(sold, 0n, "walking back every trade returns to an empty curve");
  assert.deepEqual(prices, [
    base + slope * 1000n,
    base + slope * 500n,
    base + slope * 600n,
  ]);
});

test("V3 sqrtPriceX96 converts to launch-token price in quote units for both token orders", () => {
  const Q96 = 2n ** 96n;
  // 1 launch token (token0) = 0.25 quote (token1), both 18 decimals: sqrt(0.25) = 0.5.
  assert.ok(Math.abs(v3PriceInQuote(Q96 / 2n, true, 18, 18) - 0.25) < 1e-12);
  // Same pool with the launch token as token1: price is the inverse of token1-per-token0 (4).
  assert.ok(Math.abs(v3PriceInQuote(Q96 * 2n, false, 18, 18) - 0.25) < 1e-12);
  // Decimals: launch 18 (token0) against a 6-decimal quote at 0.25 whole quote per token.
  const raw = 0.25 * 10 ** (6 - 18);
  const sqrt = BigInt(Math.round(Math.sqrt(raw) * 2 ** 96));
  assert.ok(Math.abs(v3PriceInQuote(sqrt, true, 18, 6) - 0.25) / 0.25 < 1e-9);
});

test("a window counts as covered only when the scanned blocks span all of it", () => {
  const now = 1_000_000;
  assert.equal(covers(null, 60), false);
  assert.equal(covers({ requestedFrom: now - 86_400, fromTimestamp: now - 86_400, toTimestamp: now, complete: true }, 86_400), true);
  assert.equal(covers({ requestedFrom: now - 86_400, fromTimestamp: now - 40_000, toTimestamp: now, complete: false }, 86_400), false);
  assert.equal(covers({ requestedFrom: now - 86_400, fromTimestamp: now - 40_000, toTimestamp: now, complete: false }, 21_600), true);
});

test("rankings put unknown values last and fall back to newest", () => {
  const item = (id, createdAt, marketCapUsd, trades, volume) => ({
    id, createdAt, marketCapUsd,
    activity24h: volume === null ? null : { volumeUsd: volume, trades, buys: 0, sells: 0, lastTradeAt: null },
    activityTrending: trades === null ? null : { volumeUsd: volume ?? 0, trades, buys: 0, sells: 0, lastTradeAt: null },
  });
  const items = () => [item("a", 1, 50, 3, 10), item("b", 2, null, null, null), item("c", 3, 50, 3, 99), item("d", 4, 900, 1, 5)];
  assert.deepEqual(rankMarkets(items(), "marketCap").map((x) => x.id), ["d", "c", "a", "b"]);
  assert.deepEqual(rankMarkets(items(), "volume24h").map((x) => x.id), ["c", "a", "d", "b"]);
  assert.deepEqual(rankMarkets(items(), "trending").map((x) => x.id), ["c", "a", "d", "b"]);
  assert.deepEqual(rankMarkets(items(), "newest").map((x) => x.id), ["d", "c", "b", "a"]);
});

function fakeProvider({ head, prunedBelow, failAddressCountAbove = 9 }) {
  const calls = [];
  const blockTime = 0.45;
  const block = (number) => ({ number, hash: "0x" + number.toString(16).padStart(64, "0"), timestamp: BigInt(Math.round(2_000_000_000 - Number(head - number) * blockTime)) });
  const client = {
    getChainId: async () => FORTUNE_NETWORK.chainId,
    getBlock: async ({ blockTag, blockNumber }) => block(blockTag === "latest" ? head : blockNumber),
    getLogs: async ({ address, fromBlock, toBlock }) => {
      calls.push({ count: address.length, fromBlock, toBlock });
      if (address.length > failAddressCountAbove) throw Object.assign(new Error("RPC error"), { details: "Request blocked" });
      if (fromBlock < prunedBelow) throw Object.assign(new Error("RPC error"), { details: "History has been pruned for this block." });
      return [];
    },
  };
  return { provider: { client, chunk: 45_000n, addressBatch: 9, source: "public-default" }, calls };
}

test("the ledger batches addresses, narrows at the pruned edge and reports honest coverage", async () => {
  resetLedgerState();
  const head = 10_000_000n;
  const { provider, calls } = fakeProvider({ head, prunedBelow: head - 89_850n });
  const addresses = Array.from({ length: 14 }, (_, i) => "0x" + String(i + 1).padStart(40, "0"));
  const scan = await readLedger(provider, addresses, 86_400);

  assert.ok(calls.every((call) => call.count <= 9), "never more than nine addresses per filter");
  assert.equal(scan.coverage.complete, false, "a pruned provider cannot complete a 24h window");
  const depth = BigInt(scan.coverage.toBlock) - BigInt(scan.coverage.fromBlock);
  assert.ok(depth <= 89_850n && depth > 88_000n, "coverage ends close to the real history edge, got " + depth);
  assert.ok(covers(scan.coverage, 6 * 3600), "six hours is fully covered");
  assert.ok(!covers(scan.coverage, 86_400), "twenty-four hours is not");
});

test("unknown USD valuations never become zero or a partial volume total", () => {
  const trade = usdValue => ({ timestamp: 100, side: "buy", usdValue });
  assert.equal(activityFor([trade(7), trade(null)], 0).volumeUsd, null);
  assert.equal(activityFor([trade(7), trade(3)], 0).volumeUsd, 10);
  assert.equal(activityFor([], 0).volumeUsd, 0);
  assert.equal(activityFor([trade(NaN)], 0).volumeUsd, null);
  const items = [
    { createdAt: 2, activity24h: { volumeUsd: null } },
    { createdAt: 1, activity24h: { volumeUsd: 4 } },
  ];
  assert.equal(rankMarkets(items, "volume24h")[0].createdAt, 1);
});

test("ledger timestamps come from verified headers and duplicate logs count once", async () => {
  resetLedgerState();
  const head = 20_000_000n;
  const address = "0x" + "ab".repeat(20);
  const { provider } = fakeProvider({ head, prunedBelow: 0n });
  const getBlock = provider.client.getBlock;
  provider.client.getBlock = async args => {
    const block = await getBlock(args);
    return args.blockNumber === head - 1n ? { ...block, timestamp: 1_999_999_877n } : block;
  };
  provider.client.getLogs = async ({ fromBlock, toBlock }) => {
    const rows = [];
    for (const [number, logIndex] of [[head - 1n, 0], [head - 2n, 1]]) {
      if (number < fromBlock || number > toBlock) continue;
      const block = await provider.client.getBlock({ blockNumber: number });
      const row = { address, eventName: "Bought", args: {}, blockNumber: number, blockHash: block.hash,
        logIndex, transactionIndex: 0, transactionHash: "0x" + "12".repeat(32), removed: false };
      rows.push(row, row);
    }
    return rows;
  };
  const scan = await readLedger(provider, [address], 60);
  assert.equal(scan.logs.length, 1, "header timestamp excludes the older trade despite estimated cadence");
  assert.equal(scan.logs[0].timestamp, 1_999_999_999);
});

test("ledger rejects wrong chain and stale cached fork, and isolates providers", async () => {
  resetLedgerState();
  const head = 20_000_000n;
  const address = "0x" + "ab".repeat(20);
  const { provider } = fakeProvider({ head, prunedBelow: 0n });
  const first = await readLedger(provider, [address], 60);
  const getBlock = provider.client.getBlock;
  provider.client.getBlock = async args => ({ ...(await getBlock(args)), hash: "0x" + "ee".repeat(32) });
  const second = await readLedger(provider, [address], 60);
  assert.notEqual(first.head.hash, second.head.hash);
  const other = fakeProvider({ head: head + 100n, prunedBelow: 0n }).provider;
  assert.equal((await readLedger(other, [address], 60)).head.number, head + 100n);
  provider.client.getChainId = async () => 1;
  await assert.rejects(readLedger(provider, [address], 60), /Wrong ledger chain/);
});

test("ledger rejects invalid scan windows before contacting the provider", async () => {
  const provider = fakeProvider({ head: 20_000_000n, prunedBelow: 0n }).provider;
  for (const value of [NaN, -1, 0, 31 * 86_400]) await assert.rejects(readLedger(provider, [], value), /Invalid ledger window/);
});

test("pool provenance cannot reuse a same-count locker cache across a reorg", async () => {
  const token = "0x" + "aa".repeat(20), quote = "0x" + "bb".repeat(20);
  let fork = 1;
  const rpc = {
    getChainId: async () => FORTUNE_NETWORK.chainId,
    getBlock: async ({ blockNumber }) => ({ number: blockNumber, hash: "0x" + String(fork).repeat(64) }),
    readContract: async () => 1n,
    multicall: async ({ contracts }) => contracts.map(c => ({ status: "success", result:
      c.functionName === "lockedPairs" ? "0x" + String(fork).repeat(40) : c.functionName === "token0" ? token : quote })),
  };
  const launches = [{ token, mode: "tax", graduated: true, quoteAssets: [quote] }];
  assert.equal((await readOfficialPools(rpc, launches, 100n)).get(token)[0].address, "0x" + "1".repeat(40));
  fork = 2;
  assert.equal((await readOfficialPools(rpc, launches, 100n)).get(token)[0].address, "0x" + "2".repeat(40));
  assert.equal((await readOfficialPools(rpc, [{ ...launches[0], graduated: false }], 100n)).size, 0);
});

test("token decimals use the requested block instead of a permanent address cache", async () => {
  const token = "0x" + "aa".repeat(20);
  const rpc = { multicall: async ({ blockNumber }) => [{ status: "success", result: blockNumber === 1n ? 6 : 18 }] };
  assert.equal((await readTokenDecimals(rpc, [token], 1n))(token), 6);
  assert.equal((await readTokenDecimals(rpc, [token], 2n))(token), 18);
});

test("market range validation rejects inherited object keys without RPC calls", () => {
  for (const range of ["constructor", "toString", "__proto__"]) {
    assert.equal(isChartRange(range), false);
  }
  for (const range of ["24h", "7d", "30d"]) assert.equal(isChartRange(range), true);
});

test("a complete window is marked complete and a reorganized head is rejected", async () => {
  resetLedgerState();
  const head = 20_000_000n;
  const { provider } = fakeProvider({ head, prunedBelow: 0n });
  const scan = await readLedger(provider, ["0x" + "ab".repeat(20)], 3_600);
  assert.equal(scan.coverage.complete, true);
  assert.ok(covers(scan.coverage, 3_600));

  resetLedgerState();
  const reorg = {
    ...provider,
    client: {
      ...provider.client,
      getBlock: async (args) => {
        const block = await provider.client.getBlock(args);
        // The head is pinned by tag; re-reading it by number after the scan finds a different hash.
        return args.blockNumber === head ? { ...block, hash: "0x" + "ff".repeat(32) } : block;
      },
    },
  };
  await assert.rejects(readLedger(reorg, ["0x" + "cd".repeat(20)], 3_600), /head changed/);
});

test("prices keep four significant digits with subscript zero runs", () => {
  assert.equal(formatPrice(0.0010000009999995), "$0.001");
  assert.equal(formatPrice(0.0009191554627), "$0.0009191");
  assert.equal(formatPrice(0.00000012345), "$0.0₆1234");
  assert.equal(formatPrice(1234.5), "$1,235");
  assert.equal(formatPrice(null), "—");
  assert.equal(formatUsd(2.0000005), "$2.00");
  assert.equal(formatUsd(120_435), "$120.44K");
});
