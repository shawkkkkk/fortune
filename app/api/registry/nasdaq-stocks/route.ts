import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";

export const revalidate = 60;

const XSTOCKS_ASSETS = "https://api.xstocks.fi/api/v2/public/assets";
const BINANCE_WEB3_BASE = "https://web3.binance.com/build";

type NasdaqInfo = {
  verified: boolean;
  symbol: string;
  companyName: string | null;
  exchange: string | null;
  lastPrice: number | null;
  isPenny: boolean | null;
};

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
  isTradingHalted?: boolean;
  deployments?: Deployment[];
  tokenDeployments?: Deployment[];
  [key: string]: unknown;
};

function numberFromPrice(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function getNasdaqInfo(ticker: string): Promise<NasdaqInfo> {
  try {
    const response = await fetch(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=stocks`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent":
            "Mozilla/5.0 (compatible; FortuneLaunchpad/0.1; +https://github.com/shawkkkkk/fortune)",
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) throw new Error("Nasdaq quote unavailable");
    const body = await response.json();
    const data = body?.data;

    const exchange =
      typeof data?.exchange === "string" ? data.exchange : null;
    const verified =
      Boolean(data?.isNasdaqListed) ||
      Boolean(exchange && exchange.toUpperCase().includes("NASDAQ"));

    const lastPrice =
      numberFromPrice(data?.primaryData?.lastSalePrice) ??
      numberFromPrice(data?.primaryData?.lastSale) ??
      numberFromPrice(data?.secondaryData?.lastSalePrice) ??
      null;

    return {
      verified,
      symbol: String(data?.symbol || ticker).toUpperCase(),
      companyName:
        typeof data?.companyName === "string" ? data.companyName : null,
      exchange,
      lastPrice,
      isPenny: lastPrice == null ? null : lastPrice < 5,
    };
  } catch {
    return {
      verified: false,
      symbol: ticker.toUpperCase(),
      companyName: null,
      exchange: null,
      lastPrice: null,
      isPenny: null,
    };
  }
}

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

async function searchXStocks(ticker: string) {
  try {
    const response = await fetch(XSTOCKS_ASSETS, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];

    const body = await response.json();
    const list: XAsset[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.assets)
          ? body.assets
          : [];

    const needle = ticker.toUpperCase();
    return list
      .filter((asset) => {
        const identifiers = [
          asset.symbol,
          asset.ticker,
          asset.underlyingSymbol,
          asset.id,
        ]
          .filter(Boolean)
          .map((value) => String(value).toUpperCase());

        return identifiers.some(
          (value) =>
            value === needle ||
            value === needle + "X" ||
            value.replace(/X$/i, "") === needle
        );
      })
      .flatMap((asset) => {
        const deployments = allDeployments(asset).filter(isBnbDeployment);
        return deployments.map((deployment) => {
          const wrapper = wrapperAddress(deployment);
          return {
            provider: "xStocks",
            tokenSymbol: asset.symbol || null,
            tokenAddress: tokenAddress(deployment),
            pairingAddress: wrapper,
            structure: "wrapped-xstock",
            chainId: 56,
            halted: Boolean(asset.isTradingHalted),
            providerPairable: Boolean(wrapper) && !Boolean(asset.isTradingHalted),
            note: wrapper
              ? "Uses the current non-rebasing xStocks wrapper for DeFi pairing."
              : "Native rebasing xStock found, but no current wrapper was resolved.",
          };
        });
      });
  } catch {
    return [];
  }
}

function signedBinanceHeaders(method: string, pathWithQuery: string) {
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey || !secret) return null;

  const timestamp = new Date().toISOString();
  const signedPath = "/build" + pathWithQuery;
  const preHash = timestamp + method + signedPath;
  const signature = createHmac("sha256", secret)
    .update(preHash, "utf8")
    .digest("base64");

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    accept: "application/json",
  };
}

async function searchBinanceRwa(ticker: string) {
  const path = "/api/v1/dex/market/rwa/tokens?binanceChainId=56";
  const headers = signedBinanceHeaders("GET", path);
  if (!headers) return { configured: false, results: [] };

  try {
    const response = await fetch(BINANCE_WEB3_BASE + path, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) return { configured: true, results: [] };

    const body = await response.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    const needle = ticker.toUpperCase();

    const results = rows
      .filter(
        (asset: {
          underlyingTicker?: string;
          binanceChainId?: string;
          assetType?: number;
          tokenContractAddress?: string;
        }) =>
          String(asset.underlyingTicker || "").toUpperCase() === needle &&
          String(asset.binanceChainId) === "56" &&
          Number(asset.assetType) === 1 &&
          Boolean(asset.tokenContractAddress)
      )
      .map(
        (asset: {
          platformId?: string;
          tokenContractAddress?: string;
          tokenSymbol?: string;
          tokenName?: string;
          underlyingName?: string;
          referencePrice?: string;
          marketCap?: string;
          statusInfo?: {
            marketStatus?: string;
            reasonCode?: string | null;
            reasonMsg?: string | null;
          };
        }) => {
          const reason = asset.statusInfo?.reasonCode || null;
          const halted =
            reason === "ASSET_PAUSED" ||
            reason === "MARKET_PAUSED" ||
            reason === "UNSUPPORTED";

          return {
            provider:
              asset.platformId === "bstock"
                ? "bStocks"
                : asset.platformId === "ondo"
                  ? "Ondo"
                  : asset.platformId || "Tokenized stock provider",
            tokenSymbol: asset.tokenSymbol || null,
            tokenAddress: asset.tokenContractAddress || null,
            pairingAddress: asset.tokenContractAddress || null,
            structure: asset.platformId || "tokenized-stock",
            chainId: 56,
            halted,
            providerPairable: !halted,
            providerReferencePrice:
              numberFromPrice(asset.referencePrice) ?? null,
            providerMarketCap:
              numberFromPrice(asset.marketCap) ?? null,
            marketStatus: asset.statusInfo?.marketStatus || null,
            note: halted
              ? "Provider currently reports this stock token as paused or unsupported."
              : "BSC tokenized stock returned by Binance Web3 RWA data. Fortune registry approval and user eligibility checks are still required.",
          };
        }
      );

    return { configured: true, results };
  } catch {
    return { configured: true, results: [] };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("q") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);

  if (!ticker) {
    return NextResponse.json({
      error: "Pass a NASDAQ ticker with ?q=, for example ?q=FAMI",
      results: [],
    });
  }

  const [nasdaq, xstocks, binance] = await Promise.all([
    getNasdaqInfo(ticker),
    searchXStocks(ticker),
    searchBinanceRwa(ticker),
  ]);

  const tokenized = [...xstocks, ...binance.results].map((asset) => ({
    ...asset,
    pairable:
      nasdaq.verified &&
      nasdaq.isPenny === true &&
      asset.providerPairable &&
      !asset.halted,
    pennyStock:
      nasdaq.isPenny,
    underlyingTicker: nasdaq.symbol,
    underlyingCompany: nasdaq.companyName,
  }));

  return NextResponse.json({
    query: ticker,
    underlying: nasdaq,
    tokenizationSearch: {
      binanceWeb3Configured: binance.configured,
      providersChecked: ["xStocks", "Ondo", "bStocks"],
    },
    policy: {
      syntheticTokensAllowed: false,
      rule:
        "The NASDAQ Penny Stocks category enables direct pairing only when the underlying is verified as NASDAQ-listed, its observed last-sale price is below $5, and a recognized provider exposes an actual BSC tokenized representation. A ticker by itself is not an onchain asset.",
      pennyDefinition:
        "UI classification uses a last sale price below $5 when Nasdaq quote data is available.",
    },
    results: tokenized,
  });
}
