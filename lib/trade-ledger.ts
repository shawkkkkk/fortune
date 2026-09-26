import {
  createPublicClient,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// A bounded, on-demand trade ledger read straight from eth_getLogs. It is not the
// durable indexer the release plan requires (docs/BREW_REVIEW.md): every result
// states exactly which blocks it covers, and a window is only "complete" when
// every chunk back to the requested start was read.

const bought = parseAbiItem("event Bought(address indexed buyer, address indexed quoteAsset, uint256 quoteIn, uint256 tokensOut, uint256 usdValue)");
const sold = parseAbiItem("event Sold(address indexed seller, address indexed quoteAsset, uint256 tokensIn, uint256 quoteOut, uint256 usdValue)");
// PancakeSwap V3 pools emit two extra protocol-fee fields; Uniswap-style is kept as a fallback.
const pancakeV3Swap = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)");
const uniswapV3Swap = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)");
const pancakeV2Swap = parseAbiItem("event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)");

const graduationAnchor = parseAbiItem("event GraduationAnchor(uint256 priceUsd1e18, uint256 reserveUsd1e18, uint256 tokensSold)");

const LEDGER_EVENTS = [bought, sold, pancakeV3Swap, uniswapV3Swap, pancakeV2Swap, graduationAnchor] as const;

// Public defaults serve logs for a short recent window only (PublicNode keeps
// roughly 90,000 blocks). Operators can point Fortune at full-history providers.
const PUBLIC_LOG_RPC: Record<number, string> = {
  56: "https://bsc-rpc.publicnode.com",
  97: "https://bsc-testnet-rpc.publicnode.com",
};

export type LedgerHead = { number: bigint; hash: `0x${string}`; timestamp: number };

export type LedgerCoverage = {
  requestedFrom: number;
  fromBlock: string;
  toBlock: string;
  fromTimestamp: number;
  toTimestamp: number;
  complete: boolean;
  source: "configured" | "public-default";
};

export type RawLedgerLog = {
  eventName: "Bought" | "Sold" | "Swap" | "GraduationAnchor";
  address: Address;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionIndex: number;
  transactionHash: `0x${string}`;
  timestamp: number;
  swapKind: "v3" | "v2" | null;
};

export type LedgerProviderConfig = { client: PublicClient; chunk: bigint; addressBatch: number; source: LedgerCoverage["source"] };
type Provider = LedgerProviderConfig;

// History depth a provider proved it serves; older chunks are not re-requested
// until the note expires, so a pruned range costs one failed call per half hour.
let retention = new WeakMap<PublicClient, { depth: bigint; expires: number }>();
let providerIds = new WeakMap<PublicClient, number>();
let nextProviderId = 0;

class PrunedRange extends Error {}

function describe(error: unknown) {
  return String((error as { details?: string })?.details || (error as Error)?.message || error).slice(0, 160);
}

function prunedError(error: unknown) {
  const text = String((error as { details?: string })?.details || (error as Error)?.message || error).toLowerCase();
  return text.includes("pruned") || text.includes("limit exceeded") || text.includes("block range") || text.includes("ranges over");
}

function split(value: string | undefined) {
  return [...new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean))];
}

let cachedProvider: Provider | null | undefined;

/** Test hook: clears every module-level cache so each scenario starts cold. */
export function resetLedgerState() {
  cachedProvider = undefined;
  retention = new WeakMap();
  blockTimeSample = new WeakMap();
  providerIds = new WeakMap();
  nextProviderId = 0;
  scanCache.clear();
  scanPending.clear();
}

export function ledgerProvider(): Provider | null {
  if (cachedProvider !== undefined) return cachedProvider;
  const chainId = FORTUNE_NETWORK.chainId;
  const configured = split(chainId === 56 ? process.env.BSC_LOG_RPC_URLS : process.env.BSC_TESTNET_LOG_RPC_URLS);
  // Only endpoints known to serve eth_getLogs: BNB's public dataseeds reject every
  // log query, so falling back to them would only turn a timeout into an error.
  const urls = configured.length ? configured : [PUBLIC_LOG_RPC[chainId]].filter(Boolean) as string[];
  if (!urls.length) return (cachedProvider = null);
  const range = Number(process.env.FORTUNE_LOG_BLOCK_RANGE || (configured.length ? 5_000 : 45_000));
  cachedProvider = {
    client: createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: fallback(urls.map((url) => http(url, { timeout: 20_000, retryCount: 0 }))),
    }) as PublicClient,
    chunk: BigInt(Math.max(100, Math.min(range, 49_000))),
    // PublicNode rejects log filters with ten or more addresses ("Request blocked").
    addressBatch: Math.max(1, Math.min(Number(process.env.FORTUNE_LOG_ADDRESS_BATCH || (configured.length ? 50 : 9)), 200)),
    source: configured.length ? "configured" : "public-default",
  };
  return cachedProvider;
}

export async function pinLedgerHead(rpc: PublicClient): Promise<LedgerHead> {
  const block = await rpc.getBlock({ blockTag: "latest" });
  if (block.number === null || !block.hash) throw new Error("Latest block unavailable.");
  return { number: block.number, hash: block.hash, timestamp: Number(block.timestamp) };
}

let blockTimeSample = new WeakMap<PublicClient, { value: number; expires: number }>();

async function averageBlockTime(rpc: PublicClient, head: LedgerHead) {
  const sample = blockTimeSample.get(rpc);
  if (sample && sample.expires > Date.now()) return sample.value;
  const span = 50_000n;
  const earlier = await rpc.getBlock({ blockNumber: head.number > span ? head.number - span : 0n });
  const value = Math.max(0.1, (head.timestamp - Number(earlier.timestamp)) / Number(head.number - (earlier.number ?? 0n)));
  blockTimeSample.set(rpc, { value, expires: Date.now() + 10 * 60_000 });
  return value;
}

export type LedgerScan = { head: LedgerHead; logs: RawLedgerLog[]; coverage: LedgerCoverage };
const scanCache = new Map<string, { scan: LedgerScan; expires: number }>();
const scanPending = new Map<string, Promise<LedgerScan>>();

/**
 * Reads every Fortune curve trade and official-pool swap for `addresses` over the
 * last `windowSeconds`, newest chunk first, at a pinned head. The scan stops at the
 * first chunk the provider cannot serve and reports the covered range.
 */
export async function readLedger(provider: Provider, addresses: Address[], windowSeconds: number): Promise<LedgerScan> {
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0 || windowSeconds > 30 * 86_400) throw new Error("Invalid ledger window.");
  if (provider.chunk <= 0n || !Number.isSafeInteger(provider.addressBatch) || provider.addressBatch < 1) throw new Error("Invalid ledger batching.");
  if (await provider.client.getChainId() !== FORTUNE_NETWORK.chainId) throw new Error("Wrong ledger chain.");
  let providerId = providerIds.get(provider.client);
  if (providerId === undefined) { providerId = ++nextProviderId; providerIds.set(provider.client, providerId); }
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))].sort() as Address[];
  const key = providerId + ":" + unique.join(",") + ":" + windowSeconds;
  const cached = scanCache.get(key);
  if (cached && cached.expires > Date.now()) {
    const anchor = await provider.client.getBlock({ blockNumber: cached.scan.head.number });
    if (anchor.hash === cached.scan.head.hash) return cached.scan;
    scanCache.delete(key);
  }
  const inFlight = scanPending.get(key);
  if (inFlight) return inFlight;

  const task = (async (): Promise<LedgerScan> => {
    const rpc = provider.client;
    const head = await pinLedgerHead(rpc);
    const fromTimestamp = head.timestamp - windowSeconds;
    const blockTime = await averageBlockTime(rpc, head);
    // Start a little early so a slightly slow block cadence cannot cut the window short.
    const blocksBack = BigInt(Math.ceil(Math.max(0, head.timestamp - fromTimestamp) / blockTime * 1.03) + 5);
    const wanted = head.number > blocksBack ? head.number - blocksBack : 0n;
    const retained = retention.get(rpc);
    const known = retained && retained.expires > Date.now() ? retained.depth : null;
    const startBlock = known !== null && head.number - wanted > known ? head.number - known : wanted;

    const logs: RawLedgerLog[] = [];
    const seen = new Set<string>();
    const blocks = new Map<bigint, { hash: string; timestamp: number }>([[head.number, head]]);
    const verifiedBlock = async (number: bigint) => {
      const cachedBlock = blocks.get(number);
      if (cachedBlock) return cachedBlock;
      if (blocks.size >= 2048) throw new Error("Ledger block verification budget exceeded.");
      const block = await rpc.getBlock({ blockNumber: number });
      if (block.number !== number || !block.hash) throw new Error("Ledger block unavailable.");
      const value = { hash: block.hash, timestamp: Number(block.timestamp) };
      blocks.set(number, value);
      return value;
    };
    let covered = head.number + 1n;
    let complete = unique.length === 0;

    if (unique.length) {
      let span = provider.chunk;
      let halvings = 0;
      for (let to = head.number; to >= startBlock; to -= span) {
        const from = to - span + 1n > startBlock ? to - span + 1n : startBlock;
        const batches: Address[][] = [];
        for (let i = 0; i < unique.length; i += provider.addressBatch) batches.push(unique.slice(i, i + provider.addressBatch));
        const fetchBatch = async (batch: Address[]) => {
          try {
            return await rpc.getLogs({ address: batch, events: LEDGER_EVENTS, fromBlock: from, toBlock: to, strict: true });
          } catch (error) {
            console.warn("[trade-ledger] getLogs " + from + "-" + to + " failed: " + describe(error));
            if (prunedError(error)) throw new PrunedRange();
            return await rpc.getLogs({ address: batch, events: LEDGER_EVENTS, fromBlock: from, toBlock: to, strict: true });
          }
        };
        let rows;
        try {
          rows = [];
          for (let i = 0; i < batches.length; i += 3) {
            rows.push(...(await Promise.all(batches.slice(i, i + 3).map(fetchBatch))).flat());
          }
        } catch (error) {
          // A pruned chunk usually straddles the provider's history edge: narrow it
          // a few times so coverage ends near the real edge, not a whole chunk short.
          if (error instanceof PrunedRange && halvings < 5 && span > 1_000n) {
            span /= 2n;
            halvings += 1;
            to += span;
            continue;
          }
          if (error instanceof PrunedRange) retention.set(rpc, { depth: head.number - covered + 1n, expires: Date.now() + 30 * 60_000 });
          else console.warn("[trade-ledger] stopping at block " + to + ": " + describe(error));
          break;
        }
        for (const row of rows) {
          if (row.blockNumber === null || row.logIndex === null || row.transactionHash === null || row.transactionIndex === null || row.removed) throw new Error("Incomplete or removed ledger log.");
          if (row.blockNumber < from || row.blockNumber > to || !unique.includes(row.address.toLowerCase() as Address)) throw new Error("Ledger log outside requested scope.");
          const block = await verifiedBlock(row.blockNumber);
          if (row.blockHash !== block.hash) throw new Error("Ledger log block hash mismatch.");
          const timestamp = block.timestamp;
          const identity = row.blockHash + ":" + row.logIndex;
          if (seen.has(identity)) continue;
          seen.add(identity);
          if (logs.length >= 20_000) throw new Error("Ledger log budget exceeded.");
          const args = row.args as Record<string, unknown>;
          logs.push({
            eventName: row.eventName as RawLedgerLog["eventName"],
            address: row.address,
            args,
            blockNumber: row.blockNumber,
            logIndex: row.logIndex,
            transactionIndex: row.transactionIndex,
            transactionHash: row.transactionHash,
            timestamp,
            swapKind: row.eventName !== "Swap" ? null : "amount0In" in args ? "v2" : "v3",
          });
        }
        covered = from;
        if (from === startBlock) { complete = startBlock === wanted; break; }
      }
    }

    const fromBlock = covered > head.number ? head.number : covered;
    const boundary = await verifiedBlock(fromBlock);
    // Block cadence only estimates how far to scan; timestamps and coverage use headers.
    const fromTimestamp_ = boundary.timestamp;
    complete = complete && fromTimestamp_ <= fromTimestamp;

    // Reject the whole scan if the head was reorganized while it ran.
    const check = await rpc.getBlock({ blockNumber: head.number });
    if (check.hash !== head.hash) throw new Error("Chain head changed during the ledger read.");

    const inWindow = logs.filter((log) => log.timestamp >= fromTimestamp);
    inWindow.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex);

    const scan: LedgerScan = {
      head,
      logs: inWindow,
      coverage: {
        requestedFrom: fromTimestamp,
        fromBlock: fromBlock.toString(),
        toBlock: head.number.toString(),
        fromTimestamp: fromTimestamp_,
        toTimestamp: head.timestamp,
        complete,
        source: provider.source,
      },
    };
    if (scanCache.size >= 16 && !scanCache.has(key)) scanCache.delete(scanCache.keys().next().value!);
    scanCache.set(key, { scan, expires: Date.now() + 20_000 });
    return scan;
  })();

  scanPending.set(key, task);
  try { return await task; } finally { scanPending.delete(key); }
}
