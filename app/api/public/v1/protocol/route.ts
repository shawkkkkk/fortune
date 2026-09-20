import { apiOk } from "@/lib/public-api";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

export const revalidate = 60;

export async function GET() {
  const chainId = Number(
    process.env.NEXT_PUBLIC_CHAIN_ID || PUBLIC_TESTNET.chainId
  );
  const factory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.factory
      : null);

  return apiOk(
    {
      chainId,
      deployment: {
        factory,
        configured: Boolean(factory),
        environment:
          chainId === PUBLIC_TESTNET.chainId && factory
            ? "public-testnet-alpha"
            : factory
              ? "configured"
              : "not-deployed",
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
          chainId === PUBLIC_TESTNET.chainId
            ? "Pancake V3 testnet adapter + permanent LP locker"
            : "approved IGraduationAdapter; production adapter requires audit",
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
