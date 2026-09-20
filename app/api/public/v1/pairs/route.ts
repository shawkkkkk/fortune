import { assets } from "@/data/assets";
import {
  apiOk,
  paginate,
  parseLimit,
} from "@/lib/public-api";

export const revalidate = 60;

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

      const launchable =
        exactAddress &&
        quoteEnabled &&
        graduationEnabled &&
        asset.verification !== "Unavailable";

      return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        address: asset.address || null,
        category: asset.category,
        verification: asset.verification,
        capabilities: {
          quote: quoteEnabled,
          reward: rewardEnabled,
          graduation: graduationEnabled,
        },
        launchable,
        preflight: {
          staticReady: launchable,
          reasonCodes,
          runtimeChecksRequired: [
            "oracle freshness",
            "token transfer compatibility",
            "graduation-adapter readiness",
          ],
        },
      };
    })
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
      chainId: 56,
      important:
        "A pair being listed is not the same as runtime graduation readiness. Clients should use launch preview/preflight before signing.",
    },
  });
}
