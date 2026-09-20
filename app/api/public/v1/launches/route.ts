import { apiError, apiOk, parseLimit } from "@/lib/public-api";
import { readRecentFortuneLaunches } from "@/lib/onchain-launches";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 12, 25);

  try {
    const result = await readRecentFortuneLaunches(limit);

    if (!result.configured) {
      return apiError(
        "protocol_not_configured",
        "Fortune deployment is not configured for the active chain.",
        503,
        { chainId: result.chainId }
      );
    }

    return apiOk(
      {
        items: result.launches,
        totalOnchain: result.total,
        chainId: result.chainId,
      },
      {
        cacheSeconds: 8,
        staleSeconds: 20,
        meta: {
          dataMode: "onchain",
          source:
            "FortuneFactory.launchCount + launches + direct token/curve reads",
        },
      }
    );
  } catch (error) {
    return apiError(
      "dependency_unavailable",
      "Fortune could not read the launch ledger from BNB Chain.",
      503,
      {
        reason:
          error instanceof Error ? error.message : "RPC unavailable",
      }
    );
  }
}
