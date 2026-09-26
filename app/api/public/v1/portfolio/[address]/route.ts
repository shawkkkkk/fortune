import { getAddress, isAddress } from "viem";
import { apiError, apiOk } from "@/lib/public-api";
import { readPortfolio } from "@/lib/market-insights";
import { HOLDINGS_LIMIT } from "@/lib/onchain-launches";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  if (!isAddress(address)) return apiError("invalid_request", "Provide a BSC wallet address.", 400);

  try {
    const portfolio = await readPortfolio(getAddress(address));
    if (!portfolio.configured) return apiError("protocol_not_configured", "No Fortune factory is configured for this network.", 503);
    return apiOk(portfolio, {
      cacheSeconds: 15,
      staleSeconds: 45,
      meta: {
        dataMode: "onchain",
        blockNumber: portfolio.blockNumber,
        notes: [
          "Balances are read for every launch in the factory catalog at blockNumber.",
          `positions details at most ${HOLDINGS_LIMIT} holdings, newest launches first; held counts all of them.`,
          "valueUsd uses the live curve price, or the liquidity-weighted official pool price after graduation. It is not a sale quote: a sale moves the price and pays the trade fee.",
        ],
      },
    });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not read these balances from BNB Chain.", 503);
  }
}
