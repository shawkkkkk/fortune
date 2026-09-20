import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";

export const revalidate = 300;

const NASDAQ_SCREENER =
  "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&offset=0&exchange=NASDAQ&download=true";
const XSTOCKS_ASSETS = "https://api.xstocks.fi/api/v2/public/assets";
const BINANCE_WEB3_BASE = "https://web3.binance.com/build";

type NasdaqRow = {
  symbol?: string;
  name?: string;
  lastsale?: string;
  marketCap?: string;
  volume?: string;
  sector?: string;
  industry?: string;
  country?: string;
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

type Representation = {
  provider: string;
  tokenSymbol: string | null;
  pairingAddress: string | null;
  pairable: boolean;
  halted: boolean;
  note: string;
};

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[$,%+,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value: unknown) {
  return String(value || "").trim().toUpperCase();
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

function wrapperAddress(deployment: Deployment) {
  return deployment.wrapperAddress || deployment.wrappedAddress || null;
}

function signedBinanceHeaders(method: string, pathWithQuery: string) {
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey || !secret) return null;

  const timestamp = new Date().toISOString();
  const signedPath = "/build" + pathWithQuery;
  const signature = createHmac("sha256", secret)
    .update(timestamp + method + signedPath, "utf8")
    .digest("base64");

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    accept: "application/json",
  };
}

async function fetchNasdaqPennyStocks() {
  const response = await fetch(NASDAQ_SCREENER, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent":
        "Mozilla/5.0 (compatible; FortuneLaunchpad/0.1; +https://github.com/shawkkkkk/fortune)",
      referer: "https://www.nasdaq.com/market-activity/stocks/screener",
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) throw new Error("NASDAQ screener unavailable");
  const body = await response.json();
  const rows: NasdaqRow[] = Array.isArray(body?.data?.rows)
    ? body.data.rows
    : [];

  return rows
    .map((row) => ({
      symbol: upper(row.symbol),
      name: String(row.name || row.symbol || "NASDAQ stock"),
      lastPrice: num(row.lastsale),
      marketCap: num(row.marketCap),
      volume: num(row.volume),
      sector: row.sector || null,
      industry: row.industry || null,
      country: row.country || null,
    }))
    .filter(
      (stock) =>
        stock.symbol &&
        stock.lastPrice != null &&
        stock.lastPrice > 0 &&
        stock.lastPrice < 5
    )
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 750);
}

async function fetchXStockRepresentations() {
  try {
    const response = await fetch(XSTOCKS_ASSETS, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return new Map<string, Representation[]>();

    const body = await response.json();
    const list: XAsset[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.assets)
          ? body.assets
          : [];

    const map = new Map<string, Representation[]>();

    for (const asset of list) {
      const ticker = upper(
        asset.underlyingSymbol || asset.ticker || asset.symbol?.replace(/x$/i, "")
      );
      if (!ticker) continue;

      for (const deployment of allDeployments(asset).filter(isBnbDeployment)) {
        const wrapper = wrapperAddress(deployment);
        const item: Representation = {
          provider: "xStocks",
          tokenSymbol: asset.symbol || null,
          pairingAddress: wrapper,
          halted: Boolean(asset.isTradingHalted),
          pairable: Boolean(wrapper) && !Boolean(asset.isTradingHalted),
          note: wrapper
            ? "Current non-rebasing BNB xStock wrapper."
            : "BNB xStock found but no current DeFi wrapper resolved.",
        };
        map.set(ticker, [...(map.get(ticker) || []), item]);
      }
    }

    return map;
  } catch {
    return new Map<string, Representation[]>();
  }
}

async function fetchBinanceRepresentations() {
  const path = "/api/v1/dex/market/rwa/tokens?binanceChainId=56";
  const headers = signedBinanceHeaders("GET", path);
  if (!headers) {
    return {
      configured: false,
      map: new Map<string, Representation[]>(),
    };
  }

  try {
    const response = await fetch(BINANCE_WEB3_BASE + path, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        configured: true,
        map: new Map<string, Representation[]>(),
      };
    }

    const body = await response.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    const map = new Map<string, Representation[]>();

    for (const asset of rows) {
      if (
        String(asset?.binanceChainId) !== "56" ||
        Number(asset?.assetType) !== 1 ||
        !asset?.tokenContractAddress
      ) {
        continue;
      }

      const ticker = upper(asset?.underlyingTicker);
      if (!ticker) continue;

      const reason = asset?.statusInfo?.reasonCode || null;
      const halted =
        reason === "ASSET_PAUSED" ||
        reason === "MARKET_PAUSED" ||
        reason === "UNSUPPORTED";

      const provider =
        asset?.platformId === "bstock"
          ? "bStocks"
          : asset?.platformId === "ondo"
            ? "Ondo"
            : asset?.platformId || "Tokenized stock provider";

      const item: Representation = {
        provider,
        tokenSymbol: asset?.tokenSymbol || null,
        pairingAddress: asset?.tokenContractAddress || null,
        halted,
        pairable: !halted,
        note: halted
          ? "Provider currently reports this stock token as paused or unsupported."
          : "BSC stock token returned by Binance Web3 RWA data.",
      };

      map.set(ticker, [...(map.get(ticker) || []), item]);
    }

    return { configured: true, map };
  } catch {
    return {
      configured: true,
      map: new Map<string, Representation[]>(),
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = upper(url.searchParams.get("q"));
  const pairableOnly = url.searchParams.get("pairable") === "true";
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 150), 1),
    500
  );

  try {
    const [pennyStocks, xstocks, binance] = await Promise.all([
      fetchNasdaqPennyStocks(),
      fetchXStockRepresentations(),
      fetchBinanceRepresentations(),
    ]);

    const catalog = pennyStocks
      .map((stock) => {
        const representations = [
          ...(xstocks.get(stock.symbol) || []),
          ...(binance.map.get(stock.symbol) || []),
        ];

        const pairableRepresentations = representations.filter(
          (item) => item.pairable
        );

        return {
          ...stock,
          representations,
          pairableRepresentations,
          pairable: pairableRepresentations.length > 0,
          pairableCount: pairableRepresentations.length,
        };
      })
      .filter(
        (stock) =>
          (!search ||
            stock.symbol.includes(search) ||
            stock.name.toUpperCase().includes(search)) &&
          (!pairableOnly || stock.pairable)
      )
      .sort((a, b) => {
        if (a.pairable !== b.pairable) return a.pairable ? -1 : 1;
        return (b.marketCap || 0) - (a.marketCap || 0);
      })
      .slice(0, limit);

    return NextResponse.json({
      chainId: 56,
      definition:
        "NASDAQ-listed stocks with a current screener last-sale price above $0 and below $5.",
      totalNasdaqPennyStocksObserved: pennyStocks.length,
      returned: catalog.length,
      pairableReturned: catalog.filter((stock) => stock.pairable).length,
      binanceWeb3Configured: binance.configured,
      pairingRule:
        "Direct Fortune pairing requires an actual active BSC tokenized-stock contract from a recognized provider and subsequent Fortune Registry approval.",
      marketIntegrity:
        "Fortune stock pairing is a market-access feature, not a mechanism for targeting or moving the underlying public stock.",
      catalog,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "NASDAQ penny-stock catalog unavailable",
        catalog: [],
      },
      { status: 502 }
    );
  }
}
