import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  type Address,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

const factoryAbi = [
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
      { name: "feeRouter", type: "address" },
      { name: "holderVault", type: "address" },
      { name: "buybackVault", type: "address" },
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
  ).map((url) => http(url, { timeout: 4500 }));

  return createPublicClient({
    chain:
      FORTUNE_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: fallback(transports),
  });
}

function statusForPhase(phase: number): OnchainFortuneLaunch["status"] {
  if (phase === 1) return "GraduationReady";
  if (phase === 2) return "Pancake";
  if (phase === 3) return "Rescued";
  return "Curve";
}

export async function readRecentFortuneLaunches(limit = 12) {
  if (
    !FORTUNE_NETWORK_CONFIGURED ||
    !FORTUNE_NETWORK.contracts.factory
  ) {
    return {
      configured: false,
      chainId: FORTUNE_NETWORK.chainId,
      total: 0,
      launches: [] as OnchainFortuneLaunch[],
    };
  }

  const rpc = client();
  const factory =
    FORTUNE_NETWORK.contracts.factory as Address;

  const count = await rpc.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "launchCount",
  });

  const total = Number(count);
  const safeLimit = Math.max(1, Math.min(limit, 25));
  const start = Math.max(0, total - safeLimit);
  const indexes = Array.from(
    { length: total - start },
    (_, offset) => start + offset
  ).reverse();

  const launches = await Promise.all(
    indexes.map(async (index) => {
      try {
        const info = await rpc.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: "launches",
          args: [BigInt(index)],
        });

        const creator = info[0];
        const token = info[1];
        const curve = info[2];
        const createdAt = Number(info[9]);

        const [
          name,
          symbol,
          totalSupply,
          phaseRaw,
          currentPrice,
          reserveUsd,
          graduationUsd,
          quoteCountRaw,
        ] = await Promise.all([
          rpc.readContract({
            address: token,
            abi: tokenAbi,
            functionName: "name",
          }),
          rpc.readContract({
            address: token,
            abi: tokenAbi,
            functionName: "symbol",
          }),
          rpc.readContract({
            address: token,
            abi: tokenAbi,
            functionName: "totalSupply",
          }),
          rpc.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "phase",
          }),
          rpc.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "currentPriceUsd1e18",
          }),
          rpc.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "netReserveUsd1e18",
          }),
          rpc.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "graduationUsd1e18",
          }),
          rpc.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "quoteAssetCount",
          }),
        ]);

        const quoteCount = Math.min(Number(quoteCountRaw), 5);
        const quoteAssets = await Promise.all(
          Array.from({ length: quoteCount }, (_, quoteIndex) =>
            rpc.readContract({
              address: curve,
              abi: curveAbi,
              functionName: "quoteAssets",
              args: [BigInt(quoteIndex)],
            })
          )
        );

        const phase = Number(phaseRaw);
        const progress =
          graduationUsd === 0n
            ? 0
            : Math.min(
                100,
                Number((reserveUsd * 10_000n) / graduationUsd) /
                  100
              );

        return {
          id: String(index),
          creator,
          token,
          curve,
          name,
          symbol,
          createdAt,
          phase,
          status: statusForPhase(phase),
          currentPriceUsd: formatUnits(currentPrice, 18),
          reserveUsd: formatUnits(reserveUsd, 18),
          graduationUsd: formatUnits(graduationUsd, 18),
          graduationProgress: progress,
          totalSupply: formatUnits(totalSupply, 18),
          quoteAssets,
        } satisfies OnchainFortuneLaunch;
      } catch {
        return null;
      }
    })
  );

  return {
    configured: true,
    chainId: FORTUNE_NETWORK.chainId,
    total,
    launches: launches.filter(
      (launch): launch is OnchainFortuneLaunch =>
        launch !== null
    ),
  };
}
