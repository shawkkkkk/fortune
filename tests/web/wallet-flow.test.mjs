import test from "node:test";
import assert from "node:assert/strict";
import { FORTUNE_NETWORK } from "../../lib/fortune-network.ts";
import { readWalletFlow, resetLedgerState } from "../../lib/trade-ledger.ts";

const TOKEN = "0x" + "70".repeat(20);
const CREATOR = "0x" + "c0".repeat(20);
const OTHER = "0x" + "0e".repeat(20);
const E18 = 10n ** 18n;

// Chain with 0.45 s blocks; transfers keyed by block number.
function fakeChain({ head, prunedBelow = 0n, transfers }) {
  const block = (number) => ({ number, hash: "0x" + number.toString(16).padStart(64, "0"), timestamp: BigInt(Math.round(2_000_000_000 - Number(head - number) * 0.45)) });
  const client = {
    getChainId: async () => FORTUNE_NETWORK.chainId,
    getBlock: async ({ blockTag, blockNumber }) => block(blockTag === "latest" ? head : blockNumber),
    getLogs: async ({ address, args, fromBlock, toBlock }) => {
      if (fromBlock < prunedBelow) throw Object.assign(new Error("RPC error"), { details: "History has been pruned for this block." });
      return transfers
        .filter((row) => row.block >= fromBlock && row.block <= toBlock)
        .filter((row) => (args.from ? row.from === args.from : row.to === args.to))
        .map((row) => ({ address, blockNumber: row.block, blockHash: block(row.block).hash, logIndex: row.logIndex, removed: false, args: { from: row.from, to: row.to, value: row.value } }));
    },
  };
  return { client, chunk: 45_000n, addressBatch: 9, source: "public-default" };
}

const secondsAgo = (head, blocks) => 2_000_000_000 - Math.round(blocks * 0.45);

test("wallet flow counts every transfer out and in since launch, once each", async () => {
  resetLedgerState();
  const head = 50_000_000n;
  const transfers = [
    { block: head - 1_000n, logIndex: 0, from: OTHER, to: CREATOR, value: 100n * E18 },  // creator's first buy
    { block: head - 500n, logIndex: 1, from: CREATOR, to: OTHER, value: 30n * E18 },     // a sell or transfer out
    { block: head - 10n, logIndex: 2, from: CREATOR, to: OTHER, value: 20n * E18 },
    { block: head - 5n, logIndex: 3, from: CREATOR, to: CREATOR, value: 5n * E18 },     // self-transfer is ignored
  ];
  const flow = await readWalletFlow(fakeChain({ head, transfers }), TOKEN, CREATOR, secondsAgo(head, 1_010));
  assert.equal(flow.received, 100n * E18);
  assert.equal(flow.sent, 50n * E18);
  assert.equal(flow.transfersOut, 2);
  assert.equal(flow.coverage.complete, true);
});

test("a launch older than the provider's history is reported as partial coverage", async () => {
  resetLedgerState();
  const head = 60_000_000n;
  const transfers = [{ block: head - 2_000n, logIndex: 0, from: CREATOR, to: OTHER, value: 7n * E18 }];
  const flow = await readWalletFlow(fakeChain({ head, prunedBelow: head - 90_000n, transfers }), TOKEN, CREATOR, secondsAgo(head, 400_000));
  assert.equal(flow.coverage.complete, false, "cannot claim 'since launch' past the pruned edge");
  assert.equal(flow.sent, 7n * E18, "transfers inside the covered range still count");
  assert.ok(BigInt(flow.coverage.toBlock) - BigInt(flow.coverage.fromBlock) <= 90_000n);
});

test("wallet flow refuses a provider on the wrong chain", async () => {
  resetLedgerState();
  const chain = fakeChain({ head: 1_000_000n, transfers: [] });
  chain.client.getChainId = async () => FORTUNE_NETWORK.chainId + 1;
  await assert.rejects(readWalletFlow(chain, TOKEN, CREATOR, 1_999_999_000), /Wrong ledger chain/);
});
