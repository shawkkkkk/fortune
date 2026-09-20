import { assets } from "@/data/assets";
import { apiOk } from "@/lib/public-api";

export const revalidate = 3600;

export async function GET() {
  const rows = assets
    .filter(
      (asset) =>
        asset.chain === "BSC" &&
        Boolean(asset.address)
    )
    .map((asset) => ({
      address: asset.address,
      symbol: asset.symbol,
      name: asset.name,
      category: asset.category,
      verification: asset.verification,
    }));

  return apiOk(rows, {
    cacheSeconds: 3600,
    staleSeconds: 86400,
    meta: {
      purpose:
        "cheap identity-only index for explorers, aggregators and integrations",
      marketDataIncluded: false,
    },
  });
}
