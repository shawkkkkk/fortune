import { apiOk } from "@/lib/public-api";

export const revalidate = 60;

export async function GET() {
  return apiOk(
    {
      liveRevenueAggregatesAvailable: false,
      protocolRevenueUsd: null,
      rewardsDistributedUsd: null,
      buybacksUsd: null,
      accounting: {
        creatorFeesIncludedInProtocolRevenue: false,
        shieldTaxIncludedInProtocolRevenue: false,
        shieldTaxClassification: "liquidity reinforcement",
      },
    },
    {
      cacheSeconds: 60,
      staleSeconds: 300,
      meta: {
        dataMode: "indexer_pending",
        note:
          "Fortune does not publish placeholder revenue. Aggregates will be derived from public fee-routing and automation events.",
      },
    }
  );
}
