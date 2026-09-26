import { apiOk } from "@/lib/public-api";
import { readPairUniverse } from "@/lib/pair-universe";

export const dynamic = "force-dynamic";

export async function GET() {
  const universe = await readPairUniverse();
  return apiOk(universe, {
    cacheSeconds: 120,
    staleSeconds: 600,
    meta: {
      attribution: "Market data from CoinGecko, DexScreener and Lighter. Contract identity from Fortune's onchain-checked snapshot.",
      important: "Only fortune.status = launchable can hold launch reserves. Discovery and reference rows are never Fortune approval.",
    },
  });
}
