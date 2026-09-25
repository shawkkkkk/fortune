import test from "node:test";
import assert from "node:assert/strict";
import { readFactoryCatalog, CATALOG_LIMIT } from "../../lib/factory-catalog.ts";

let seed = 10;
function fixture(count = 30) {
  const factory = "0x" + (++seed).toString(16).padStart(40, "0");
  const sources = [{ factory, mode: "standard" }];
  const state = { count, head: 100n, hash: "0x" + "aa".repeat(32), reads: [], fail: false, chainId: 97 };
  const rpc = {
    getChainId: async () => state.chainId,
    getBlock: async ({ blockNumber }) => ({ number: blockNumber ?? state.head, hash: state.hash }),
    multicall: async ({ contracts, blockNumber }) => contracts.map(c => {
      assert.equal(blockNumber, state.head);
      if (c.functionName === "launchCount") return { status: "success", result: BigInt(state.count) };
      const i = Number(c.args[0]);
      state.reads.push(i);
      if (state.fail && i === 2) return { status: "failure" };
      const address = "0x" + (i + 1).toString(16).padStart(40, "0");
      return { status: "success", result: [factory, address, address, factory, factory, factory, factory, state.hash, state.hash, BigInt(i)] };
    }),
  };
  return { rpc, sources, state };
}

test("catalog includes launches older than the recent 25 and coalesces concurrent reads", async () => {
  const { rpc, sources, state } = fixture(125);
  const [a, b] = await Promise.all([readFactoryCatalog(rpc, sources, 97), readFactoryCatalog(rpc, sources, 97)]);
  assert.equal(a, b);
  assert.equal(a.total, 125);
  assert.equal(a.entries[124].index, 0);
  assert.equal(state.reads.length, 125);
  assert.equal(a.blockNumber, 100n);
});

test("wrong chain and oversized histories fail before reading entries", async () => {
  const a = fixture();
  a.state.chainId = 56;
  await assert.rejects(readFactoryCatalog(a.rpc, a.sources, 97), /wrong chain/);
  assert.equal(a.state.reads.length, 0);
  const b = fixture(CATALOG_LIMIT + 1);
  await assert.rejects(readFactoryCatalog(b.rpc, b.sources, 97), /production indexer/);
  assert.equal(b.state.reads.length, 0);
});

test("incomplete RPC reads never produce or cache a partial catalog", async () => {
  const { rpc, sources, state } = fixture();
  state.fail = true;
  await assert.rejects(readFactoryCatalog(rpc, sources, 97), /incomplete/);
  state.fail = false;
  const result = await readFactoryCatalog(rpc, sources, 97);
  assert.equal(result.entries.length, 30);
});

test("incremental refresh reads new entries, but a reorg rebuilds the catalog", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const { rpc, sources, state } = fixture(3);
  await readFactoryCatalog(rpc, sources, 97);
  now += 9000;
  state.count = 4;
  state.head += 1n;
  state.reads = [];
  await readFactoryCatalog(rpc, sources, 97);
  assert.deepEqual(state.reads, [3]);
  now += 9000;
  state.hash = "0x" + "bb".repeat(32);
  state.count = 2;
  state.reads = [];
  const result = await readFactoryCatalog(rpc, sources, 97);
  assert.deepEqual(state.reads, [0, 1]);
  assert.equal(result.total, 2);
  assert.equal(result.blockHash, state.hash);
});

test("a block change during the read prevents publication", async () => {
  const { rpc, sources } = fixture();
  let calls = 0;
  rpc.getBlock = async () => ({ number: 100n, hash: "0x" + (++calls === 1 ? "aa" : "bb").repeat(32) });
  await assert.rejects(readFactoryCatalog(rpc, sources, 97), /changed during/);
});
