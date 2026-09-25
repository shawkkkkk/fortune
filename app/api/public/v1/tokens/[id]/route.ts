import { isAddress } from "viem";
import { apiError, apiOk } from "@/lib/public-api";
import { readRecentFortuneLaunches } from "@/lib/onchain-launches";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!isAddress(id)) return apiError("invalid_request", "Provide a BSC token address.", 400);

  try {
    const recent = await readRecentFortuneLaunches(25);
    if (!recent.configured) return apiError("protocol_not_configured", "No Fortune factory is configured for this network.", 503);

    const launch = recent.launches.find((item) => item.token.toLowerCase() === id.toLowerCase());
    if (!launch) return apiError("not_found", "Token was not found among the most recent 25 Fortune factory launches. This does not establish that an older token is unofficial.", 404, { address: id, searched: recent.launches.length, totalOnchain: recent.total });

    return apiOk(launch, { cacheSeconds: 8, staleSeconds: 20, meta: {
      dataMode: "onchain",
      source: "Fortune factory launches plus direct token and curve reads; most recent 25 only",
    } });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not verify this token from BNB Chain RPC.", 503);
  }
}
