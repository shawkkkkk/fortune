import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "mainnet-release.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));

const deployGates = [
  "independentSmartContractAudit",
  "economicCurveSimulation",
  "mevCrossReserveReview",
  "oracleAssetPolicyReview",
  "graduationAdapterAudit",
  "automationVaultAudit",
  "governanceMultisig",
  "deploymentKeyControls",
  "legalComplianceReview",
];

const activationGates = [
  ...deployGates,
  "productionRpcRedundancy",
  "monitoringAlerts",
  "incidentRunbook",
  "reproduciblePausedDeployment",
  "reproducibleIndexerAnalytics",
  "productionCanaryDrill",
];

const expectedGates = new Set(activationGates);
const errors = [];

function validEvidenceReference(value) {
  const evidence = String(value || "").trim();
  return (
    /^https:\/\/\S+$/i.test(evidence) ||
    /^github-actions:\d+$/.test(evidence) ||
    /^bsc:(?:0x)?[a-fA-F0-9]{40,64}$/.test(evidence) ||
    /^sha256:[a-fA-F0-9]{64}$/.test(evidence)
  );
}

if (manifest.version !== 1) errors.push("version must be 1");
if (manifest.chainId !== 56) errors.push("chainId must be 56");
if (manifest.release !== "fortune-bsc-mainnet-v1") {
  errors.push("unexpected release identifier");
}
if (!["blocked", "ready"].includes(manifest.status)) {
  errors.push("status must be blocked or ready");
}
if (manifest.scope?.standardLaunches !== true) {
  errors.push("mainnet v1 must enable standard launches");
}
if (manifest.scope?.taxTokenLaunches !== false) {
  errors.push("mainnet v1 must keep tax-token launches disabled");
}
if (
  !Number.isInteger(manifest.scope?.maximumInitialRegistryAssets) ||
  manifest.scope.maximumInitialRegistryAssets !== 1
) {
  errors.push("mainnet v1 maximumInitialRegistryAssets must be exactly 1");
}
if (manifest.scope?.restrictedRwaAssetsEnabled !== false) {
  errors.push("restricted RWA assets must remain disabled for mainnet v1");
}

for (const id of expectedGates) {
  const gate = manifest.gates?.[id];
  if (!gate || typeof gate.passed !== "boolean" || typeof gate.evidence !== "string") {
    errors.push(`invalid or missing gate: ${id}`);
    continue;
  }
  if (gate.passed && !validEvidenceReference(gate.evidence)) {
    errors.push(
      `gate ${id} is marked passed but evidence is not a reproducible reference`
    );
  }
}

for (const id of Object.keys(manifest.gates || {})) {
  if (!expectedGates.has(id)) errors.push(`unknown gate: ${id}`);
}

if (errors.length) {
  console.error("Invalid Fortune mainnet release manifest:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

const complete = (id) =>
  manifest.gates[id].passed === true &&
  validEvidenceReference(manifest.gates[id].evidence);

const reviewedCommitOk = /^[a-fA-F0-9]{40}$/.test(manifest.reviewedCommit || "");
const deployMissing = deployGates.filter((id) => !complete(id));
const activationMissing = activationGates.filter((id) => !complete(id));

const deployReady = reviewedCommitOk && deployMissing.length === 0;
const activationReady =
  deployReady &&
  manifest.status === "ready" &&
  activationMissing.length === 0;

const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg?.split("=")[1] || "check";

console.log(`Fortune mainnet manifest: ${manifest.status}`);
console.log(`Reviewed commit: ${reviewedCommitOk ? manifest.reviewedCommit : "NOT SET"}`);
console.log(`Deploy ready: ${deployReady}`);
console.log(`Activation ready: ${activationReady}`);

if (deployMissing.length) {
  console.log("Missing deploy gates: " + deployMissing.join(", "));
}
if (activationMissing.length) {
  console.log("Missing activation gates: " + activationMissing.join(", "));
}

if (phase === "deploy" && !deployReady) process.exit(2);
if (phase === "activate" && !activationReady) process.exit(3);
if (!["check", "deploy", "activate"].includes(phase)) {
  console.error("Unknown phase. Use check, deploy, or activate.");
  process.exit(4);
}
