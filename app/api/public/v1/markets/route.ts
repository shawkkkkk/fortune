import { apiError, apiOk, parseLimit } from "@/lib/public-api";
import { MARKET_SORTS, RANK_LIMIT, readMarketBoard, type MarketSort } from "@/lib/market-insights";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sort = (url.searchParams.get("sort") || "newest") as MarketSort;
  if (!MARKET_SORTS.includes(sort)) {
    return apiError("invalid_request", "sort must be one of: " + MARKET_SORTS.join(", ") + ".", 400);
  }
  const limit = parseLimit(url.searchParams.get("limit"), 25, 25);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000 || (sort !== "newest" && offset >= RANK_LIMIT)) {
    return apiError("invalid_request", "offset is out of range for this sort.", 400);
  }

  try {
    const board = await readMarketBoard(sort, offset, limit);
    if (!board.configured) {
      return apiError("protocol_not_configured", "Fortune deployment is not configured for the active chain.", 503, { chainId: board.chainId });
    }
    return apiOk(board, {
      cacheSeconds: 15,
      staleSeconds: 45,
      meta: {
        dataMode: "onchain",
        blockNumber: board.blockNumber,
        source: "Factory catalog + token/curve/locker/pool state reads + bounded eth_getLogs trade ledger",
        notes: [
          "Prices, market caps and liquidity are state reads at blockNumber. Graduated tokens are priced from their official locked Pancake pools.",
          "Curve trade USD values are recorded onchain; pool swap USD values use the pair asset's current registry oracle price.",
          "Activity is null unless the ledger coverage spans the whole window. Sorts other than newest rank the " + RANK_LIMIT + " most recent launches.",
        ],
      },
    });
  } catch (error) {
    return apiError("dependency_unavailable", "Fortune could not read markets from BNB Chain.", 503, {
      reason: error instanceof Error ? error.message : "RPC unavailable",
    });
  }
}
