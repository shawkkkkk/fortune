import { apiError, apiOk, parseLimit } from "@/lib/public-api";
import { readRecentFortuneLaunches } from "@/lib/onchain-launches";

import { decodeCatalogCursor, encodeCatalogCursor } from "@/lib/catalog-cursor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 12, 25);

  let position: ReturnType<typeof decodeCatalogCursor>;
  try { position = decodeCatalogCursor(url.searchParams.get("cursor")); }
  catch { return apiError("invalid_request", "Invalid catalog cursor. Start from the first page.", 400); }
  const { offset, blockNumber } = position;

  try {
    const result = await readRecentFortuneLaunches(limit, offset, blockNumber);

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
        items: result.launches.map((launch) => ({
          id: launch.id,
          mode: launch.mode,
          factory: launch.factory,
          token: launch.token,
          curve: launch.curve,
          creator: launch.creator,
          name: launch.name,
          symbol: launch.symbol,
          status: launch.status,
          currentPriceUsd: launch.currentPriceUsd,
          reserveUsd: launch.reserveUsd,
          graduationUsd: launch.graduationUsd,
          graduationProgress: launch.graduationProgress,
          totalSupply: launch.totalSupply,
          quoteAssets: launch.quoteAssets,
          createdAt: launch.createdAt,
        })),
        totalOnchain: result.total,
        chainId: result.chainId,
        page: { limit, hasMore: result.hasMore, nextCursor: result.hasMore ? encodeCatalogCursor(offset + result.launches.length, result.blockNumber!) : null },
      },
      {
        cacheSeconds: 8,
        staleSeconds: 20,
        meta: {
          dataMode: "onchain",
          blockNumber: result.blockNumber?.toString(), blockHash: result.blockHash,
          source:
            "FortuneFactory + FortuneTaxFactory + FortuneToken + FortuneCurve reads",
        },
      }
    );
  } catch (error) {
    return apiError(
      "dependency_unavailable",
      "Fortune could not read token markets from BNB Chain.",
      503,

    );
  }
}
