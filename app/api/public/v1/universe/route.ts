import { apiOk } from "@/lib/public-api";
import { readPairUniverse } from "@/lib/pair-universe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const universe = await readPairUniverse();
  // A partial answer (rate-limited market data) is cached briefly so the CDN recovers quickly.
  const complete = universe.coverage.marketData && universe.coverage.preIpoReferences;
  return apiOk(universe, {
    cacheSeconds: complete ? 120 : 20,
    staleSeconds: complete ? 600 : 40,
    meta: {
      attribution: "Market data from CoinGecko, DexScreener and Lighter. Contract identity from Fortune's onchain-checked snapshot.",
      important: "Only fortune.status = launchable can hold launch reserves. Discovery and reference rows are never Fortune approval.",
    },
  });
}
