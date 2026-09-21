import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const tracked = [
  "mainnet-release.json",
  "mainnet-dependencies.json",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "lib/fortune-network.ts",
  "lib/mainnet-release.ts",
  "lib/bsc-rpc.ts",
  "app/api/public/v1/readiness/route.ts",
  "contracts/script/DeployProduction.s.sol",
  "contracts/script/ActivateProduction.s.sol",
  "contracts/script/PrepareGovernanceAcceptance.s.sol",
  "scripts/export-mainnet-deployment.mjs",
];

const contractFiles = execFileSync("git", [
  "ls-files",
  "contracts/src",
  "contracts/test",
], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const files = [...new Set([...tracked, ...contractFiles])].sort();
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();

const entries = files.map((file) => {
  const bytes = readFileSync(file);
  return {
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

const aggregate = createHash("sha256");
for (const entry of entries) {
  aggregate.update(entry.file);
  aggregate.update("\0");
  aggregate.update(entry.sha256);
  aggregate.update("\n");
}

const output = {
  schemaVersion: 1,
  release: "fortune-bsc-mainnet-v1",
  sourceCommit: head,
  sourceTree: tree,
  aggregateSha256: aggregate.digest("hex"),
  files: entries,
};

const destination =
  process.env.FORTUNE_MAINNET_FINGERPRINT ||
  "/tmp/fortune-mainnet-candidate-fingerprint.json";

writeFileSync(destination, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({
  sourceCommit: output.sourceCommit,
  sourceTree: output.sourceTree,
  aggregateSha256: output.aggregateSha256,
  fileCount: output.files.length,
  output: destination,
}, null, 2));
