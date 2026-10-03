import { STOCK_REWARDS } from "@/lib/stock-rewards";
import { readStockListings } from "@/lib/stock-rewards-read";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** Stocks the Stock Rewards registry lists for new launches, with their current prices. */
export async function GET() {
  if (!STOCK_REWARDS.enabled) {
    return apiOk({ configured: false, chainId: STOCK_REWARDS.chainId, registry: null, stocks: [] }, { cacheSeconds: 30 });
  }
  try {
    const listing = await readStockListings();
    return apiOk({ ...listing, chainId: STOCK_REWARDS.chainId, factory: STOCK_REWARDS.factory }, { cacheSeconds: 15, staleSeconds: 60 });
  } catch {
    return apiError("dependency_unavailable", "The Stock Rewards registry could not be read from BNB Chain right now.", 503);
  }
}
