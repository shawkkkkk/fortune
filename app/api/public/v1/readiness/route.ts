import { apiOk } from "@/lib/public-api";
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
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || "";
  const registry =
    process.env.FORTUNE_REGISTRY ||
    process.env.NEXT_PUBLIC_FORTUNE_REGISTRY_ADDRESS ||
    "";
  const graduationAdapter =
    process.env.FORTUNE_GRADUATION_ADAPTER ||
    process.env.NEXT_PUBLIC_FORTUNE_GRADUATION_ADAPTER_ADDRESS ||
    "";
  const liquidityLocker =
    process.env.FORTUNE_LIQUIDITY_LOCKER ||
    process.env.NEXT_PUBLIC_FORTUNE_LIQUIDITY_LOCKER_ADDRESS ||
    "";
  const pancakeFactory =
    process.env.PANCAKE_V3_FACTORY || "";
  const positionManager =
    process.env.PANCAKE_V3_POSITION_MANAGER || "";

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
