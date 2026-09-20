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
  [key: string]: unknown;
};

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
    deployment.wrappedAddress ||
    null
  );
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
        const bnbDeployments = (asset.deployments || []).filter(isBnbDeployment);

        return {
          id: asset.id || null,
          symbol: asset.symbol || null,
          name: asset.name || asset.symbol || "xStock",
          logo: asset.logo || null,
          isTradingHalted: Boolean(asset.isTradingHalted),
          deployments: bnbDeployments.map((deployment) => ({
            ...deployment,
            resolvedAddress: deploymentAddress(deployment),
          })),
        };
      })
      .filter((asset) => asset.deployments.length > 0);

    return NextResponse.json({
      chainId: 56,
      source: XSTOCKS_ASSETS,
      count: assets.length,
      note:
        "Discovery metadata only. Fortune onchain capabilities still require exact address, oracle, transfer-model and eligibility review.",
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
