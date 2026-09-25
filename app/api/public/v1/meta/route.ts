import { apiOk } from "@/lib/public-api";
import { MAINNET_ACTIVATION_READY, MAINNET_RELEASE } from "@/lib/mainnet-release";

export const revalidate = 3600;

export async function GET() {
  return apiOk(
    {
      name: "Fortune Public API",
      chain: {
        name: "BNB Smart Chain",
        mainnetChainId: 56,
        testnetChainId: 97,
      },
      authentication: {
        reads: "none",
        writes:
          "wallet-authorized only; Fortune never requests or stores private keys",
      },
      principles: [
        "chain state is authoritative",
        "no server-side private-key signing",
        "preview before prepare",
        "stable machine-readable error codes",
        "exact raw values plus human-readable values",
        "pool health is distinct from pool existence",
        "cache public reads; isolate writes",
        "never auto-resubmit an uncertain transaction",
      ],
      productionScope: {
        mainnetActivationReady: MAINNET_ACTIVATION_READY,
        standardLaunches: MAINNET_ACTIVATION_READY && MAINNET_RELEASE.scope.standardLaunches,
        maximumInitialRegistryAssets: MAINNET_RELEASE.scope.maximumInitialRegistryAssets,
        burnRewardsV2: false,
        tokenizedStocksAndRwas: false,
      },
      researchCapabilities: {
        basketCurve: true,
        testnetMultiQuoteAssets: 5,
        launchShield: true,
        vanitySuffix: "fe",
        editableDisplayMetadata: true,
        stockTokenPairing: "research; gated by exact BSC contract and policy",
        stockFloor: true,
        preIpoPerpReference: true,
        automations: "testnet research; disabled in mainnet v1 fee routes",
        graduationPreflight: true,
        graduationRetryTelemetry: true,
        finalBuyPartialFillRefund: true,
        sevenDayGraduationRescue: true,
        authoritativeMarketPhases: true,
      },
      docs: "/developers",
      openapi: "/api/public/v1/openapi",
    },
    {
      cacheSeconds: 3600,
      staleSeconds: 86400,
    }
  );
}
