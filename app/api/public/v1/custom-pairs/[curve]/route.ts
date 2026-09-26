import { isAddress } from "viem";
import { CUSTOM_PAIRS } from "@/lib/custom-pairs";
import { readCustomPairLaunch } from "@/lib/custom-pairs-read";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ curve: string }> }) {
  const { curve } = await params;
  if (!isAddress(curve)) return apiError("invalid_request", "Provide a custom-pair curve address.", 400);
  if (!CUSTOM_PAIRS.enabled) return apiError("protocol_not_configured", "Custom pairs are not enabled on this network.", 503);
  try {
    const launch = await readCustomPairLaunch(curve);
    if (!launch) return apiError("not_found", "No custom-pair launch uses this curve.", 404);
    return apiOk(launch, { cacheSeconds: 0 });
  } catch {
    return apiError("dependency_unavailable", "This launch could not be read from BNB Chain right now.", 503);
  }
}
