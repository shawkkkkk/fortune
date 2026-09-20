import { NextResponse } from "next/server";

export const revalidate = 3600;

const COINGECKO = "https://api.coingecko.com/api/v3";
const CATEGORY = "binance-smart-chain";

type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number | null;
  market_cap?: number | null;
  market_cap_rank?: number | null;
  total_volume?: number | null;
};

type CoinListItem = {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string | null>;
};

function headers() {
  const key = process.env.COINGECKO_API_KEY;
  return {
    accept: "application/json",
    ...(key ? { "x-cg-demo-api-key": key } : {}),
  };
}

async function cg(path: string) {
  const response = await fetch(COINGECKO + path, {
    headers: headers(),
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko returned ${response.status}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const [page1, page2, coinList] = (await Promise.all([
      cg(
        `/coins/markets?vs_currency=usd&category=${CATEGORY}&order=market_cap_desc&per_page=250&page=1&sparkline=false`
      ),
      cg(
        `/coins/markets?vs_currency=usd&category=${CATEGORY}&order=market_cap_desc&per_page=250&page=2&sparkline=false`
      ),
      cg("/coins/list?include_platform=true"),
    ])) as [MarketCoin[], MarketCoin[], CoinListItem[]];

    const platforms = new Map(
      coinList.map((coin) => [coin.id, coin.platforms || {}])
    );

    const seen = new Set<string>();
    const ranked = [...page1, ...page2]
      .map((coin, index) => {
        const address =
          platforms.get(coin.id)?.["binance-smart-chain"] ||
          platforms.get(coin.id)?.["bnb-smart-chain"] ||
          null;

        return {
          rank: index + 1,
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          address,
          image: coin.image || null,
          priceUsd: coin.current_price ?? null,
          marketCap: coin.market_cap ?? null,
          marketCapRank: coin.market_cap_rank ?? null,
          volume24h: coin.total_volume ?? null,
          category: "BNB Chain Ecosystem",
          fortuneStatus: "candidate",
          capabilities: [],
        };
      })
      .filter((coin) => {
        if (!coin.address) return false;
        const key = coin.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 400);

    return NextResponse.json({
      chainId: 56,
      category: CATEGORY,
      rankedBy: "BNB Chain ecosystem market cap",
      count: ranked.length,
      source: "CoinGecko",
      note:
        "Market ranking is discovery only. Fortune pairing/reward/graduation capabilities require separate onchain registry approval.",
      tokens: ranked,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Top BSC discovery failed",
        tokens: [],
      },
      { status: 502 }
    );
  }
}
