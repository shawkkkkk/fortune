import fs from "node:fs";
import path from "node:path";

const manifest = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "mainnet-dependencies.json"),
    "utf8"
  )
);

if (!Array.isArray(manifest.assets) || manifest.assets.length !== 1) {
  console.error("Mainnet v1 requires exactly one pinned production asset.");
  process.exit(1);
}

const lines = [
  `PANCAKE_V3_FACTORY=${manifest.pancakeV3.factory}`,
  `PANCAKE_V3_POSITION_MANAGER=${manifest.pancakeV3.nonfungiblePositionManager}`,
  `PRODUCTION_ASSET_COUNT=${manifest.assets.length}`,
];

for (const [index, asset] of manifest.assets.entries()) {
  lines.push(`PRODUCTION_ASSET_${index}=${asset.address}`);
  lines.push(`PRODUCTION_FEED_${index}=${asset.feed}`);
  lines.push(`PRODUCTION_MAX_AGE_${index}=${asset.maxOracleAge}`);
  lines.push(`PRODUCTION_QUOTE_ENABLED_${index}=${asset.quoteEnabled}`);
  lines.push(`PRODUCTION_REWARD_ENABLED_${index}=${asset.rewardEnabled}`);
  lines.push(`PRODUCTION_GRADUATION_ENABLED_${index}=${asset.graduationEnabled}`);
  lines.push(`PRODUCTION_CATEGORY_${index}=${asset.category}`);
}

process.stdout.write(lines.join("\n") + "\n");
