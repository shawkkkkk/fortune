import { assets } from "@/data/assets";
import {
  apiOk,
  apiError,
  paginate,
  parseLimit,
} from "@/lib/public-api";
import { readFortuneAssetUniverse } from "@/lib/onchain-assets";
import { pairEligibility } from "@/lib/pair-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const category = url.searchParams.get("category");
  const onlyLaunchable =
    url.searchParams.get("launchable") !== "false";
  const limit = parseLimit(
    url.searchParams.get("limit"),
    50,
    100
  );

  let universe: Awaited<ReturnType<typeof readFortuneAssetUniverse>>;
  try { universe = await readFortuneAssetUniverse(); }
  catch { return apiError("dependency_unavailable", "Pair eligibility could not be verified from the active registry.", 503); }
  if (!universe.configured) return apiError("protocol_not_configured", "The active registry is not configured.", 503);
  const pairs = assets
    .filter((asset) => asset.chain === "BSC")
    .map((asset) => {
      const exactAddress = Boolean(asset.address);
      const quoteEnabled =
        asset.capabilities.includes("quote");
      const rewardEnabled =
        asset.capabilities.includes("reward");
      const graduationEnabled =
        asset.capabilities.includes("graduation");

      const reasonCodes: string[] = [];
      if (!exactAddress) {
        reasonCodes.push("NO_VERIFIED_BSC_ADDRESS");
      }
      if (!quoteEnabled) {
        reasonCodes.push("QUOTE_CAPABILITY_DISABLED");
      }
      if (!graduationEnabled) {
        reasonCodes.push("GRADUATION_CAPABILITY_DISABLED");
      }
      if (asset.verification === "Unavailable") {
        reasonCodes.push("ASSET_UNAVAILABLE");
      }

      const activeAsset = universe.chainId === 56 ? universe.assets.find((row) => row.address.toLowerCase() === asset.address?.toLowerCase()) : undefined;
      const eligibility = pairEligibility(activeAsset, universe.chainId);
      const launchable = eligibility.eligible;
      reasonCodes.push(...eligibility.reasons);

      return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        address: asset.address || null,
        category: String(asset.category),
        verification: asset.verification,
        capabilities: {
          quote: quoteEnabled,
          reward: rewardEnabled,
          graduation: graduationEnabled,
        },
        launchable,
        preflight: {
          staticReady: exactAddress && quoteEnabled && graduationEnabled,
          reasonCodes,
          runtimeChecksRequired: [
            "oracle freshness",
            "token transfer compatibility",
            "graduation-adapter readiness",
          ],
        },
      };
    })
    .concat(universe.assets.filter((row) => universe.chainId !== 56 || !assets.some((seed) => seed.address?.toLowerCase() === row.address.toLowerCase())).map((row) => ({
      id: row.address, symbol: row.symbol, name: row.name, address: row.address, category: row.category,
      verification: "Approved" as const,
      capabilities: { quote: row.quoteEnabled, reward: row.rewardEnabled, graduation: row.graduationEnabled },
      launchable: row.launchable, preflight: { staticReady: true, reasonCodes: pairEligibility(row, universe.chainId).reasons, runtimeChecksRequired: ["current factory preflight", "release readiness"] },
    })))
    .filter((pair) => {
      if (onlyLaunchable && !pair.launchable) return false;
      if (category && pair.category !== category) return false;
      if (
        query &&
        !pair.symbol.toLowerCase().includes(query) &&
        !pair.name.toLowerCase().includes(query) &&
        !pair.address?.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });

  const result = paginate(
    pairs,
    url.searchParams.get("cursor"),
    limit
  );

  return apiOk(result, {
    cacheSeconds: 60,
    staleSeconds: 300,
    meta: {
      chainId: universe.chainId,
      blockNumber: universe.blockNumber,
      blockHash: universe.blockHash,
      important:
        "A pair being listed is not the same as runtime graduation readiness. Clients should use launch preview/preflight before signing.",
    },
  });
}
