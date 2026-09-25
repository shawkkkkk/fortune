import { isAddress } from "viem";
import { apiError, apiOk } from "@/lib/public-api";
import { readFortuneLaunchByToken } from "@/lib/onchain-launches";
import { readTokenMetadata } from "@/lib/token-metadata";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isAddress(id)) return apiError("invalid_request", "Provide a token address.", 400);
  try {
    const result = await readFortuneLaunchByToken(id);
    if (!result.configured) return apiError("protocol_not_configured", "Fortune is not configured.", 503);
    if (!result.launch || result.blockNumber == null || !result.blockHash) return apiError("not_found", "No verified Fortune launch was found.", 404);
    if (result.launch.mode !== "standard") return apiError("not_found", "This metadata reader supports Standard launches only.", 404);
    const launch = result.launch;
    return apiOk(await readTokenMetadata(launch.factory, launch.token, launch.creator, result.blockNumber, result.blockHash));
  } catch { return apiError("dependency_unavailable", "Onchain project metadata is unavailable. Creator details have not been substituted.", 503); }
}
