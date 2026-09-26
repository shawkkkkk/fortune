import { isAddress } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { inspectPairToken } from "@/lib/pair-inspector";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/**
 * Measures how any BEP-20 behaves as a custom pair: metadata, issuer controls
 * found in its bytecode, and the transfer tax on each leg a custom-pair curve
 * uses, simulated with eth_call state overrides. Read-only; nothing is signed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() || "";
  const holder = url.searchParams.get("holder")?.trim() || null;
  const chainId = Number(url.searchParams.get("chain") || FORTUNE_NETWORK.chainId);

  if (!isAddress(address) || /^0x0{40}$/i.test(address)) {
    return apiError("invalid_request", "Provide a token contract address (0x followed by 40 hex characters).", 400);
  }
  if (holder && !isAddress(holder)) return apiError("invalid_request", "The holder must be a 0x address.", 400);
  if (chainId !== FORTUNE_NETWORK.chainId && chainId !== 56) {
    return apiError("invalid_request", `Supported chains: ${FORTUNE_NETWORK.chainId} and 56.`, 400);
  }

  try {
    const inspection = await Promise.race([
      inspectPairToken({ address, chainId, holder }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);
    return apiOk(inspection, {
      cacheSeconds: holder ? 0 : 60,
      staleSeconds: holder ? 0 : 300,
      meta: {
        source: "BNB Chain RPC: bytecode, storage and eth_call transfer simulation with state overrides",
        disclaimer: "A simulation at one block, not an audit. Issuers can change taxes, pause or blacklist later.",
      },
    });
  } catch {
    return apiError("dependency_unavailable", "The token could not be inspected on this network right now.", 503);
  }
}
