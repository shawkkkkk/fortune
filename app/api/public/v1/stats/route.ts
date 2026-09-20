import { apiOk } from "@/lib/public-api";

export const revalidate = 60;

export async function GET() {
  return apiOk(
    {
      liveMarketAggregatesAvailable: false,
      releaseValidation: {
        httpRequests: 7500,
        httpSuccesses: 7500,
        peakConcurrency: 500,
        peakThroughputRps: 840.9,
        p95AtPeakConcurrencyMs: 935,
        p95ReleaseLimitMs: 2500,
        realConcurrentLoadGraduations: {
          requested: 3,
          completed: 3,
        },
        foundryTests: {
          passed: 39,
          failed: 0,
        },
        fuzzRuns: 1000,
        graduationInvariantChecks: {
          beforeStorm: "16/16",
          afterStorm: "16/16",
        },
      },
      reliability: {
        graduationPreflight: true,
        atomicGraduation: true,
        retryTelemetry: true,
        graduationPriceAnchor: true,
        launchShield: true,
      },
    },
    {
      cacheSeconds: 60,
      staleSeconds: 300,
      meta: {
        dataMode: "release_evidence",
        note:
          "These are measured release-test results, not live market analytics. Live aggregates require the public onchain indexer.",
      },
    }
  );
}
