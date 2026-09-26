import { CUSTOM_PAIRS } from "@/lib/custom-pairs";
import { readCustomPairLaunches } from "@/lib/custom-pairs-read";
import { apiError, apiOk, parseLimit } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** Custom-pair beta launches (any BEP-20 pair), newest first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 24, 48);
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get("offset") || 0) || 0));
  if (!CUSTOM_PAIRS.enabled) {
    return apiOk({ configured: false, beta: true, audited: false, chainId: CUSTOM_PAIRS.chainId, total: 0, launches: [] }, { cacheSeconds: 30 });
  }
  try {
    const page = await readCustomPairLaunches(offset, limit);
    return apiOk(
      { ...page, beta: true, audited: false, factory: CUSTOM_PAIRS.factory, offset, limit },
      { cacheSeconds: 10, staleSeconds: 30 }
    );
  } catch {
    return apiError("dependency_unavailable", "Custom-pair launches could not be read from BNB Chain right now.", 503);
  }
}
