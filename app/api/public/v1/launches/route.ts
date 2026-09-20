import { apiOk } from "@/lib/public-api";

export const revalidate = 15;

export async function GET() {
  return apiOk(
    {
      items: [],
      page: {
        limit: 0,
        nextCursor: null,
        hasMore: false,
        total: 0,
      },
      indexerReady: false,
    },
    {
      cacheSeconds: 15,
      staleSeconds: 60,
      meta: {
        dataMode: "indexer_pending",
        note:
          "Launches created on BSC Testnet are real onchain contracts, but the public launch index is not live yet.",
      },
    }
  );
}
