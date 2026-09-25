import { apiError, apiOk } from "@/lib/public-api";
import { readFortuneLaunchCounts } from "@/lib/onchain-launches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await readFortuneLaunchCounts();
    if (!ledger.configured) {
      return apiError("protocol_not_configured", "No active Fortune deployment is configured for this network.", 503, { chainId: ledger.chainId });
    }

    return apiOk({
      chainId: ledger.chainId,
      totalLaunches: ledger.total,
      volumeUsd: null,
      revenueUsd: null,
      burns: null,
      rewards: null,
      asOf: new Date().toISOString(),
    }, { cacheSeconds: 8, staleSeconds: 20, meta: {
      dataMode: "onchain",
      source: "Configured Fortune factories' launchCount via one onchain multicall; no estimated volume, revenue, burn or reward values",
    } });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not verify statistics from BNB Chain RPC.", 503);
  }
}
