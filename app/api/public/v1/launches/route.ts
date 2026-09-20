import { launches } from "@/data/mock";
import {
  apiOk,
  paginate,
  parseLimit,
} from "@/lib/public-api";

export const revalidate = 15;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const creator = (url.searchParams.get("creator") || "")
    .trim()
    .toLowerCase();
  const status = url.searchParams.get("status");
  const limit = parseLimit(
    url.searchParams.get("limit"),
    25,
    100
  );

  const rows = launches
    .filter((launch) => {
      if (
        creator &&
        launch.creator.toLowerCase() !== creator
      ) {
        return false;
      }

      if (
        status &&
        launch.status.toLowerCase() !==
          status.toLowerCase()
      ) {
        return false;
      }

      return true;
    })
    .map((launch) => ({
      ...launch,
      launchHealth: {
        state:
          launch.status === "Graduated"
            ? "trading_live"
            : launch.status === "Graduating"
              ? "graduation_ready"
              : "curve_active",
        poolCreated:
          launch.status === "Graduated",
        liquidityVerified:
          launch.status === "Graduated",
        indexingReady:
          launch.status === "Graduated",
      },
    }));

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
      note:
        "Production launch state comes from FortuneFactory + curve + graduation events, not database claims.",
    },
  });
}
