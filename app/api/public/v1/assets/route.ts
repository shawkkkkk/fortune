import {
  apiError,
  apiOk,
  parseLimit,
} from "@/lib/public-api";
import { readFortuneAssetUniverse } from "@/lib/onchain-assets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const category = (url.searchParams.get("category") || "")
    .trim()
    .toLowerCase();
  const capability = (url.searchParams.get("capability") || "")
    .trim()
    .toLowerCase();
  const launchableOnly =
    url.searchParams.get("launchable") === "true";
  const limit = parseLimit(
    url.searchParams.get("limit"),
    100,
    250
  );

  try {
    const result = await readFortuneAssetUniverse();

    if (!result.configured) {
      return apiError(
        "protocol_not_configured",
        "Fortune Asset Registry is not configured for the active deployment.",
        503,
        { chainId: result.chainId }
      );
    }

    const assets = result.assets
      .filter((asset) => {
        if (
          query &&
          !asset.symbol.toLowerCase().includes(query) &&
          !asset.name.toLowerCase().includes(query) &&
          !asset.address.toLowerCase().includes(query)
        ) {
          return false;
        }

        if (
          category &&
          asset.category.toLowerCase() !== category
        ) {
          return false;
        }

        if (
          capability === "quote" &&
          !asset.quoteEnabled
        ) {
          return false;
        }
        if (
          capability === "reward" &&
          !asset.rewardEnabled
        ) {
          return false;
        }
        if (
          capability === "graduation" &&
          !asset.graduationEnabled
        ) {
          return false;
        }

        if (
          launchableOnly &&
          !asset.launchable
        ) {
          return false;
        }

        return true;
      })
      .slice(0, limit);

    return apiOk(
      {
        items: assets,
        totalRegistered: result.assets.length,
        returned: assets.length,
        chainId: result.chainId,
      },
      {
        cacheSeconds: 8,
        staleSeconds: 20,
        meta: {
          dataMode: "onchain_registry",
          source:
            "FortuneAssetRegistry + live oracle health + ERC-20 metadata",
          note:
            "Fortune exposes the broad discovery universe separately, while this endpoint is the authoritative list of assets that governance has actually admitted to the active onchain registry.",
        },
      }
    );
  } catch (error) {
    return apiError(
      "dependency_unavailable",
      "Fortune could not read the active onchain asset universe.",
      503,

    );
  }
}
