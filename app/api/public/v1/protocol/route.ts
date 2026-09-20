import { apiOk } from "@/lib/public-api";

export const revalidate = 60;

export async function GET() {
  const factory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || null;

  return apiOk(
    {
      chainId: Number(
        process.env.NEXT_PUBLIC_CHAIN_ID || 97
      ),
      deployment: {
        factory,
        configured: Boolean(factory),
        environment: factory ? "testnet/research" : "not-deployed",
      },
      token: {
        fixedSupply: true,
        vanitySuffix: "fe",
        postLaunchMint: false,
        arbitraryBlacklist: false,
      },
      launchShield: {
        enabled: true,
        openingBuyTaxBps: 9900,
        taxDurationSeconds: 5,
        earlyWalletCapBps: 200,
        walletCapDurationSeconds: 15,
        creatorExemptions: false,
        shieldDestination: "liquidity-reinforcement-vault",
      },
      tradingFee: {
        maxTotalBps: 500,
        routes: [
          "creator",
          "holders",
          "buyback",
          "liquidity",
          "treasury",
          "protocol",
        ],
      },
      graduation: {
        preflightRequired: true,
        atomic: true,
        retryableOnFailure: true,
        finalBuyPartialFillRefund: true,
        rescueDelaySeconds: 604800,
        explicitPhases: [
          "CurveActive",
          "GraduationReady",
          "PoolCreated",
          "Rescued",
        ],
        priceAnchor: true,
        destination:
          "approved IGraduationAdapter; PancakeSwap production adapter pending audit",
      },
      api: {
        basePath: "/api/public/v1",
        pagination: "cursor",
        writeModel:
          "unsigned transaction / wallet signature; no custody",
      },
    },
    {
      cacheSeconds: 60,
      staleSeconds: 300,
      meta: {
        source:
          "Fortune protocol configuration; deployment addresses come from server environment",
      },
    }
  );
}
