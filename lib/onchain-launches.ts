import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  type Address,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { readFactoryCatalog } from "@/lib/factory-catalog";
import { FORTUNE_READ_NETWORK_CONFIGURED } from "@/lib/read-network";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import {
  FORTUNE_NETWORK,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

export const factoryAbi = [
  {
    type: "function",
    name: "launchCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launches",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
      { name: "componentA", type: "address" },
      { name: "componentB", type: "address" },
      { name: "componentC", type: "address" },
      { name: "liquidityVault", type: "address" },
      { name: "manifestHash", type: "bytes32" },
      { name: "vanitySalt", type: "bytes32" },
      { name: "createdAt", type: "uint64" },
    ],
  },
] as const;

const tokenAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const curveAbi = [
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "currentPriceUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "netReserveUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteAssetCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteAssets",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export type OnchainFortuneLaunch = {
  id: string;
  mode: "standard" | "tax";
  factory: Address;
  creator: Address;
  token: Address;
  curve: Address;
  name: string;
  symbol: string;
  createdAt: number;
  phase: number;
  status: "Curve" | "GraduationReady" | "Pancake" | "Rescued";
  currentPriceUsd: string;
  reserveUsd: string;
  graduationUsd: string;
  graduationProgress: number;
  totalSupply: string;
  quoteAssets: Address[];
  /** Fortune purpose vaults recorded at creation: holder rewards, buyback, liquidity. */
  vaults: Address[];
};

function client() {
  const urls = configuredRpcUrls(FORTUNE_NETWORK.chainId);
  const transports = (
    urls.length ? urls : [FORTUNE_NETWORK.publicRpcUrl]
  ).map((url) => http(url, { timeout: 10000 }));

  return createPublicClient({
    chain:
      FORTUNE_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: fallback(transports),
  });
}

function statusForPhase(
  phase: number
): OnchainFortuneLaunch["status"] {
  if (phase === 1) return "GraduationReady";
  if (phase === 2) return "Pancake";
  if (phase === 3) return "Rescued";
  return "Curve";
}

function sources() {
  const entries: Array<{
    factory: Address;
    mode: OnchainFortuneLaunch["mode"];
  }> = [{ factory: FORTUNE_NETWORK.contracts.factory as Address, mode: "standard" }];
  if (FORTUNE_TAX_NETWORK_CONFIGURED && FORTUNE_NETWORK.contracts.taxFactory) {
    entries.push({ factory: FORTUNE_NETWORK.contracts.taxFactory as Address, mode: "tax" });
  }
  return entries;
}

function required<T>(result: { status: string; result?: T }, label: string): T {
  if (result.status !== "success" || result.result === undefined) {
    throw new Error("Onchain read failed: " + label);
  }
  return result.result;
}

export async function readFortuneLaunchCounts() {
  if (!FORTUNE_READ_NETWORK_CONFIGURED || !FORTUNE_NETWORK.contracts.factory) {
    return { configured: false, chainId: FORTUNE_NETWORK.chainId, total: 0 };
  }
  const rpc = client();
  if (await rpc.getChainId() !== FORTUNE_NETWORK.chainId) throw new Error("Stats RPC is on the wrong chain.");
  const block = await rpc.getBlock({ blockTag: "latest" });
  if (block.number === null || !block.hash) throw new Error("Stats block unavailable.");
  const counts = await rpc.multicall({
    blockNumber: block.number,
    contracts: sources().map(({ factory }) => ({
      address: factory, abi: factoryAbi, functionName: "launchCount" as const,
    })),
  });
  const total = counts.reduce(
    (sum, count, index) => sum + Number(required(count, "launchCount " + index)), 0
  );
  if ((await rpc.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error("Stats block changed during read.");
  return { configured: true, chainId: FORTUNE_NETWORK.chainId, total, blockNumber: block.number.toString(), blockHash: block.hash };
}

export async function readFortuneLaunchCatalog(atBlock?: bigint) {
  if (!FORTUNE_READ_NETWORK_CONFIGURED || !FORTUNE_NETWORK.contracts.factory) {
    return { configured: false as const, chainId: FORTUNE_NETWORK.chainId, total: 0, entries: [], blockNumber: null, blockHash: null };
  }
  const snapshot = await readFactoryCatalog(client(), sources(), FORTUNE_NETWORK.chainId, atBlock);
  return { configured: true as const, chainId: FORTUNE_NETWORK.chainId, ...snapshot };
}

export async function readFortuneLaunchByToken(token: string) {
  const catalog = await readFortuneLaunchCatalog();
  const entry = catalog.entries.find(({ info }) => info[1].toLowerCase() === token.toLowerCase());
  const launches = entry && catalog.blockNumber !== null
    ? await readLaunchDetails([entry], catalog.blockNumber, catalog.blockHash!) : [];
  return { ...catalog, entries: undefined, launch: launches[0] || null };
}

/** Several launches by token address (at most 50), in catalog order, read at one block. */
export async function readFortuneLaunchesByTokens(tokens: string[]) {
  const wanted = new Set(tokens.slice(0, 50).map((token) => token.toLowerCase()));
  const catalog = await readFortuneLaunchCatalog();
  const entries = catalog.entries.filter(({ info }) => wanted.has(info[1].toLowerCase()));
  const launches = entries.length && catalog.blockNumber !== null ? await readLaunchDetails(entries, catalog.blockNumber, catalog.blockHash!) : [];
  return { ...catalog, entries: undefined, launches };
}

export type CreatorPhases = { curve: number; ready: number; graduated: number; rescued: number };

/** Tallies curve phases the way statusForPhase names them; unknown values count as on the curve. */
export function countPhases(values: number[]): CreatorPhases {
  const phases: CreatorPhases = { curve: 0, ready: 0, graduated: 0, rescued: 0 };
  for (const phase of values) {
    if (phase === 1) phases.ready += 1;
    else if (phase === 2) phases.graduated += 1;
    else if (phase === 3) phases.rescued += 1;
    else phases.curve += 1;
  }
  return phases;
}

/**
 * One page of a creator's launches, plus how every one of their launches stands
 * today (phase counts read at the same block) and the creator's own balance of
 * each token on the page.
 */
export async function readCreatorFortuneLaunches(creator: string, offset = 0, limit = 25, atBlock?: bigint) {
  const catalog = await readFortuneLaunchCatalog(atBlock);
  const matching = catalog.entries.filter(({ info }) => info[0].toLowerCase() === creator.toLowerCase());
  const selected = matching.slice(offset, offset + limit);
  if (catalog.blockNumber === null || !matching.length) {
    return { ...catalog, entries: undefined, launches: [], creatorBalances: [] as string[], creatorTotal: matching.length, phases: countPhases([]), hasMore: false };
  }
  const rpc = client();
  const [launches, phaseRows, balanceRows] = await Promise.all([
    readLaunchDetails(selected, catalog.blockNumber, catalog.blockHash!),
    inBatches(matching, (chunk) => rpc.multicall({ blockNumber: catalog.blockNumber!, contracts: chunk.map(({ info }) => ({ address: info[2], abi: curveAbi, functionName: "phase" as const })) })),
    inBatches(selected, (chunk) => rpc.multicall({ blockNumber: catalog.blockNumber!, contracts: chunk.map(({ info }) => ({ address: info[1], abi: tokenAbi, functionName: "balanceOf" as const, args: [info[0]] as const })) })),
  ]);
  const phases = countPhases(phaseRows.map((row) => Number(required(row, "phase"))));
  const creatorBalances = balanceRows.map((row) => formatUnits(required(row, "creator balance") as bigint, 18));
  return { ...catalog, entries: undefined, launches, creatorBalances, creatorTotal: matching.length, phases, hasMore: offset + launches.length < matching.length };
}

/** Positions detailed per holder; anything beyond is counted but not priced. */
export const HOLDINGS_LIMIT = 100;

/**
 * Every Fortune launch an address holds. Balances are read for the whole bounded
 * catalog at the catalog block, so an old position is never missed; the newest
 * HOLDINGS_LIMIT positions are returned with full launch details.
 */
export async function readFortuneHoldings(owner: Address) {
  const catalog = await readFortuneLaunchCatalog();
  if (!catalog.configured || catalog.blockNumber === null) {
    return { configured: catalog.configured, chainId: catalog.chainId, total: 0, blockNumber: null, blockHash: null, created: 0, held: 0, positions: [] };
  }
  const rpc = client();
  const blockNumber = catalog.blockNumber;
  // One eth_call per batch of 250 balances (viem would otherwise split every ~28 calls).
  const rows = await inBatches(catalog.entries, (chunk) => rpc.multicall({ blockNumber, batchSize: 16_384, contracts: chunk.map(({ info }) => ({
    address: info[1], abi: tokenAbi, functionName: "balanceOf" as const, args: [owner] as const,
  })) }));
  const held = catalog.entries.flatMap((entry, index) => {
    const balance = required(rows[index], "balanceOf") as bigint;
    return balance > 0n ? [{ entry, balance }] : [];
  });
  const detailed = held.slice(0, HOLDINGS_LIMIT);
  const launches = detailed.length ? await readLaunchDetails(detailed.map(({ entry }) => entry), catalog.blockNumber, catalog.blockHash) : [];
  if (!detailed.length && (await rpc.getBlock({ blockNumber: catalog.blockNumber })).hash !== catalog.blockHash) {
    throw new Error("Holdings block changed during read.");
  }
  return {
    configured: true as const,
    chainId: catalog.chainId,
    total: catalog.total,
    blockNumber: catalog.blockNumber,
    blockHash: catalog.blockHash,
    created: catalog.entries.filter(({ info }) => info[0].toLowerCase() === owner.toLowerCase()).length,
    held: held.length,
    positions: launches.map((launch, index) => ({ launch, balance: formatUnits(detailed[index].balance, 18) })),
  };
}

/** Reads in fixed-size multicall batches, one after another, so a large catalog never becomes one oversized eth_call. */
async function inBatches<T, R>(items: T[], read: (chunk: T[]) => Promise<R[]>, size = 250): Promise<R[]> {
  const rows: R[] = [];
  for (let start = 0; start < items.length; start += size) rows.push(...(await read(items.slice(start, start + size))));
  return rows;
}

export async function readRecentFortuneLaunches(limit = 12, offset = 0, atBlock?: bigint) {
  const catalog = await readFortuneLaunchCatalog(atBlock);
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 25));
  const selected = catalog.entries.slice(offset, offset + safeLimit);
  const launches = catalog.blockNumber !== null ? await readLaunchDetails(selected, catalog.blockNumber, catalog.blockHash!) : [];
  return { ...catalog, entries: undefined, launches, hasMore: offset + launches.length < catalog.total };
}

async function readLaunchDetails(valid: Awaited<ReturnType<typeof readFactoryCatalog>>["entries"], blockNumber: bigint, blockHash: string) {
  const rpc = client();
  const fieldCalls = valid.flatMap(({ info }) => [
    { address: info[1], abi: tokenAbi, functionName: "name" as const },
    { address: info[1], abi: tokenAbi, functionName: "symbol" as const },
    { address: info[1], abi: tokenAbi, functionName: "totalSupply" as const },
    { address: info[2], abi: curveAbi, functionName: "phase" as const },
    { address: info[2], abi: curveAbi, functionName: "currentPriceUsd1e18" as const },
    { address: info[2], abi: curveAbi, functionName: "netReserveUsd1e18" as const },
    { address: info[2], abi: curveAbi, functionName: "graduationUsd1e18" as const },
    { address: info[2], abi: curveAbi, functionName: "quoteAssetCount" as const },
  ]);
  const fields = valid.length ? await rpc.multicall({ blockNumber, contracts: fieldCalls }) : [];
  const prepared = valid.flatMap((position, index) => {
    const row = fields.slice(index * 8, index * 8 + 8);
    if (row.some((value) => value.status !== "success")) throw new Error("Could not verify every requested token and curve field.");
    return [{ ...position, row: row.map((value) => value.result) }];
  });
  const quoteCalls = prepared.flatMap(({ info, row }) =>
    Array.from({ length: Math.min(Number(row[7]), 5) }, (_, index) => ({
      address: info[2], abi: curveAbi, functionName: "quoteAssets" as const, args: [BigInt(index)] as const,
    })));
  const quotes = quoteCalls.length ? await rpc.multicall({ blockNumber, contracts: quoteCalls }) : [];
  let quoteOffset = 0;
  const launches = prepared.flatMap(({ mode, factory, index, info, row }) => {
    const quoteCount = Math.min(Number(row[7]), 5);
    const values = quotes.slice(quoteOffset, quoteOffset + quoteCount);
    quoteOffset += quoteCount;
    if (values.some((value) => value.status !== "success")) throw new Error("Could not verify every quote asset.");
    const [name, symbol, supply, phaseRaw, price, reserve, target] = row as [string, string, bigint, number, bigint, bigint, bigint];
    const phase = Number(phaseRaw);
    return [{
      id: mode + ":" + String(index), mode, factory,
      creator: info[0], token: info[1], curve: info[2], createdAt: Number(info[9]),
      name, symbol, phase, status: statusForPhase(phase),
      currentPriceUsd: formatUnits(price, 18), reserveUsd: formatUnits(reserve, 18),
      graduationUsd: formatUnits(target, 18),
      graduationProgress: target === 0n ? 0 : Math.min(100, Number((reserve * 10_000n) / target) / 100),
      totalSupply: formatUnits(supply, 18),
      quoteAssets: values.map((value) => value.result as Address),
      vaults: [info[4], info[5], info[6]],
    } satisfies OnchainFortuneLaunch];
  });

  if ((await rpc.getBlock({ blockNumber })).hash !== blockHash) throw new Error("Launch snapshot block changed during read.");
  return launches;
}
