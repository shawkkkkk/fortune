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

export async function readCreatorFortuneLaunches(creator: string, offset = 0, limit = 25, atBlock?: bigint) {
  const catalog = await readFortuneLaunchCatalog(atBlock);
  const matching = catalog.entries.filter(({ info }) => info[0].toLowerCase() === creator.toLowerCase());
  const selected = matching.slice(offset, offset + limit);
  const launches = catalog.blockNumber !== null ? await readLaunchDetails(selected, catalog.blockNumber, catalog.blockHash!) : [];
  return { ...catalog, entries: undefined, launches, creatorTotal: matching.length, hasMore: offset + launches.length < matching.length };
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
    } satisfies OnchainFortuneLaunch];
  });

  if ((await rpc.getBlock({ blockNumber })).hash !== blockHash) throw new Error("Launch snapshot block changed during read.");
  return launches;
}
