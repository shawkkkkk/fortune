import { apiOk } from "@/lib/public-api";

export const revalidate = 30;

export async function GET() {
  return apiOk(
    {
      activityIndexerReady: false,
      capabilities: [
        {
          name: "Permanent LP custody",
          status: "live",
          source: "FortunePermanentLiquidityLocker",
        },
        {
          name: "Permissionless graduation finalization",
          status: "live",
          source: "FortuneFactory.finalizeGraduation",
        },
        {
          name: "Retryable graduation failures",
          status: "live",
          source: "FortuneFactory graduationStatus",
        },
        {
          name: "Delayed reserve rescue",
          status: "live",
          source: "FortuneCurve",
        },
      ],
      executionModel: {
        vaults: "purpose-locked",
        adapters: "protocol-approved",
        arbitraryKeeperDestination: false,
      },
    },
    {
      cacheSeconds: 30,
      staleSeconds: 60,
      meta: {
        dataMode: "deployed_capabilities",
        note:
          "No synthetic execution counts or dollar totals are published before the onchain activity indexer is live.",
      },
    }
  );
}
