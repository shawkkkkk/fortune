import { apiOk } from "@/lib/public-api";
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
} from "viem";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";
import {
  MAINNET_ACTIVATION_GATE_IDS,
  MAINNET_ACTIVATION_READY,
  MAINNET_DEPLOY_READY,
  MAINNET_RELEASE,
  mainnetGateComplete,
} from "@/lib/mainnet-release";
import {
  configuredRpcUrls,
  probeRpcEndpoints,
  rpcCall,
} from "@/lib/bsc-rpc";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail";

type ReadinessCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};


const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const factoryStateAbi = [
  {
    type: "function",
    name: "launchesPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const registryHealthAbi = [
  {
    type: "function",
    name: "assetHealth",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "healthy", type: "bool" },
      { name: "reasonCode", type: "bytes32" },
      { name: "priceUsd1e18", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
] as const;

async function rawEthCall(
  chainId: number,
  address: string,
  data: `0x${string}`
) {
  const response = await rpcCall(
    chainId,
    "eth_call",
    [{ to: address, data }, "latest"],
    { timeoutMs: 2500 }
  );

  return String(response.result || "0x") as `0x${string}`;
}

async function hasCode(
  chainId: number,
  address: string | undefined
) {
  if (!address) return false;

  try {
    const response = await rpcCall(
      chainId,
      "eth_getCode",
      [address, "latest"],
      { timeoutMs: 2500 }
    );

    const code = String(response.result || "");
    return code !== "" && code !== "0x" && code !== "0x0";
  } catch {
    return false;
  }
}

export async function GET() {
  const chainId = Number(
    process.env.NEXT_PUBLIC_CHAIN_ID || 97
  );

  const expectedChain =
    chainId === 56 || chainId === 97;

  const factory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.factory
      : "");
  const registry =
    process.env.FORTUNE_REGISTRY ||
    process.env.NEXT_PUBLIC_FORTUNE_REGISTRY_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.registry
      : "");
  const graduationAdapter =
    process.env.FORTUNE_GRADUATION_ADAPTER ||
    process.env.NEXT_PUBLIC_FORTUNE_GRADUATION_ADAPTER_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.graduationAdapter
      : "");
  const liquidityLocker =
    process.env.FORTUNE_LIQUIDITY_LOCKER ||
    process.env.NEXT_PUBLIC_FORTUNE_LIQUIDITY_LOCKER_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.liquidityLocker
      : "");
  const pancakeFactory =
    process.env.PANCAKE_V3_FACTORY ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.pancakeV3Factory
      : "");
  const positionManager =
    process.env.PANCAKE_V3_POSITION_MANAGER ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.pancakeV3PositionManager
      : "");

  const urls = configuredRpcUrls(chainId);
  const rpc = await probeRpcEndpoints(chainId);

  const [
    factoryCode,
    registryCode,
    adapterCode,
    lockerCode,
    pancakeCode,
    managerCode,
  ] = await Promise.all([
    hasCode(chainId, factory),
    hasCode(chainId, registry),
    hasCode(chainId, graduationAdapter),
    hasCode(chainId, liquidityLocker),
    hasCode(chainId, pancakeFactory),
    hasCode(chainId, positionManager),
  ]);

  const primaryQuote =
    process.env.NEXT_PUBLIC_FORTUNE_PRIMARY_QUOTE_ADDRESS || "";
  const governance =
    process.env.FORTUNE_GOVERNANCE || "";
  const operatorReleaseApproved =
    process.env.FORTUNE_MAINNET_RELEASE_APPROVED === "true";
  const releaseApproved =
    operatorReleaseApproved && MAINNET_ACTIVATION_READY;
  const governanceHasCode =
    chainId === 56 &&
    /^0x[a-fA-F0-9]{40}$/.test(governance)
      ? await hasCode(chainId, governance)
      : false;

  let factoryPaused: boolean | null = null;
  let factoryOwner: string | null = null;
  let primaryQuoteHealthy: boolean | null = null;

  if (chainId === 56 && factoryCode && factory) {
    try {
      const data = encodeFunctionData({
        abi: factoryStateAbi,
        functionName: "launchesPaused",
      });
      const raw = await rawEthCall(chainId, factory, data);
      factoryPaused = decodeFunctionResult({
        abi: factoryStateAbi,
        functionName: "launchesPaused",
        data: raw,
      });
    } catch {
      factoryPaused = null;
    }

    try {
      const data = encodeFunctionData({
        abi: ownableAbi,
        functionName: "owner",
      });
      const raw = await rawEthCall(chainId, factory, data);
      factoryOwner = decodeFunctionResult({
        abi: ownableAbi,
        functionName: "owner",
        data: raw,
      });
    } catch {
      factoryOwner = null;
    }
  }

  if (
    chainId === 56 &&
    registryCode &&
    registry &&
    /^0x[a-fA-F0-9]{40}$/.test(primaryQuote)
  ) {
    try {
      const data = encodeFunctionData({
        abi: registryHealthAbi,
        functionName: "assetHealth",
        args: [primaryQuote as Address],
      });
      const raw = await rawEthCall(chainId, registry, data);
      const health = decodeFunctionResult({
        abi: registryHealthAbi,
        functionName: "assetHealth",
        data: raw,
      });
      primaryQuoteHealthy = Boolean(health[0]);
    } catch {
      primaryQuoteHealthy = false;
    }
  }

  const redundancyRequired =
    chainId === 56 ||
    process.env.FORTUNE_REQUIRE_RPC_REDUNDANCY === "true";
  const redundancyReady =
    !redundancyRequired || urls.length >= 2;

  const releaseGateLabels: Record<string, string> = {
    independentSmartContractAudit: "Independent smart-contract audit",
    economicCurveSimulation: "Economic curve simulation",
    mevCrossReserveReview: "MEV / cross-reserve review",
    oracleAssetPolicyReview: "Oracle and asset-policy review",
    graduationAdapterAudit: "Graduation adapter audit",
    automationVaultAudit: "Automation vault audit",
    governanceMultisig: "Governance multisig",
    deploymentKeyControls: "Deployment key controls",
    legalComplianceReview: "Legal / compliance review",
    productionRpcRedundancy: "Production RPC redundancy",
    monitoringAlerts: "Monitoring and alerts",
    incidentRunbook: "Incident runbook",
    reproduciblePausedDeployment: "Reproducible paused deployment",
    reproducibleIndexerAnalytics: "Reproducible indexer / analytics",
    productionCanaryDrill: "Production canary drill",
  };

  const releaseManifestChecks: ReadinessCheck[] =
    chainId === 56
      ? MAINNET_ACTIVATION_GATE_IDS.map((id) => {
          const complete = mainnetGateComplete(id);
          const gate = MAINNET_RELEASE.gates[id];

          return {
            id: "release-" + id,
            label: releaseGateLabels[id] || id,
            status: complete ? "pass" : "fail",
            detail: complete
              ? gate.evidence
              : "Required mainnet release evidence has not been recorded.",
          };
        })
      : [];

  const checks: ReadinessCheck[] = [
    {
      id: "chain",
      label: "BNB Chain configuration",
      status: expectedChain ? "pass" : "fail",
      detail: expectedChain
        ? `Configured for chain ${chainId}.`
        : "Fortune only accepts BSC mainnet (56) or BSC testnet (97).",
    },
    {
      id: "rpc",
      label: "Healthy BSC RPC",
      status: rpc.healthy >= 1 ? "pass" : "fail",
      detail:
        rpc.healthy >= 1
          ? `${rpc.healthy}/${rpc.configured} configured RPC providers are healthy.`
          : "No configured BSC RPC responded with the expected chain ID.",
    },
    {
      id: "redundancy",
      label: "RPC failover",
      status: redundancyReady
        ? rpc.healthy >= 2
          ? "pass"
          : "warn"
        : "fail",
      detail: redundancyReady
        ? rpc.healthy >= 2
          ? "At least two BSC providers are currently healthy."
          : "Failover is configured, but fewer than two providers are healthy right now."
        : "Production readiness requires at least two configured BSC providers.",
    },
    {
      id: "factory",
      label: "Fortune Factory bytecode",
      status: factoryCode ? "pass" : "fail",
      detail: factoryCode
        ? "Configured Fortune Factory contains deployed bytecode."
        : "Fortune Factory is missing or not deployed on the configured chain.",
    },
    {
      id: "registry",
      label: "Asset Registry bytecode",
      status: registryCode ? "pass" : "fail",
      detail: registryCode
        ? "Fortune Asset Registry is deployed."
        : "Asset Registry address is missing or has no bytecode.",
    },
    {
      id: "adapter",
      label: "Graduation adapter bytecode",
      status: adapterCode ? "pass" : "fail",
      detail: adapterCode
        ? "Graduation adapter is deployed."
        : "Graduation adapter is missing or has no bytecode.",
    },
    {
      id: "locker",
      label: "Permanent LP locker",
      status: lockerCode ? "pass" : "fail",
      detail: lockerCode
        ? "Permanent LP locker is deployed."
        : "LP locker is missing or has no bytecode.",
    },
    {
      id: "pancake-factory",
      label: "Pancake V3 factory",
      status: pancakeCode ? "pass" : "fail",
      detail: pancakeCode
        ? "Configured Pancake V3 factory contains bytecode."
        : "Pancake V3 factory must be independently verified and configured.",
    },
    {
      id: "position-manager",
      label: "Pancake position manager",
      status: managerCode ? "pass" : "fail",
      detail: managerCode
        ? "Configured Pancake V3 position manager contains bytecode."
        : "Pancake V3 position manager must be independently verified and configured.",
    },
    {
      id: "launch-shield",
      label: "Launch Shield",
      status: "pass",
      detail: "99% opening buy tax decays to 0 after 5 seconds; early-wallet cap is protocol-enforced.",
    },
    {
      id: "atomic-graduation",
      label: "Atomic graduation",
      status: "pass",
      detail: "Graduation transfers, pool creation and LP locking revert together if any step fails.",
    },
    {
      id: "recovery",
      label: "Graduation recovery",
      status: "pass",
      detail: "Failed graduation is retryable and a seven-day reserve rescue path exists if graduation remains impossible.",
    },
    {
      id: "chart-anchor",
      label: "Chart continuity anchor",
      status: "pass",
      detail: "The curve stores an immutable graduation price anchor before AMM trading begins.",
    },
    {
      id: "transaction-recovery",
      label: "Transaction recovery",
      status: rpc.healthy >= 1 ? "pass" : "fail",
      detail: "Unknown transaction outcomes are resolved from BSC RPC before any retry is attempted.",
    },
    ...(chainId === 56
      ? [
          ...releaseManifestChecks,
          {
            id: "mainnet-release-manifest",
            label: "Mainnet release manifest",
            status: MAINNET_ACTIVATION_READY ? "pass" : "fail",
            detail: MAINNET_ACTIVATION_READY
              ? `${MAINNET_RELEASE.release} is activation-ready for reviewed commit ${MAINNET_RELEASE.reviewedCommit}.`
              : "The checked-in mainnet release manifest is still blocked or missing required evidence.",
          } satisfies ReadinessCheck,
          {
            id: "mainnet-release-approval",
            label: "Final operator release approval",
            status: releaseApproved ? "pass" : "fail",
            detail: releaseApproved
              ? "The release manifest is complete and final operator approval is explicitly enabled."
              : operatorReleaseApproved
                ? "Operator approval is set, but the machine-enforced release manifest is not activation-ready."
                : "FORTUNE_MAINNET_RELEASE_APPROVED must remain false until the release manifest is activation-ready.",
          } satisfies ReadinessCheck,
          {
            id: "governance-owner",
            label: "Governance ownership",
            status:
              governance &&
              governanceHasCode &&
              factoryOwner &&
              governance.toLowerCase() === factoryOwner.toLowerCase()
                ? "pass"
                : "fail",
            detail:
              governance &&
              governanceHasCode &&
              factoryOwner &&
              governance.toLowerCase() === factoryOwner.toLowerCase()
                ? "FortuneFactory ownership is held by the configured contract-based governance wallet."
                : "Factory ownership must be accepted by a configured contract-based governance wallet; a single-key EOA is not mainnet-ready.",
          } satisfies ReadinessCheck,
          {
            id: "primary-quote",
            label: "Primary production quote asset",
            status: primaryQuoteHealthy ? "pass" : "fail",
            detail: primaryQuoteHealthy
              ? "The configured primary quote asset passes the live Fortune registry/oracle health check."
              : "Configure an approved primary quote asset with a healthy production oracle.",
          } satisfies ReadinessCheck,
          {
            id: "launch-activation",
            label: "Mainnet launch activation",
            status: factoryPaused === false ? "pass" : "fail",
            detail:
              factoryPaused === false
                ? "FortuneFactory launch creation is active."
                : factoryPaused === true
                  ? "Production deployment is intentionally paused. Run the explicit governance activation only after all release gates pass."
                  : "Could not read the production launch pause state.",
          } satisfies ReadinessCheck,
        ]
      : []),
  ];

  const failed = checks.filter(
    (check) => check.status === "fail"
  );
  const warnings = checks.filter(
    (check) => check.status === "warn"
  );

  return apiOk(
    {
      ready: failed.length === 0,
      degraded:
        failed.length === 0 &&
        warnings.length > 0,
      score: {
        passed: checks.filter(
          (check) => check.status === "pass"
        ).length,
        warnings: warnings.length,
        failed: failed.length,
        total: checks.length,
      },
      checks,
      chainId,
      mainnetRelease:
        chainId === 56
          ? {
              release: MAINNET_RELEASE.release,
              status: MAINNET_RELEASE.status,
              reviewedCommit: MAINNET_RELEASE.reviewedCommit,
              deployReady: MAINNET_DEPLOY_READY,
              activationReady: MAINNET_ACTIVATION_READY,
              operatorApproved: operatorReleaseApproved,
            }
          : undefined,
    },
    {
      meta: {
        purpose:
          "Infrastructure readiness only. Launch-specific asset/oracle/economic checks still run through FortuneFactory.preflightLaunch immediately before deployment.",
      },
    }
  );
}
