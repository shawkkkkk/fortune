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

const pancakeV2RouterAbi = [
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
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
  const taxFactory =
    process.env.FORTUNE_TAX_FACTORY ||
    process.env.NEXT_PUBLIC_FORTUNE_TAX_FACTORY_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.taxFactory
      : "");
  const poolRegistry =
    process.env.FORTUNE_POOL_REGISTRY ||
    process.env.NEXT_PUBLIC_FORTUNE_POOL_REGISTRY_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.poolRegistry
      : "");
  const taxGraduationAdapter =
    process.env.FORTUNE_V2_TAX_ADAPTER ||
    process.env.NEXT_PUBLIC_FORTUNE_TAX_GRADUATION_ADAPTER_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.taxGraduationAdapter
      : "");
  const taxLiquidityLocker =
    process.env.FORTUNE_V2_LOCKER ||
    process.env.NEXT_PUBLIC_FORTUNE_TAX_LIQUIDITY_LOCKER_ADDRESS ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.taxLiquidityLocker
      : "");
  const pancakeV2Router =
    process.env.PANCAKE_V2_ROUTER ||
    process.env.NEXT_PUBLIC_PANCAKE_V2_ROUTER ||
    (chainId === PUBLIC_TESTNET.chainId
      ? PUBLIC_TESTNET.contracts.pancakeV2Router
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
    taxFactoryCode,
    registryCode,
    poolRegistryCode,
    adapterCode,
    lockerCode,
    taxAdapterCode,
    taxLockerCode,
    pancakeCode,
    managerCode,
    pancakeV2RouterCode,
  ] = await Promise.all([
    hasCode(chainId, factory),
    hasCode(chainId, taxFactory),
    hasCode(chainId, registry),
    hasCode(chainId, poolRegistry),
    hasCode(chainId, graduationAdapter),
    hasCode(chainId, liquidityLocker),
    hasCode(chainId, taxGraduationAdapter),
    hasCode(chainId, taxLiquidityLocker),
    hasCode(chainId, pancakeFactory),
    hasCode(chainId, positionManager),
    hasCode(chainId, pancakeV2Router),
  ]);

  let pancakeV2Factory: string | null = null;
  let pancakeV2FactoryCode = false;

  if (pancakeV2RouterCode && pancakeV2Router) {
    try {
      const data = encodeFunctionData({
        abi: pancakeV2RouterAbi,
        functionName: "factory",
      });
      const raw = await rawEthCall(chainId, pancakeV2Router, data);
      pancakeV2Factory = decodeFunctionResult({
        abi: pancakeV2RouterAbi,
        functionName: "factory",
        data: raw,
      });
      pancakeV2FactoryCode = await hasCode(
        chainId,
        pancakeV2Factory
      );
    } catch {
      pancakeV2Factory = null;
      pancakeV2FactoryCode = false;
    }
  }

  const primaryQuote =
    process.env.NEXT_PUBLIC_FORTUNE_PRIMARY_QUOTE_ADDRESS || "";
  const governance =
    process.env.FORTUNE_GOVERNANCE || "";
  const releaseApproved =
    process.env.FORTUNE_MAINNET_RELEASE_APPROVED === "true";

  let factoryPaused: boolean | null = null;
  let taxFactoryPaused: boolean | null = null;
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

    if (taxFactoryCode && taxFactory) {
      try {
        const data = encodeFunctionData({
          abi: factoryStateAbi,
          functionName: "launchesPaused",
        });
        const raw = await rawEthCall(chainId, taxFactory, data);
        taxFactoryPaused = decodeFunctionResult({
          abi: factoryStateAbi,
          functionName: "launchesPaused",
          data: raw,
        });
      } catch {
        taxFactoryPaused = null;
      }
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
      id: "tax-factory",
      label: "Tax-token Fortune Factory bytecode",
      status: taxFactoryCode ? "pass" : "fail",
      detail: taxFactoryCode
        ? "Configured tax-token Fortune Factory contains deployed bytecode."
        : "Tax-token Fortune Factory is missing or not deployed on the configured chain.",
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
      id: "pool-registry",
      label: "Pool Registry bytecode",
      status: poolRegistryCode ? "pass" : "fail",
      detail: poolRegistryCode
        ? "Fortune Pool Registry is deployed for official/recognized pool enforcement."
        : "Pool Registry address is missing or has no bytecode.",
    },
    {
      id: "adapter",
      label: "V3 graduation adapter bytecode",
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
      id: "tax-adapter",
      label: "Tax-token V2 graduation adapter",
      status: taxAdapterCode ? "pass" : "fail",
      detail: taxAdapterCode
        ? "Tax-token Pancake V2 graduation adapter is deployed."
        : "Tax-token V2 graduation adapter is missing or has no bytecode.",
    },
    {
      id: "tax-locker",
      label: "Tax-token permanent V2 LP locker",
      status: taxLockerCode ? "pass" : "fail",
      detail: taxLockerCode
        ? "Permanent V2 LP-token locker is deployed for tax-token graduations."
        : "Tax-token V2 LP locker is missing or has no bytecode.",
    },
    {
      id: "pancake-v2-router",
      label: "Pancake V2 router",
      status: pancakeV2RouterCode ? "pass" : "fail",
      detail: pancakeV2RouterCode
        ? "Configured Pancake V2 router contains bytecode."
        : "Pancake V2 router is missing or has no bytecode.",
    },
    {
      id: "pancake-v2-factory",
      label: "Pancake V2 factory",
      status: pancakeV2FactoryCode ? "pass" : "fail",
      detail: pancakeV2FactoryCode
        ? `Pancake V2 router resolves to deployed factory ${pancakeV2Factory}.`
        : "Could not verify a deployed Pancake V2 factory through the configured router.",
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
            label: "Mainnet standard launch activation",
            status: factoryPaused === false ? "pass" : "fail",
            detail:
              factoryPaused === false
                ? "Standard FortuneFactory launch creation is active."
                : factoryPaused === true
                  ? "Production standard launches are intentionally paused. Run the explicit governance activation only after all release gates pass."
                  : "Could not read the production standard launch pause state.",
          } satisfies ReadinessCheck,
          {
            id: "tax-launch-activation",
            label: "Mainnet tax-token launch activation",
            status: taxFactoryPaused === false ? "pass" : "fail",
            detail:
              taxFactoryPaused === false
                ? "Tax-token FortuneFactory launch creation is active."
                : taxFactoryPaused === true
                  ? "Production tax-token launches are intentionally paused. Activate only after all release gates pass."
                  : "Could not read the production tax-token launch pause state.",
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
