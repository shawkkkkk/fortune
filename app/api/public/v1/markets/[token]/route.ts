import { isAddress, type Address } from "viem";
import { apiError, apiOk } from "@/lib/public-api";
import { CHART_RANGES, isChartRange, readTokenMarket, type ChartRange } from "@/lib/market-insights";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isAddress(token)) return apiError("invalid_request", "Provide a BSC token address.", 400);
  const range = (new URL(request.url).searchParams.get("range") || "24h") as ChartRange;
  if (!isChartRange(range)) return apiError("invalid_request", "range must be one of: " + Object.keys(CHART_RANGES).join(", ") + ".", 400);

  try {
    const market = await readTokenMarket(token as Address, range);
    if (!market.configured) return apiError("protocol_not_configured", "No Fortune factory is configured for this network.", 503);
    if (!market.summary) {
      return apiError("not_found", "This address was not recorded by the configured Fortune factories at the queried block.", 404, { address: token, blockNumber: market.blockNumber });
    }
    return apiOk(market, {
      cacheSeconds: 15,
      staleSeconds: 45,
      meta: {
        dataMode: "onchain",
        blockNumber: market.blockNumber,
        chartPolicy: "curve events -> immutable graduation anchor -> depth-filtered liquidity-weighted median across official AMM pools",
        notes: [
          "Curve points use the spot price after each trade, rebuilt from tokensSold at the ledger head.",
          "chart.ledger.coversRange is false when the log provider could not serve the whole range; points then start at coverage.fromBlock.",
        ],
      },
    });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not read this market from BNB Chain.", 503);
  }
}
