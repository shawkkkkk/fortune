import { after } from "next/server";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { readHolderView, type HolderView } from "@/lib/holder-index";
import { advanceIfDue } from "@/lib/holder-runtime";
import { holderStore } from "@/lib/holder-store";
import { readTokenSummary } from "@/lib/market-insights";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tokens held here are not holders: burned, or held by the protocol itself.
const BURN_ADDRESSES = ["0x000000000000000000000000000000000000dEaD", "0x0000000000000000000000000000000000000000"];

/**
 * Holder count, top holders and the Launch Shield window for one launch, from
 * the holder index. `enabled` is false when no index store is configured. Each
 * read may move the index forward once per interval, after the response.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isAddress(token)) return apiError("invalid_request", "Provide a BSC token address.", 400);
  const store = holderStore();
  if (!store) return apiOk({ enabled: false as const }, { cacheSeconds: 300 });

  let lookup: Awaited<ReturnType<typeof readTokenSummary>>;
  try {
    lookup = await readTokenSummary(getAddress(token) as Address);
  } catch {
    return apiError("dependency_unavailable", "The launch could not be read from BNB Chain right now.", 503);
  }
  if (!lookup) return apiError("not_found", "This address is not a Fortune launch on this network.", 404, { address: token });
  const { summary } = lookup;
  const exclude = [summary.curve, ...summary.vaults, ...summary.pairs.flatMap((pair) => (pair.pool ? [pair.pool.address] : [])), ...BURN_ADDRESSES];

  let view: HolderView | null = null;
  try {
    view = await readHolderView(store, FORTUNE_NETWORK.chainId, summary.token, { exclude, totalSupply: parseUnits(summary.totalSupply, 18) });
  } catch {
    view = null;
  }
  // Page views keep the index moving; the throttle allows one run per interval.
  after(() => advanceIfDue(store, 25_000).then(() => undefined, () => undefined));
  return apiOk(
    { enabled: true as const, token: summary.token, creator: summary.creator, view },
    { cacheSeconds: 15, staleSeconds: 45 }
  );
}
