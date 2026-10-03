import { STOCK_REWARDS } from "@/lib/stock-rewards";
import { readStockRewardsLaunches } from "@/lib/stock-rewards-read";
import { apiError, apiOk, parseLimit } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** Stock Rewards beta launches (one to five stocks, paid to holders), newest first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 24, 48);
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get("offset") || 0) || 0));
  if (!STOCK_REWARDS.enabled) {
    return apiOk({ configured: false, beta: true, audited: false, chainId: STOCK_REWARDS.chainId, total: 0, launches: [] }, { cacheSeconds: 30 });
  }
  try {
    const page = await readStockRewardsLaunches(offset, limit);
    return apiOk({ ...page, beta: true, audited: false, factory: STOCK_REWARDS.factory, offset, limit }, { cacheSeconds: 10, staleSeconds: 30 });
  } catch {
    return apiError("dependency_unavailable", "Stock Rewards launches could not be read from BNB Chain right now.", 503);
  }
}
