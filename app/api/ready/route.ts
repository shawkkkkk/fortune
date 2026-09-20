import { NextResponse } from "next/server";

import { PUBLIC_TESTNET } from "@/lib/public-testnet";
import {
  configuredRpcUrls,
  probeRpcEndpoints,
  rpcCall,
} from "@/lib/bsc-rpc";

export const dynamic = "force-dynamic";

type StackProbe = {
  configured: boolean;
  hasCode: boolean;
};

function hasBytecode(value: unknown) {
  const code = String(value || "");
  return code !== "" && code !== "0x" && code !== "0x0";
}

export async function GET() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);
  const factoryOverride =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS?.trim() || "";
  const configuredFactory =
    factoryOverride ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.factory
      : "");

  const customTestnetStack =
    chainId === PUBLIC_TESTNET.chainId &&
    Boolean(factoryOverride) &&
    factoryOverride.toLowerCase() !==
      PUBLIC_TESTNET.contracts.factory.toLowerCase();

  const urls = configuredRpcUrls(chainId);
  const redundancyRequired =
    chainId === 56 ||
    process.env.FORTUNE_REQUIRE_RPC_REDUNDANCY === "true";

  const rpc = await probeRpcEndpoints(chainId);
  const redundancyConfigured =
    !redundancyRequired || urls.length >= 2;

  const requiredContracts =
    chainId === PUBLIC_TESTNET.chainId
      ? customTestnetStack
        ? {
            factory: configuredFactory,
            registry:
              process.env.NEXT_PUBLIC_FORTUNE_REGISTRY_ADDRESS ||
              "",
            graduationAdapter:
              process.env
                .NEXT_PUBLIC_FORTUNE_GRADUATION_ADAPTER_ADDRESS ||
              "",
            liquidityLocker:
              process.env
                .NEXT_PUBLIC_FORTUNE_LIQUIDITY_LOCKER_ADDRESS ||
              "",
          }
        : {
            factory: PUBLIC_TESTNET.contracts.factory,
            taxFactory: PUBLIC_TESTNET.contracts.taxFactory,
            registry: PUBLIC_TESTNET.contracts.registry,
            poolRegistry: PUBLIC_TESTNET.contracts.poolRegistry,
            graduationAdapter:
              PUBLIC_TESTNET.contracts.graduationAdapter,
            liquidityLocker:
              PUBLIC_TESTNET.contracts.liquidityLocker,
            taxGraduationAdapter:
              PUBLIC_TESTNET.contracts.taxGraduationAdapter,
            taxLiquidityLocker:
              PUBLIC_TESTNET.contracts.taxLiquidityLocker,
            mockQuote: PUBLIC_TESTNET.contracts.mockQuote,
          }
      : {
          factory: configuredFactory,
        };

  const entries = Object.entries(requiredContracts);
  const stack: Record<string, StackProbe> = {};

  if (rpc.healthy > 0) {
    await Promise.all(
      entries.map(async ([label, address]) => {
        if (!address) {
          stack[label] = {
            configured: false,
            hasCode: false,
          };
          return;
        }

        try {
          const response = await rpcCall(
            chainId,
            "eth_getCode",
            [address, "latest"],
            { timeoutMs: 2500 }
          );

          stack[label] = {
            configured: true,
            hasCode: hasBytecode(response.result),
          };
        } catch {
          stack[label] = {
            configured: true,
            hasCode: false,
          };
        }
      })
    );
  } else {
    for (const [label, address] of entries) {
      stack[label] = {
        configured: Boolean(address),
        hasCode: false,
      };
    }
  }

  const stackReady =
    entries.length > 0 &&
    entries.every(([label]) => {
      const probe = stack[label];
      return probe?.configured && probe.hasCode;
    });

  const ready =
    stackReady &&
    rpc.healthy >= 1 &&
    redundancyConfigured;

  const degraded =
    ready && rpc.healthy < rpc.configured;

  return NextResponse.json(
    {
      ready,
      degraded,
      service: "fortune",
      environment:
        chainId === PUBLIC_TESTNET.chainId
          ? customTestnetStack
            ? "custom-bsc-testnet"
            : "public-bsc-testnet-alpha"
          : chainId === 56
            ? "bsc-mainnet"
            : "custom",
      chainId,
      stackReady,
      stack,
      rpc: {
        configured: rpc.configured,
        healthy: rpc.healthy,
        redundancyRequired,
        redundancyConfigured,
        probes: rpc.probes,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
