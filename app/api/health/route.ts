import { NextResponse } from "next/server";

import { PUBLIC_TESTNET } from "@/lib/public-testnet";

export const dynamic = "force-dynamic";

export async function GET() {
  const chainId = Number(
    process.env.NEXT_PUBLIC_CHAIN_ID || PUBLIC_TESTNET.chainId
  );
  const configuredFactory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS?.trim() ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.factory
      : "");

  return NextResponse.json(
    {
      ok: true,
      service: "fortune-web",
      chainId,
      timestamp: new Date().toISOString(),
      testnetFactoryConfigured:
        chainId === PUBLIC_TESTNET.chainId && Boolean(configuredFactory),
      deployment:
        chainId === PUBLIC_TESTNET.chainId
          ? "public-bsc-testnet-alpha"
          : chainId === 56
            ? "bsc-mainnet"
            : "custom",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
