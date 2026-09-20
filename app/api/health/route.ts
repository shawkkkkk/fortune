import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "fortune-web",
      chainId: 56,
      timestamp: new Date().toISOString(),
      testnetFactoryConfigured: Boolean(
        process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS
      ),
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
