import { NextResponse } from "next/server";

import {
  configuredRpcUrls,
  probeRpcEndpoints,
  rpcCall,
} from "@/lib/bsc-rpc";

export const dynamic = "force-dynamic";

export async function GET() {
  const chainId = Number(
    process.env.NEXT_PUBLIC_CHAIN_ID || 97
  );
  const factory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || "";
  const urls = configuredRpcUrls(chainId);
  const redundancyRequired =
    chainId === 56 ||
    process.env.FORTUNE_REQUIRE_RPC_REDUNDANCY === "true";

  const rpc = await probeRpcEndpoints(chainId);

  let factoryHasCode = false;
  let factoryProbeError: string | null = null;

  if (factory && rpc.healthy > 0) {
    try {
      const response = await rpcCall(
        chainId,
        "eth_getCode",
        [factory, "latest"],
        { timeoutMs: 2500 }
      );

      const code = String(response.result || "");
      factoryHasCode =
        code !== "" &&
        code !== "0x" &&
        code !== "0x0";
    } catch (error) {
      factoryProbeError =
        error instanceof Error
          ? error.message
          : "FACTORY_PROBE_FAILED";
    }
  }

  const redundancyConfigured =
    !redundancyRequired || urls.length >= 2;

  const ready =
    Boolean(factory) &&
    factoryHasCode &&
    rpc.healthy >= 1 &&
    redundancyConfigured;

  const degraded =
    ready && rpc.healthy < rpc.configured;

  return NextResponse.json(
    {
      ready,
      degraded,
      service: "fortune",
      chainId,
      factory: {
        configured: Boolean(factory),
        hasCode: factoryHasCode,
        probeError: factoryProbeError,
      },
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
