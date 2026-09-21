import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "mainnet-dependencies.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];

if (manifest.version !== 1) errors.push("version must be 1");
if (manifest.chainId !== 56) errors.push("chainId must be 56");
if (!/^0x[a-fA-F0-9]{40}$/.test(manifest.pancakeV3?.factory || "")) {
  errors.push("invalid Pancake V3 factory");
}
if (
  !/^0x[a-fA-F0-9]{40}$/.test(
    manifest.pancakeV3?.nonfungiblePositionManager || ""
  )
) {
  errors.push("invalid Pancake V3 position manager");
}
if (!/^https:\/\/developer\.pancakeswap\.finance\//.test(
  manifest.pancakeV3?.source || ""
)) {
  errors.push("Pancake source must be the official developer docs");
}
if (!Array.isArray(manifest.assets)) errors.push("assets must be an array");
const releaseManifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "mainnet-release.json"), "utf8")
);
const maxAssets = releaseManifest.scope?.maximumInitialRegistryAssets;
if (!Number.isInteger(maxAssets) || maxAssets < 1 || maxAssets > 5) {
  errors.push("mainnet release manifest has invalid maximumInitialRegistryAssets");
}
if (manifest.assets.length > maxAssets) {
  errors.push(`mainnet v1 supports at most ${maxAssets} initial asset(s)`);
}

for (const [index, asset] of manifest.assets.entries()) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(asset.address || "")) {
    errors.push(`asset[${index}] has invalid address`);
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(asset.feed || "")) {
    errors.push(`asset[${index}] has invalid feed`);
  }
  if (!asset.symbol || typeof asset.symbol !== "string") {
    errors.push(`asset[${index}] is missing symbol`);
  }
  for (const key of ["quoteEnabled", "rewardEnabled", "graduationEnabled"]) {
    if (typeof asset[key] !== "boolean") {
      errors.push(`asset[${index}] has invalid ${key}`);
    }
  }
  if (!asset.category || typeof asset.category !== "string") {
    errors.push(`asset[${index}] is missing category`);
  }
  if (asset.restricted !== false) {
    errors.push(`asset[${index}] must not be restricted for mainnet v1`);
  }
  for (const key of [
    "tokenSource",
    "feedSource",
    "feedAddressVerificationSource",
  ]) {
    if (!asset[key] || typeof asset[key] !== "string") {
      errors.push(`asset[${index}] is missing ${key}`);
    }
  }
  if (!Number.isInteger(asset.maxOracleAge) || asset.maxOracleAge < 60) {
    errors.push(`asset[${index}] has invalid maxOracleAge`);
  }
}

if (errors.length) {
  console.error("Invalid Fortune mainnet dependency manifest:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

if (process.argv.includes("--require-assets") && manifest.assets.length < 1) {
  console.error("No production assets have been pinned yet.");
  process.exit(2);
}

if (process.argv.includes("--check-env")) {
  const expectedFactory = manifest.pancakeV3.factory.toLowerCase();
  const expectedManager =
    manifest.pancakeV3.nonfungiblePositionManager.toLowerCase();

  if ((process.env.PANCAKE_V3_FACTORY || "").toLowerCase() !== expectedFactory) {
    console.error("PANCAKE_V3_FACTORY does not match the pinned BSC mainnet dependency.");
    process.exit(3);
  }

  if (
    (process.env.PANCAKE_V3_POSITION_MANAGER || "").toLowerCase() !==
    expectedManager
  ) {
    console.error(
      "PANCAKE_V3_POSITION_MANAGER does not match the pinned BSC mainnet dependency."
    );
    process.exit(4);
  }
}

console.log("Fortune mainnet dependency manifest is valid.");
console.log(
  `Pinned Pancake V3 factory: ${manifest.pancakeV3.factory}`
);
console.log(
  `Pinned Pancake position manager: ${manifest.pancakeV3.nonfungiblePositionManager}`
);
console.log(`Pinned production assets: ${manifest.assets.length}`);
