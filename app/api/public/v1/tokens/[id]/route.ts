import { launches } from "@/data/mock";
import { apiError, apiOk } from "@/lib/public-api";

export const revalidate = 10;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const needle = id.toLowerCase();

  const launch = launches.find(
    (item) =>
      item.id.toLowerCase() === needle ||
      item.symbol.toLowerCase() === needle
  );

  if (!launch) {
    return apiError(
      "not_found",
      "No indexed Fortune token matches that identifier.",
      404,
      { id }
    );
  }

  return apiOk(
    {
      ...launch,
      contract: {
        address: null,
        expectedSuffix: "fe",
        source: "demo",
      },
      launchShield: {
        openingBuyTaxBps: 9900,
        taxDurationSeconds: 5,
        walletCapBps: 200,
        walletCapDurationSeconds: 15,
      },
      chart: {
        canonicalPriceModel: "fortune-curve-then-depth-aware-amm",
        graduationAnchorSupported: true,
        phase:
          launch.status === "Graduated"
            ? "amm"
            : "curve",
      },
      poolHealth: {
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
        priceContinuityChecked:
          launch.status === "Graduated",
        indexerReady:
          launch.status === "Graduated",
      },
      metadata: {
        policy: "editable-or-immutable-per-launch",
        revision: 1,
      },
    },
    {
      cacheSeconds: 10,
      staleSeconds: 30,
      meta: {
        dataMode: "demo",
      },
    }
  );
}
