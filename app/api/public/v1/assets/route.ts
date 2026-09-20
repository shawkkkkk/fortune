import { assets } from "@/data/assets";
import {
  apiOk,
  paginate,
  parseLimit,
} from "@/lib/public-api";

export const revalidate = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const category = url.searchParams.get("category");
  const capability = url.searchParams.get("capability");
  const launchable =
    url.searchParams.get("launchable") === "true";
  const limit = parseLimit(
    url.searchParams.get("limit"),
    25,
    100
  );

  const rows = assets
    .map((asset) => {
      const isLaunchable =
        asset.chain === "BSC" &&
        Boolean(asset.address) &&
        asset.capabilities.includes("quote") &&
        asset.verification !== "Unavailable";

      const reasons: string[] = [];
      if (asset.chain !== "BSC") reasons.push("WRONG_CHAIN");
      if (!asset.address) reasons.push("NO_VERIFIED_BSC_ADDRESS");
      if (!asset.capabilities.includes("quote")) {
        reasons.push("QUOTE_CAPABILITY_DISABLED");
      }
      if (asset.verification === "Unavailable") {
        reasons.push("ASSET_UNAVAILABLE");
      }

      return {
        ...asset,
        launchable: isLaunchable,
        launchabilityReasons: reasons,
      };
    })
    .filter((asset) => {
      if (
        query &&
        !asset.symbol.toLowerCase().includes(query) &&
        !asset.name.toLowerCase().includes(query) &&
        !asset.address?.toLowerCase().includes(query)
      ) {
        return false;
      }

      if (category && asset.category !== category) return false;

      if (
        capability &&
        !asset.capabilities.includes(
          capability as "quote" | "reward" | "graduation"
        )
      ) {
        return false;
      }

      if (launchable && !asset.launchable) return false;
      return true;
    });

  const result = paginate(
    rows,
    url.searchParams.get("cursor"),
    limit
  );

  return apiOk(result, {
    cacheSeconds: 300,
    staleSeconds: 1800,
    meta: {
      chainId: 56,
      note:
        "Discovery and Fortune capability approval are separate. launchable=true requires an exact BSC address plus quote capability.",
    },
  });
}
