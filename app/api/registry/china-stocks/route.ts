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
  ticker?: string;
  underlyingSymbol?: string;
  logo?: string;
  isTradingHalted?: boolean;
  deployments?: Deployment[];
  tokenDeployments?: Deployment[];
  [key: string]: unknown;
};

const CHINA_BLUE_CHIPS = [
  { rank: 1, name: "Tencent Holdings", ticker: "0700.HK", aliases: ["tencent"] },
  { rank: 2, name: "Alibaba Group", ticker: "9988.HK / BABA", aliases: ["alibaba"] },
  { rank: 3, name: "Industrial and Commercial Bank of China", ticker: "1398.HK", aliases: ["industrial and commercial bank of china", "icbc"] },
  { rank: 4, name: "China Construction Bank", ticker: "0939.HK", aliases: ["china construction bank"] },
  { rank: 5, name: "China Mobile", ticker: "0941.HK", aliases: ["china mobile"] },
  { rank: 6, name: "Bank of China", ticker: "3988.HK", aliases: ["bank of china"] },
  { rank: 7, name: "Ping An Insurance", ticker: "2318.HK", aliases: ["ping an"] },
  { rank: 8, name: "BYD", ticker: "1211.HK", aliases: ["byd"] },
  { rank: 9, name: "Xiaomi", ticker: "1810.HK", aliases: ["xiaomi"] },
  { rank: 10, name: "Meituan", ticker: "3690.HK", aliases: ["meituan"] },
  { rank: 11, name: "China Shenhua Energy", ticker: "1088.HK", aliases: ["china shenhua"] },
  { rank: 12, name: "Hong Kong Exchanges and Clearing", ticker: "0388.HK", aliases: ["hong kong exchanges", "hkex"] },
  { rank: 13, name: "Postal Savings Bank of China", ticker: "1658.HK", aliases: ["postal savings bank"] },
  { rank: 14, name: "China Petroleum & Chemical", ticker: "0386.HK", aliases: ["china petroleum", "sinopec"] },
  { rank: 15, name: "AIA Group", ticker: "1299.HK", aliases: ["aia"] },
  { rank: 16, name: "China Life Insurance", ticker: "2628.HK", aliases: ["china life"] },
  { rank: 17, name: "Bank of Communications", ticker: "3328.HK", aliases: ["bank of communications"] },
  { rank: 18, name: "PDD Holdings", ticker: "PDD", aliases: ["pdd holdings", "pinduoduo"] },
  { rank: 19, name: "JD.com", ticker: "JD / 9618.HK", aliases: ["jd.com", "jd com"] },
  { rank: 20, name: "Baidu", ticker: "BIDU / 9888.HK", aliases: ["baidu"] },
  { rank: 21, name: "NetEase", ticker: "NTES / 9999.HK", aliases: ["netease"] },
  { rank: 22, name: "NIO", ticker: "NIO / 9866.HK", aliases: ["nio"] },
] as const;

function allDeployments(asset: XAsset) {
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

function tokenAddress(deployment: Deployment) {
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

function normalizedAssetText(asset: XAsset) {
  return [
    asset.id,
    asset.name,
    asset.symbol,
    asset.ticker,
    asset.underlyingSymbol,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchAsset(list: XAsset[], aliases: readonly string[]) {
  return list.find((asset) => {
    const haystack = normalizedAssetText(asset);
    return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
  });
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

    const stocks = CHINA_BLUE_CHIPS.map((stock) => {
      const asset = matchAsset(list, stock.aliases);
      const deployment = asset
        ? allDeployments(asset).find(isBnbDeployment)
        : undefined;

      const nativeAddress = deployment ? tokenAddress(deployment) : null;
      const wrappedAddress = deployment ? wrapperAddress(deployment) : null;

      return {
        rank: stock.rank,
        company: stock.name,
        underlyingTicker: stock.ticker,
        xstockId: asset?.id || null,
        symbol: asset?.symbol || null,
        xstockName: asset?.name || null,
        logo: asset?.logo || null,
        nativeAddress,
        wrapperAddress: wrappedAddress,
        isTradingHalted: Boolean(asset?.isTradingHalted),
        bnbDeployment: Boolean(deployment),
        pairable:
          Boolean(deployment) &&
          Boolean(wrappedAddress) &&
          !Boolean(asset?.isTradingHalted),
        pairingAsset: wrappedAddress,
        status: !asset
          ? "Not in current xStocks catalog"
          : !deployment
            ? "No BNB deployment"
            : asset.isTradingHalted
              ? "Trading halted"
              : !wrappedAddress
                ? "BNB native token found · wrapper required"
                : "Pairable via wrapped xStock",
      };
    });

    return NextResponse.json({
      chainId: 56,
      source: XSTOCKS_ASSETS,
      count: stocks.length,
      pairableCount: stocks.filter((stock) => stock.pairable).length,
      pairingPolicy:
        "Fortune uses the current non-rebasing wrapped xStock for DeFi/curve pairing. Native rebasing xStocks are not used as quote reserves.",
      stocks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "China xStocks discovery failed",
        stocks: CHINA_BLUE_CHIPS.map((stock) => ({
          rank: stock.rank,
          company: stock.name,
          underlyingTicker: stock.ticker,
          pairable: false,
          status: "Live issuer metadata unavailable",
        })),
      },
      { status: 502 }
    );
  }
}
