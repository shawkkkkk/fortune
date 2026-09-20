import { analytics } from "@/data/mock";
import { apiOk } from "@/lib/public-api";

export const revalidate = 15;

export async function GET() {
  return apiOk(
    {
      ...analytics,
      reliability: {
        graduationPreflight: true,
        atomicGraduation: true,
        retryTelemetry: true,
        graduationPriceAnchor: true,
        launchShield: true,
      },
    },
    {
      cacheSeconds: 15,
      staleSeconds: 60,
      meta: {
        dataMode: "demo",
        warning:
          "Production aggregates will be reproducible from public Fortune events.",
      },
    }
  );
}
