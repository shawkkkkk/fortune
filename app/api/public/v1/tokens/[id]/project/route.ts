import { apiError, apiOk } from "@/lib/public-api";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { readFortuneLaunchByToken } from "@/lib/onchain-launches";
import { readTokenMetadata } from "@/lib/token-metadata";
import { projectToken } from "@/lib/project-canon";
import { projectSnapshot } from "@/lib/project-snapshot";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let token: string;
  try { token = projectToken((await context.params).id); }
  catch { return apiError("invalid_request", "Provide a nonzero token address.", 400); }
  if (FORTUNE_NETWORK.chainId !== 97) return apiError("forbidden", "Project snapshots currently support BSC Testnet only.", 403);
  try {
    const result = await readFortuneLaunchByToken(token);
    if (!result.configured) return apiError("protocol_not_configured", "Fortune is not configured.", 503);
    const launch = result.launch;
    if (!launch || launch.mode !== "standard" || result.blockNumber === null || !result.blockHash) return apiError("not_found", "No supported Standard launch was found.", 404);
    const metadata = await readTokenMetadata(launch.factory, launch.token, launch.creator, result.blockNumber, result.blockHash);
    const data = { metadata, market: { token: launch.token, factory: launch.factory, creator: launch.creator, curve: launch.curve,
      phase: launch.phase, curveReferencePriceUsd: launch.phase <= 1 ? launch.currentPriceUsd : null, curveReserveUsd: launch.reserveUsd,
      graduationTargetUsd: launch.graduationUsd, totalSupply: launch.totalSupply,
      blockNumber: result.blockNumber.toString(), blockHash: result.blockHash } };
    // Validate the full binding before returning any partial snapshot.
    projectSnapshot({ data, meta: { apiVersion: "v1", timestamp: new Date().toISOString() } }, token);
    return apiOk(data);
  } catch { return apiError("dependency_unavailable", "A consistent project snapshot is unavailable. No substitute data was returned.", 503); }
}
