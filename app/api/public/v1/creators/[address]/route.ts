import { getAddress, isAddress } from "viem";
import { decodeCatalogCursor, encodeCatalogCursor } from "@/lib/catalog-cursor";
import { apiError, apiOk, parseLimit } from "@/lib/public-api";
import { readCreatorRecord } from "@/lib/market-insights";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  if (!isAddress(address)) return apiError("invalid_request", "Provide a BSC creator address.", 400);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 12, 25);

  let position: ReturnType<typeof decodeCatalogCursor>;
  try { position = decodeCatalogCursor(url.searchParams.get("cursor")); }
  catch { return apiError("invalid_request", "Invalid catalog cursor. Start from the first page.", 400); }

  try {
    const record = await readCreatorRecord(getAddress(address), position.offset, limit, position.blockNumber);
    if (!record.configured) return apiError("protocol_not_configured", "No Fortune factory is configured for this network.", 503);
    const nextCursor = record.hasMore && record.blockNumber ? encodeCatalogCursor(position.offset + record.items.length, BigInt(record.blockNumber)) : null;
    return apiOk({ ...record, page: { limit, hasMore: record.hasMore, nextCursor } }, {
      cacheSeconds: 15,
      staleSeconds: 45,
      meta: {
        dataMode: "onchain",
        blockNumber: record.blockNumber,
        notes: [
          "launches and phases count every launch this address created, read at blockNumber.",
          "creatorShare is the creator wallet's balance now as a fraction of supply. Tokens moved to other wallets are not attributed to the creator.",
        ],
      },
    });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not read this creator's launches from BNB Chain.", 503);
  }
}
