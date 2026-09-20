import { NextResponse } from "next/server";

export const revalidate = 3600;

const XSTOCKS_ASSETS = "https://api.xstocks.fi/api/v2/public/assets";

type Deployment = {
  network?: string;
  chain?: string;
  chainId?: string | number;
  blockchain?: string;
  address?: string;
  contractAddress?: string;
  tokenAddress?: string;
  wrapperAddress?: string;
  wrappedAddress?: string;
  [key: string]: unknown;
};

type XAsset = {
  id?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  isTradingHalted?: boolean;
  deployments?: Deployment[];
  tokenDeployments?: Deployment[];
  [key: string]: unknown;
};

function deploymentsFor(asset: XAsset) {
  return [
    ...(Array.isArray(asset.tokenDeployments) ? asset.tokenDeployments : []),
    ...(Array.isArray(asset.deployments) ? asset.deployments : []),
  ];
}

function isBnbDeployment(deployment: Deployment) {
  const labels = [
    deployment.network,
    deployment.chain,
    deployment.blockchain,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const chainId = String(deployment.chainId ?? "").toLowerCase();

  return (
    chainId === "56" ||
    chainId === "0x38" ||
    labels.some(
      (label) =>
        label === "bnb" ||
        label === "bsc" ||
        label.includes("bnb chain") ||
        label.includes("bnb smart chain") ||
        label.includes("binance smart chain")
    )
  );
}

function deploymentAddress(deployment: Deployment) {
  return (
    deployment.address ||
    deployment.contractAddress ||
    deployment.tokenAddress ||
    null
  );
}

function wrapperAddress(deployment: Deployment) {
  return deployment.wrapperAddress || deployment.wrappedAddress || null;
}

export async function GET() {
  try {
    const response = await fetch(XSTOCKS_ASSETS, {
      next: { revalidate: 3600 },
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`xStocks public assets returned ${response.status}`);
    }

    const body = await response.json();
    const list: XAsset[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.assets)
          ? body.assets
          : [];

    const assets = list
      .map((asset) => {
        const bnbDeployments = deploymentsFor(asset).filter(isBnbDeployment);

        return {
          id: asset.id || null,
          symbol: asset.symbol || null,
          name: asset.name || asset.symbol || "xStock",
          logo: asset.logo || null,
          isTradingHalted: Boolean(asset.isTradingHalted),
          deployments: bnbDeployments.map((deployment) => {
            const resolvedAddress = deploymentAddress(deployment);
            const resolvedWrapperAddress = wrapperAddress(deployment);

            return {
              ...deployment,
              resolvedAddress,
              resolvedWrapperAddress,
              pairable:
                Boolean(resolvedWrapperAddress) &&
                !Boolean(asset.isTradingHalted),
              pairingAsset: resolvedWrapperAddress,
            };
          }),
        };
      })
      .filter((asset) => asset.deployments.length > 0);

    return NextResponse.json({
      chainId: 56,
      source: XSTOCKS_ASSETS,
      count: assets.length,
      pairingPolicy:
        "Fortune pairs against current wrapped xStocks, not native rebasing xStocks. A BNB deployment without a current wrapper remains discovery-only.",
      note:
        "Discovery metadata only. Production Fortune capabilities still require exact wrapper verification, an independent oracle, liquidity review and user eligibility controls.",
      assets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "xStocks discovery failed",
        assets: [],
      },
      { status: 502 }
    );
  }
}
