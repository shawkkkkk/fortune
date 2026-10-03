import { isAddress } from "viem";
import { STOCK_REWARDS } from "@/lib/stock-rewards";
import { readStockRewardsLaunch } from "@/lib/stock-rewards-read";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ curve: string }> }) {
  const { curve } = await params;
  if (!isAddress(curve)) return apiError("invalid_request", "Provide a Stock Rewards curve address.", 400);
  if (!STOCK_REWARDS.enabled) return apiError("protocol_not_configured", "Stock Rewards are not enabled on this network.", 503);
  try {
    const launch = await readStockRewardsLaunch(curve);
    if (!launch) return apiError("not_found", "No Stock Rewards launch uses this curve.", 404);
    return apiOk(launch, { cacheSeconds: 0 });
  } catch {
    return apiError("dependency_unavailable", "This launch could not be read from BNB Chain right now.", 503);
  }
}
