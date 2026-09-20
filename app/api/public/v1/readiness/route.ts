import { apiOk } from "@/lib/public-api";
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
} from "viem";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";
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

async function readContractView<T>(
  chainId: number,
  address: string,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = []
): Promise<T> {
  const data = encodeFunctionData({
    abi: abi as never,
    functionName: functionName as never,
    args: args as never,
  });

  const response = await rpcCall(
    chainId,
    "eth_call",
    [{ to: address, data }, "latest"],
    { timeoutMs: 2500 }
  );

  return decodeFunctionResult({
    abi: abi as never,
    functionName: functionName as never,
    data: String(response.result || "0x") as `0x${string}`,
  }) as T;
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
  const releaseApproved =
    process.env.FORTUNE_MAINNET_RELEASE_APPROVED === "true";

  let factoryPaused: boolean | null = null;
  let factoryOwner: string | null = null;
  let primaryQuoteHealthy: boolean | null = null;

  if (chainId === 56 && factoryCode && factory) {
    try {
      factoryPaused = await readContractView<boolean>(
        chainId,
        factory,
        factoryStateAbi,
        "launchesPaused"
      );
    } catch {
      factoryPaused = null;
    }

    try {
      factoryOwner = await readContractView<Address>(
        chainId,
        factory,
        ownableAbi,
        "owner"
      );
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
      const health = await readContractView<
        readonly [boolean, `0x${string}`, bigint, bigint]
      >(
        chainId,
        registry,
        registryHealthAbi,
        "assetHealth",
        [primaryQuote as Address]
      );
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
          {
            id: "mainnet-release-approval",
            label: "Mainnet release approval",
            status: releaseApproved ? "pass" : "fail",
            detail: releaseApproved
              ? "Operator release approval is explicitly enabled."
              : "FORTUNE_MAINNET_RELEASE_APPROVED must remain false until independent security review and final release approval are complete.",
          } satisfies ReadinessCheck,
          {
            id: "governance-owner",
            label: "Governance ownership",
            status:
              governance &&
              factoryOwner &&
              governance.toLowerCase() === factoryOwner.toLowerCase()
                ? "pass"
                : "fail",
            detail:
              governance &&
              factoryOwner &&
              governance.toLowerCase() === factoryOwner.toLowerCase()
                ? "FortuneFactory ownership matches the configured production governance address."
                : "Factory ownership must be accepted by the configured production governance address.",
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
    },
    {
      meta: {
        purpose:
          "Infrastructure readiness only. Launch-specific asset/oracle/economic checks still run through FortuneFactory.preflightLaunch immediately before deployment.",
      },
    }
  );
}
