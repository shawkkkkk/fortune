import {
  createPublicClient,
  fallback,
  http,
  type Address,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

const registryAbi = [
  {
    type: "function",
    name: "assetCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allAssets",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "assetConfig",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "oracle", type: "address" },
          { name: "maxOracleAge", type: "uint32" },
          { name: "quoteEnabled", type: "bool" },
          { name: "rewardEnabled", type: "bool" },
          { name: "graduationEnabled", type: "bool" },
          { name: "active", type: "bool" },
          { name: "category", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "assetHealth",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "healthy", type: "bool" },
      { name: "reasonCode", type: "bytes32" },
      { name: "priceUsd1e18", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "registeredDecimals",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint8" }],
  },
] as const;

const erc20Abi = [
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
] as const;

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

function reasonText(value: `0x${string}`) {
  try {
    const raw = value.slice(2);
    const bytes = raw.match(/.{2}/g) || [];
    return bytes
      .map((byte) => String.fromCharCode(Number.parseInt(byte, 16)))
      .join("")
      .replace(/\0/g, "")
      .trim();
  } catch {
    return value;
  }
}

export type FortuneRegistryAsset = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  category: string;
  oracle: Address;
  maxOracleAge: number;
  active: boolean;
  quoteEnabled: boolean;
  rewardEnabled: boolean;
  graduationEnabled: boolean;
  healthy: boolean;
  healthReason: string;
  priceUsd1e18: string;
  updatedAt: number;
  launchable: boolean;
};

export async function readFortuneAssetUniverse() {
  if (
    !FORTUNE_NETWORK_CONFIGURED ||
    !FORTUNE_NETWORK.contracts.registry
  ) {
    return {
      configured: false,
      chainId: FORTUNE_NETWORK.chainId,
      assets: [] as FortuneRegistryAsset[],
    };
  }

  const rpc = client();
  const registry =
    FORTUNE_NETWORK.contracts.registry as Address;

  const count = Number(
    await rpc.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "assetCount",
    })
  );

  const addresses = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      rpc.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "allAssets",
        args: [BigInt(index)],
      })
    )
  );

  const assets = await Promise.all(
    addresses.map(async (address) => {
      const [
        config,
        health,
        decimals,
        name,
        symbol,
      ] = await Promise.all([
        rpc.readContract({
          address: registry,
          abi: registryAbi,
          functionName: "assetConfig",
          args: [address],
        }),
        rpc.readContract({
          address: registry,
          abi: registryAbi,
          functionName: "assetHealth",
          args: [address],
        }),
        rpc.readContract({
          address: registry,
          abi: registryAbi,
          functionName: "registeredDecimals",
          args: [address],
        }),
        rpc
          .readContract({
            address,
            abi: erc20Abi,
            functionName: "name",
          })
          .catch(() => "Unknown asset"),
        rpc
          .readContract({
            address,
            abi: erc20Abi,
            functionName: "symbol",
          })
          .catch(() => "TOKEN"),
      ]);

      const healthy = Boolean(health[0]);
      const quoteEnabled = Boolean(config.quoteEnabled);
      const graduationEnabled = Boolean(
        config.graduationEnabled
      );
      const active = Boolean(config.active);

      return {
        address,
        name,
        symbol,
        decimals: Number(decimals),
        category: config.category,
        oracle: config.oracle,
        maxOracleAge: Number(config.maxOracleAge),
        active,
        quoteEnabled,
        rewardEnabled: Boolean(config.rewardEnabled),
        graduationEnabled,
        healthy,
        healthReason: reasonText(health[1]),
        priceUsd1e18: health[2].toString(),
        updatedAt: Number(health[3]),
        launchable:
          active &&
          healthy &&
          quoteEnabled &&
          graduationEnabled,
      } satisfies FortuneRegistryAsset;
    })
  );

  return {
    configured: true,
    chainId: FORTUNE_NETWORK.chainId,
    assets,
  };
}
