import { apiOk } from "@/lib/public-api";
import { MAINNET_RELEASE, MAINNET_DEPLOY_READY, MAINNET_ACTIVATION_READY, MAINNET_ACTIVATION_GATE_IDS, mainnetGateComplete } from "@/lib/mainnet-release";

export const revalidate = 60;

export async function GET() {
  return apiOk({
    standard: {
      chainId: MAINNET_RELEASE.chainId,
      release: MAINNET_RELEASE.release,
      status: MAINNET_RELEASE.status,
      reviewedCommit: MAINNET_RELEASE.reviewedCommit,
      deployReady: MAINNET_DEPLOY_READY,
      activationReady: MAINNET_ACTIVATION_READY,
      gates: MAINNET_ACTIVATION_GATE_IDS.map((id) => ({ id, passed: mainnetGateComplete(id), evidence: MAINNET_RELEASE.gates[id].evidence || null })),
    },
    burnRewardsV2: {
      status: "research",
      deployment: null,
      mainnetEnabled: false,
      releaseGate: "independent hook and reward-accounting review required",
    },
  }, { cacheSeconds: 60, staleSeconds: 300, meta: { dataMode: "versioned_release_manifest", source: "mainnet-release.json; separate v2 research workspace" } });
}
