export type MarketPhase = "curve" | "anchor" | "amm";

export type OrderedMarketPoint = {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  priceUsd: number;
};

export type CurveMarketPoint = OrderedMarketPoint & {
  phase?: "curve";
};

export type AmmMarketPoint = OrderedMarketPoint & {
  phase?: "amm";
  pool: string;
  liquidityUsd: number;
};

export type GraduationAnchorPoint = OrderedMarketPoint & {
  phase?: "anchor";
};

export type CanonicalChartPoint = OrderedMarketPoint & {
  phase: MarketPhase;
  source: "fortune-curve" | "graduation-anchor" | "official-amm";
  poolCount?: number;
};

export type IgnoredChartPoint = {
  point: AmmMarketPoint;
  reason:
    | "UNOFFICIAL_POOL"
    | "INSUFFICIENT_DEPTH"
    | "BEFORE_GRADUATION";
};

function compareOrder(
  a: OrderedMarketPoint,
  b: OrderedMarketPoint
) {
  return (
    a.blockNumber - b.blockNumber ||
    a.transactionIndex - b.transactionIndex ||
    a.logIndex - b.logIndex
  );
}

function orderAtOrBefore(
  point: OrderedMarketPoint,
  anchor: OrderedMarketPoint
) {
  return compareOrder(point, anchor) <= 0;
}

function weightedMedianPrice(
  points: AmmMarketPoint[]
) {
  const sorted = [...points].sort(
    (a, b) => a.priceUsd - b.priceUsd
  );
  const totalWeight = sorted.reduce(
    (sum, point) =>
      sum + Math.max(point.liquidityUsd, 0),
    0
  );

  if (totalWeight <= 0) {
    return sorted[Math.floor(sorted.length / 2)]
      .priceUsd;
  }

  let running = 0;
  for (const point of sorted) {
    running += Math.max(point.liquidityUsd, 0);
    if (running * 2 >= totalWeight) {
      return point.priceUsd;
    }
  }

  return sorted[sorted.length - 1].priceUsd;
}

export function buildCanonicalChart(input: {
  curve: CurveMarketPoint[];
  anchor: GraduationAnchorPoint | null;
  amm: AmmMarketPoint[];
  officialPools: string[];
  minRelativeLiquidityBps?: number;
}) {
  const minRelativeLiquidityBps =
    input.minRelativeLiquidityBps ?? 500;
  const officialPools = new Set(
    input.officialPools.map((pool) =>
      pool.toLowerCase()
    )
  );

  const curve = [...input.curve]
    .filter(
      (point) =>
        Number.isFinite(point.priceUsd) &&
        point.priceUsd > 0 &&
        (!input.anchor ||
          orderAtOrBefore(point, input.anchor))
    )
    .sort(compareOrder)
    .map<CanonicalChartPoint>((point) => ({
      ...point,
      phase: "curve",
      source: "fortune-curve",
    }));

  const series: CanonicalChartPoint[] = [
    ...curve,
  ];

  if (input.anchor) {
    series.push({
      ...input.anchor,
      phase: "anchor",
      source: "graduation-anchor",
    });
  }

  const ignored: IgnoredChartPoint[] = [];
  const eligible: AmmMarketPoint[] = [];

  for (const point of input.amm) {
    if (
      !officialPools.has(point.pool.toLowerCase())
    ) {
      ignored.push({
        point,
        reason: "UNOFFICIAL_POOL",
      });
      continue;
    }

    if (
      input.anchor &&
      orderAtOrBefore(point, input.anchor)
    ) {
      ignored.push({
        point,
        reason: "BEFORE_GRADUATION",
      });
      continue;
    }

    if (
      !Number.isFinite(point.priceUsd) ||
      point.priceUsd <= 0 ||
      !Number.isFinite(point.liquidityUsd) ||
      point.liquidityUsd <= 0
    ) {
      ignored.push({
        point,
        reason: "INSUFFICIENT_DEPTH",
      });
      continue;
    }

    eligible.push(point);
  }

  const byBlock = new Map<
    number,
    AmmMarketPoint[]
  >();

  for (const point of eligible) {
    const existing =
      byBlock.get(point.blockNumber) || [];
    existing.push(point);
    byBlock.set(point.blockNumber, existing);
  }

  for (const blockNumber of [
    ...byBlock.keys(),
  ].sort((a, b) => a - b)) {
    const points =
      byBlock.get(blockNumber) || [];

    const maximumLiquidity =
      Math.max(
        ...points.map(
          (point) => point.liquidityUsd
        )
      );

    const depthFloor =
      maximumLiquidity *
      minRelativeLiquidityBps /
      10_000;

    const deep = points.filter(
      (point) =>
        point.liquidityUsd >= depthFloor
    );

    for (const point of points) {
      if (!deep.includes(point)) {
        ignored.push({
          point,
          reason: "INSUFFICIENT_DEPTH",
        });
      }
    }

    if (!deep.length) continue;

    const last = [...deep].sort(
      compareOrder
    )[deep.length - 1];

    series.push({
      blockNumber,
      transactionIndex:
        last.transactionIndex,
      logIndex: last.logIndex,
      timestamp: Math.max(
        ...deep.map(
          (point) => point.timestamp
        )
      ),
      priceUsd:
        weightedMedianPrice(deep),
      phase: "amm",
      source: "official-amm",
      poolCount: deep.length,
    });
  }

  series.sort(compareOrder);

  return {
    series,
    ignored,
    diagnostics: {
      curvePoints: curve.length,
      anchorIncluded: Boolean(input.anchor),
      ammBlocks:
        series.filter(
          (point) => point.phase === "amm"
        ).length,
      ignoredAmmPoints: ignored.length,
      officialPoolCount: officialPools.size,
      policy:
        "curve events -> immutable graduation anchor -> depth-filtered liquidity-weighted median across official AMM pools",
    },
  };
}
