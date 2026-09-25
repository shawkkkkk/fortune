import { isAddress } from "viem";
import { apiError, apiOk } from "@/lib/public-api";
import { readFortuneLaunchByToken } from "@/lib/onchain-launches";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!isAddress(id)) return apiError("invalid_request", "Provide a BSC token address.", 400);

  try {
    const recent = await readFortuneLaunchByToken(id);
    if (!recent.configured) return apiError("protocol_not_configured", "No Fortune factory is configured for this network.", 503);

    const launch = recent.launch;
    if (!launch) return apiError("not_found", "Token was not found in the configured Fortune factories at the reported block.", 404, { address: id, totalOnchain: recent.total, blockNumber: recent.blockNumber?.toString(), blockHash: recent.blockHash });

    return apiOk(launch, { cacheSeconds: 8, staleSeconds: 20, meta: {
      dataMode: "onchain",
      source: "Complete configured factory catalog and token/curve reads at one block",
      blockNumber: recent.blockNumber?.toString(), blockHash: recent.blockHash,
    } });
  } catch {
    return apiError("dependency_unavailable", "Fortune could not verify this token from BNB Chain RPC.", 503);
  }
}
