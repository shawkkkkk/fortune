import { launches } from "@/data/mock";
import {
  apiError,
  apiOk,
} from "@/lib/public-api";
import {
  buildCanonicalChart,
} from "@/lib/canonical-chart";

export const revalidate = 10;

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;
  const launch = launches.find(
    (item) =>
      item.id.toLowerCase() ===
        id.toLowerCase() ||
      item.symbol.toLowerCase() ===
        id.toLowerCase()
  );

  if (!launch) {
    return apiError(
      "not_found",
      "No indexed Fortune token matches that identifier.",
      404,
      { id }
    );
  }

  // Demo-only fixture until the event indexer is connected.
  // The production route will feed this same continuity engine from
  // Bought/Sold/GraduationAnchor/PancakePoolGraduated + Swap events.
  const curve = [
    {
      blockNumber: 100,
      transactionIndex: 1,
      logIndex: 2,
      timestamp: 1_700_000_000,
      priceUsd: 0.001,
    },
    {
      blockNumber: 105,
      transactionIndex: 1,
      logIndex: 2,
      timestamp: 1_700_000_030,
      priceUsd: 0.0014,
    },
    {
      blockNumber: 110,
      transactionIndex: 2,
      logIndex: 4,
      timestamp: 1_700_000_060,
      priceUsd: 0.0019,
    },
  ];

  const anchor =
    launch.status === "Curve"
      ? null
      : {
          blockNumber: 115,
          transactionIndex: 0,
          logIndex: 1,
          timestamp: 1_700_000_090,
          priceUsd: 0.0021,
        };

  const officialPools =
    launch.status === "Graduated"
      ? ["0x00000000000000000000000000000000000000a1"]
      : [];

  const amm =
    launch.status === "Graduated"
      ? [
          {
            blockNumber: 116,
            transactionIndex: 1,
            logIndex: 3,
            timestamp: 1_700_000_096,
            priceUsd: 0.00212,
            pool:
              "0x00000000000000000000000000000000000000a1",
            liquidityUsd: 100_000,
          },
          {
            blockNumber: 116,
            transactionIndex: 2,
            logIndex: 5,
            timestamp: 1_700_000_097,
            priceUsd: 0.25,
            pool:
              "0x00000000000000000000000000000000000000ff",
            liquidityUsd: 50,
          },
        ]
      : [];

  const chart = buildCanonicalChart({
    curve,
    anchor,
    amm,
    officialPools,
  });

  return apiOk(chart, {
    cacheSeconds: 10,
    staleSeconds: 30,
    meta: {
      dataMode: "demo",
      productionSource:
        "Fortune curve events, immutable GraduationAnchor, official graduated pool set, and Pancake V3 Swap events",
      important:
        "Unrelated pools and insufficient-depth pools are excluded from the canonical chart rather than averaged into price.",
    },
  });
}
