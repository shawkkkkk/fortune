import type { Address, PublicClient } from "viem";

const abi = [
  { type: "function", name: "launchCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launches", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "address" }, { type: "address" }, { type: "address" },
    { type: "address" }, { type: "address" }, { type: "address" },
    { type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" },
  ] },
] as const;

type Source = { factory: Address; mode: "standard" | "tax" };
type Info = readonly [Address, Address, Address, Address, Address, Address, Address, `0x${string}`, `0x${string}`, bigint];
type Entry = Source & { index: number; info: Info };
type Snapshot = { total: number; entries: Entry[]; blockNumber: bigint; blockHash: `0x${string}` };
type Cached = { snapshot: Snapshot; counts: number[]; expires: number };
// This bounded RPC catalog is a fallback, not a durable production event indexer.
// Fail explicitly at the bound instead of silently hiding historical markets.
export const CATALOG_LIMIT = 10_000;
const cache = new Map<string, Cached>();
const pending = new Map<string, Promise<Snapshot>>();

export async function readFactoryCatalog(rpc: PublicClient, sources: Source[], chainId: number, atBlock?: bigint): Promise<Snapshot> {
  const key = chainId + ":" + sources.map(s => s.mode + ":" + s.factory.toLowerCase()).join(",") + ":" + (atBlock ?? "latest");
  const previous = cache.get(key);
  if (previous && previous.expires > Date.now()) return previous.snapshot;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = (async () => {
    if (await rpc.getChainId() !== chainId) throw new Error("Catalog RPC is on the wrong chain.");
    const block = await rpc.getBlock(atBlock === undefined ? { blockTag: "latest" } : { blockNumber: atBlock });
    if (block.number === null || !block.hash) throw new Error("Catalog block is unavailable.");
    const blockNumber = block.number;
    const countRows = await rpc.multicall({ blockNumber, contracts: sources.map(s => ({ address: s.factory, abi, functionName: "launchCount" as const })) });
    if (countRows.length !== sources.length) throw new Error("Factory counts are incomplete.");
    const counts = countRows.map(row => {
      if (row.status !== "success" || typeof row.result !== "bigint") throw new Error("Factory count unavailable.");
      if (row.result < 0n || row.result > BigInt(CATALOG_LIMIT)) throw new Error("Factory catalog requires a production indexer beyond 10,000 launches.");
      return Number(row.result);
    });
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > CATALOG_LIMIT) throw new Error("Factory catalog requires a production indexer beyond 10,000 launches.");

    let reusable = previous && counts.every((count, i) => count >= previous.counts[i]) && blockNumber >= previous.snapshot.blockNumber;
    if (reusable && previous) {
      const anchor = await rpc.getBlock({ blockNumber: previous.snapshot.blockNumber });
      reusable = anchor.hash === previous.snapshot.blockHash;
    }
    const entries: Entry[] = reusable && previous ? [...previous.snapshot.entries] : [];
    const positions = sources.flatMap((source, i) => {
      const start = reusable && previous ? previous.counts[i] : 0;
      return Array.from({ length: counts[i] - start }, (_, offset) => ({ ...source, index: start + offset }));
    });
    for (let start = 0; start < positions.length; start += 100) {
      const batch = positions.slice(start, start + 100);
      const rows = await rpc.multicall({ blockNumber, contracts: batch.map(p => ({ address: p.factory, abi, functionName: "launches" as const, args: [BigInt(p.index)] as const })) });
      if (rows.length !== batch.length) throw new Error("Factory history is incomplete.");
      rows.forEach((row, i) => {
        if (row.status !== "success" || !row.result) throw new Error("Factory history is incomplete; retry when RPC recovers.");
        entries.push({ ...batch[i], info: row.result });
      });
    }
    // Detect a reorg during the read before caching or serving the catalog.
    if ((await rpc.getBlock({ blockNumber })).hash !== block.hash) throw new Error("Catalog block changed during the read.");
    entries.sort((a, b) => Number(b.info[9] - a.info[9]) || a.mode.localeCompare(b.mode) || b.index - a.index);
    const snapshot = { total, entries, blockNumber, blockHash: block.hash };
    if (cache.size >= 8 && !cache.has(key)) cache.delete(cache.keys().next().value!);
    cache.set(key, { snapshot, counts, expires: Date.now() + 8000 });
    return snapshot;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
