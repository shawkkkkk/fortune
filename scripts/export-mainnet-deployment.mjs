import fs from "node:fs";
import path from "node:path";

const source = path.resolve(
  process.cwd(),
  process.argv[2] ||
    "contracts/broadcast/DeployProduction.s.sol/56/run-latest.json"
);
const destination =
  process.env.FORTUNE_MAINNET_DEPLOYMENT_MANIFEST ||
  "/tmp/fortune-mainnet-deployment-addresses.json";

const broadcast = JSON.parse(fs.readFileSync(source, "utf8"));
const required = [
  "FortuneChainlinkOracle",
  "FortuneAssetRegistry",
  "FortuneAutomationRegistry",
  "FortuneMetadataRegistry",
  "FortuneTokenDeployer",
  "FortuneVaultDeployer",
  "FortuneFeeRouterDeployer",
  "FortuneCurveDeployer",
  "FortuneFactory",
  "FortunePermanentLiquidityLocker",
  "FortunePancakeV3GraduationAdapter",
];

const contracts = {};
for (const tx of broadcast.transactions || []) {
  const name = tx.contractName;
  const address = tx.contractAddress;
  if (
    required.includes(name) &&
    /^0x[a-fA-F0-9]{40}$/.test(address || "")
  ) {
    contracts[name] = address;
  }
}

const missing = required.filter((name) => !contracts[name]);
if (missing.length) {
  console.error("Missing deployed contracts: " + missing.join(", "));
  process.exit(1);
}

const txHashes = (broadcast.transactions || [])
  .map((tx) => tx.hash || tx.transactionHash)
  .filter((hash) => /^0x[a-fA-F0-9]{64}$/.test(hash || ""));

const output = {
  schemaVersion: 1,
  release: "fortune-bsc-mainnet-v1",
  chainId: 56,
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA || null,
  contracts,
  transactionHashes: txHashes,
};

fs.writeFileSync(destination, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
