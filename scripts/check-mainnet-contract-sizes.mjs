import { execFileSync } from "node:child_process";

const MAX_RUNTIME_BYTES = 24_000;
const contracts = [
  "FortuneFactory",
  "FortuneCurve",
  "FortunePancakeV3GraduationAdapter",
  "FortuneTokenDeployer",
  "FortuneVaultDeployer",
  "FortuneFeeRouterDeployer",
  "FortuneCurveDeployer",
];

function deployedBytes(contractName) {
  const hex = execFileSync(
    "forge",
    ["inspect", contractName, "deployedBytecode"],
    { cwd: "contracts", encoding: "utf8" }
  ).trim();

  if (!/^0x[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Unexpected deployed bytecode output for " + contractName);
  }
  return (hex.length - 2) / 2;
}

let failed = false;
for (const contractName of contracts) {
  const bytes = deployedBytes(contractName);
  const margin = MAX_RUNTIME_BYTES - bytes;
  console.log(
    contractName + ": " + bytes + " runtime bytes; " + margin +
    " bytes remaining to Fortune's " + MAX_RUNTIME_BYTES + "-byte release ceiling"
  );
  if (bytes > MAX_RUNTIME_BYTES) {
    failed = true;
    console.error(contractName + " exceeds Fortune's mainnet runtime headroom ceiling.");
  }
}

if (failed) process.exit(1);
