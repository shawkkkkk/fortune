import releaseManifest from "@/mainnet-release.json";

export const MAINNET_DEPLOY_GATE_IDS = [
  "independentSmartContractAudit",
  "economicCurveSimulation",
  "mevCrossReserveReview",
  "oracleAssetPolicyReview",
  "graduationAdapterAudit",
  "automationVaultAudit",
  "governanceMultisig",
  "deploymentKeyControls",
  "legalComplianceReview",
] as const;

export const MAINNET_ACTIVATION_GATE_IDS = [
  ...MAINNET_DEPLOY_GATE_IDS,
  "productionRpcRedundancy",
  "monitoringAlerts",
  "incidentRunbook",
  "reproduciblePausedDeployment",
  "reproducibleIndexerAnalytics",
  "productionCanaryDrill",
] as const;

type GateId = keyof typeof releaseManifest.gates;

function gateComplete(id: GateId) {
  const gate = releaseManifest.gates[id];
  return gate.passed === true && gate.evidence.trim().length > 0;
}

export const MAINNET_RELEASE = releaseManifest;

export const MAINNET_DEPLOY_READY =
  releaseManifest.version === 1 &&
  releaseManifest.chainId === 56 &&
  /^([a-fA-F0-9]{40})$/.test(releaseManifest.reviewedCommit) &&
  MAINNET_DEPLOY_GATE_IDS.every((id) => gateComplete(id));

export const MAINNET_ACTIVATION_READY =
  MAINNET_DEPLOY_READY &&
  releaseManifest.status === "ready" &&
  MAINNET_ACTIVATION_GATE_IDS.every((id) => gateComplete(id));

export function mainnetGateComplete(id: GateId) {
  return gateComplete(id);
}
