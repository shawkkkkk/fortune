import { analytics } from "@/data/mock";
import { apiOk } from "@/lib/public-api";

export const revalidate = 60;

export async function GET() {
  return apiOk(
    {
      protocolRevenueUsd:
        analytics.protocolRevenue,
      rewardsDistributedUsd:
        analytics.rewardsDistributed,
      buybacksUsd: analytics.buybacks,
      accounting: {
        creatorFeesIncludedInProtocolRevenue: false,
        shieldTaxIncludedInProtocolRevenue: false,
        shieldTaxClassification:
          "liquidity reinforcement",
      },
    },
    {
      cacheSeconds: 60,
      staleSeconds: 300,
      meta: {
        dataMode: "demo",
        productionSource:
          "FeeRouted + automation execution events",
      },
    }
  );
}
