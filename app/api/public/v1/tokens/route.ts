import { launches } from "@/data/mock";
import {
  apiOk,
  paginate,
  parseLimit,
} from "@/lib/public-api";

export const revalidate = 15;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const status = url.searchParams.get("status");
  const quote = url.searchParams.get("quote");
  const sort = url.searchParams.get("sort") || "marketCap";
  const limit = parseLimit(
    url.searchParams.get("limit"),
    25,
    100
  );

  let rows = launches.filter((launch) => {
    if (
      query &&
      !launch.name.toLowerCase().includes(query) &&
      !launch.symbol.toLowerCase().includes(query)
    ) {
      return false;
    }

    if (
      status &&
      launch.status.toLowerCase() !== status.toLowerCase()
    ) {
      return false;
    }

    if (
      quote &&
      !launch.quoteAssets.some(
        (asset) => asset.toLowerCase() === quote.toLowerCase()
      )
    ) {
      return false;
    }

    return true;
  });

  rows = [...rows].sort((a, b) => {
    if (sort === "newest") return a.id < b.id ? 1 : -1;
    if (sort === "volume") return b.volume24h - a.volume24h;
    return b.marketCap - a.marketCap;
  });

  const result = paginate(
    rows,
    url.searchParams.get("cursor"),
    limit
  );

  return apiOk(result, {
    cacheSeconds: 15,
    staleSeconds: 60,
    meta: {
      dataMode: "demo",
      warning:
        "Production token markets will come from the Fortune onchain indexer. Demo values are not live market data.",
    },
  });
}
