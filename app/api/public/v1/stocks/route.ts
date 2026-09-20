import { createHmac } from "node:crypto";

import {
  apiOk,
  paginate,
  parseLimit,
} from "@/lib/public-api";

export const revalidate = 300;

const BINANCE_WEB3_BASE = "https://web3.binance.com/build";
const XSTOCKS_ASSETS = "https://api.xstocks.fi/api/v2/public/assets";

type StockRow = {
  provider: string;
  underlyingTicker: string;
  underlyingName: string | null;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  pairingAddress: string | null;
  structure: string;
  status: string | null;
  pairableCandidate: boolean;
  note: string;
};

function signedBinanceHeaders(
  method: string,
  pathWithQuery: string
) {
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey || !secret) return null;

  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", secret)
    .update(
      timestamp + method + "/build" + pathWithQuery,
      "utf8"
    )
    .digest("base64");

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    accept: "application/json",
  };
}

async function loadBinanceStocks(): Promise<StockRow[]> {
  const path =
    "/api/v1/dex/market/rwa/tokens?binanceChainId=56";
  const headers = signedBinanceHeaders("GET", path);
  if (!headers) return [];

  try {
    const response = await fetch(
      BINANCE_WEB3_BASE + path,
      {
        headers,
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return [];

    const body = await response.json();
    const rows = Array.isArray(body?.data)
      ? body.data
      : [];

    return rows
      .filter(
        (asset: Record<string, unknown>) =>
          String(asset.binanceChainId) === "56" &&
          Number(asset.assetType) === 1 &&
          Boolean(asset.tokenContractAddress)
      )
      .map((asset: Record<string, unknown>) => {
        const statusInfo =
          asset.statusInfo &&
          typeof asset.statusInfo === "object"
            ? (asset.statusInfo as Record<string, unknown>)
            : {};

        const reason = String(
          statusInfo.reasonCode || ""
        );
        const halted = [
          "ASSET_PAUSED",
          "MARKET_PAUSED",
          "UNSUPPORTED",
        ].includes(reason);

        const platformId = String(
          asset.platformId || ""
        );

        const provider =
          platformId === "bstock"
            ? "bStocks"
            : platformId === "ondo"
              ? "Ondo"
              : platformId || "Tokenized stock provider";

        return {
          provider,
          underlyingTicker: String(
            asset.underlyingTicker || ""
          ).toUpperCase(),
          underlyingName:
            asset.underlyingName == null
              ? null
              : String(asset.underlyingName),
          tokenSymbol:
            asset.tokenSymbol == null
              ? null
              : String(asset.tokenSymbol),
          tokenAddress:
            asset.tokenContractAddress == null
              ? null
              : String(asset.tokenContractAddress),
          pairingAddress:
            asset.tokenContractAddress == null
              ? null
              : String(asset.tokenContractAddress),
          structure: platformId || "tokenized-stock",
          status:
            statusInfo.marketStatus == null
              ? null
              : String(statusInfo.marketStatus),
          pairableCandidate:
            !halted &&
            Boolean(asset.tokenContractAddress),
          note: halted
            ? "Provider reports this representation as paused or unsupported."
            : "BSC stock-token representation discovered through Binance Web3 RWA data. Fortune Registry approval and user eligibility are still required.",
        };
      });
  } catch {
    return [];
  }
}

type Deployment = {
  network?: unknown;
  chain?: unknown;
  chainId?: unknown;
  blockchain?: unknown;
  wrapperAddress?: unknown;
  wrappedAddress?: unknown;
};

function isBnbDeployment(deployment: Deployment) {
  const labels = [
    deployment.network,
    deployment.chain,
    deployment.blockchain,
  ]
    .filter(Boolean)
    .map((value) =>
      String(value).toLowerCase()
    );

  const chainId = String(
    deployment.chainId ?? ""
  ).toLowerCase();

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

async function loadXStocks(): Promise<StockRow[]> {
  try {
    const response = await fetch(
      XSTOCKS_ASSETS,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return [];

    const body = await response.json();
    const list = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.assets)
          ? body.assets
          : [];

    const rows: StockRow[] = [];

    for (const asset of list) {
      const deployments = [
        ...(Array.isArray(asset?.tokenDeployments)
          ? asset.tokenDeployments
          : []),
        ...(Array.isArray(asset?.deployments)
          ? asset.deployments
          : []),
      ].filter(isBnbDeployment);

      const ticker = String(
        asset?.underlyingSymbol ||
          asset?.ticker ||
          asset?.symbol ||
          ""
      )
        .replace(/x$/i, "")
        .toUpperCase();

      for (const deployment of deployments) {
        const wrapper =
          deployment?.wrapperAddress ||
          deployment?.wrappedAddress ||
          null;
        const halted = Boolean(
          asset?.isTradingHalted
        );

        rows.push({
          provider: "xStocks",
          underlyingTicker: ticker,
          underlyingName:
            asset?.name == null
              ? null
              : String(asset.name),
          tokenSymbol:
            asset?.symbol == null
              ? null
              : String(asset.symbol),
          tokenAddress: null,
          pairingAddress:
            wrapper == null
              ? null
              : String(wrapper),
          structure: "wrapped-xstock",
          status: halted ? "halted" : "active",
          pairableCandidate:
            Boolean(wrapper) && !halted,
          note: wrapper
            ? "Current non-rebasing BNB wrapper discovered from xStocks metadata. Fortune Registry approval and user eligibility are still required."
            : "BNB xStock found, but a current DeFi wrapper was not resolved.",
        });
      }
    }

    return rows;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const provider = (
    url.searchParams.get("provider") || ""
  )
    .trim()
    .toLowerCase();
  const onlyPairable =
    url.searchParams.get("pairable") === "true";
  const limit = parseLimit(
    url.searchParams.get("limit"),
    50,
    100
  );

  const [binanceRows, xstockRows] =
    await Promise.all([
      loadBinanceStocks(),
      loadXStocks(),
    ]);

  const seen = new Set<string>();
  const rows = [
    ...binanceRows,
    ...xstockRows,
  ].filter((row) => {
    const identity = (
      row.pairingAddress ||
      row.provider +
        ":" +
        row.underlyingTicker +
        ":" +
        row.tokenSymbol
    ).toLowerCase();

    if (seen.has(identity)) return false;
    seen.add(identity);

    if (
      query &&
      !row.underlyingTicker
        .toLowerCase()
        .includes(query) &&
      !row.underlyingName
        ?.toLowerCase()
        .includes(query) &&
      !row.tokenSymbol
        ?.toLowerCase()
        .includes(query) &&
      !row.pairingAddress
        ?.toLowerCase()
        .includes(query)
    ) {
      return false;
    }

    if (
      provider &&
      row.provider.toLowerCase() !== provider
    ) {
      return false;
    }

    if (
      onlyPairable &&
      !row.pairableCandidate
    ) {
      return false;
    }

    return true;
  });

  const result = paginate(
    rows,
    url.searchParams.get("cursor"),
    limit
  );

  return apiOk(result, {
    cacheSeconds: 300,
    staleSeconds: 1800,
    meta: {
      chainId: 56,
      coverage: {
        xStocks: true,
        binanceRwaProviders: Boolean(
          process.env.BINANCE_WEB3_API_KEY &&
            process.env.BINANCE_WEB3_SECRET_KEY
        ),
      },
      important:
        "pairableCandidate means a real active BSC representation was discovered. Actual Fortune quote capability still requires Asset Registry, oracle, compatibility and eligibility approval.",
    },
  });
}
