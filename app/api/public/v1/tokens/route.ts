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
          "Fortune does not publish synthetic token markets. Public token listings will appear after the onchain event indexer is live.",
      },
    }
  );
}
