import { getAddress, isAddress, type Address } from "viem";
import { apiError, apiOk, parseLimit } from "@/lib/public-api";
import { MARKET_SORTS, RANK_LIMIT, readMarketBoard, readMarketsForTokens, type MarketSort } from "@/lib/market-insights";

export const dynamic = "force-dynamic";

const MAX_TOKENS = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("tokens");
  let tokens: Address[] | null = null;
  if (tokenParam !== null) {
    const list = [...new Set(tokenParam.split(",").map((value) => value.trim()).filter(Boolean))];
    if (list.length > MAX_TOKENS || list.some((value) => !isAddress(value, { strict: false }))) {
      return apiError("invalid_request", `tokens must be up to ${MAX_TOKENS} comma-separated token addresses.`, 400);
    }
    tokens = list.map((value) => getAddress(value));
  }
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
    const board = tokens ? await readMarketsForTokens(tokens) : await readMarketBoard(sort, offset, limit);
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
          "Pool state is read at blockNumber; current USD valuation uses the latest healthy registry oracle observation. Graduated tokens use official locked Pancake pools.",
          "Curve trade USD values are recorded onchain. Historical pool swap USD values remain unavailable until historical oracle valuation is implemented.",
          "Activity is null unless the ledger coverage spans the whole window. Sorts other than newest rank the " + RANK_LIMIT + " most recent launches.",
        ],
      },
    });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not read markets from BNB Chain.", 503);
  }
}
