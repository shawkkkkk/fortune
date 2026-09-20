import { NextResponse } from "next/server";

export const revalidate = 15;

const LIGHTER_BASES = [
  "https://mainnet.zklighter.elliot.ai",
  "https://api.rh.lighter.xyz",
];

type RawMarket = Record<string, unknown>;

type NormalizedMarket = {
  marketId: number;
  symbol: string;
  active: boolean;
  markPrice: number | null;
  indexPrice: number | null;
  lastTradePrice: number | null;
  openInterest: number | null;
  volume24h: number | null;
  marketConfig: unknown;
};

function value(record: RawMarket, ...keys: string[]) {
  for (const key of keys) {
    const v = record[key];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function num(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalize(raw: RawMarket): NormalizedMarket {
  const symbol = String(
    value(raw, "symbol", "market", "name", "ticker", "base_symbol") || ""
  ).toUpperCase();

  const marketId = Number(
    value(raw, "market_id", "marketId", "id", "order_book_id") ?? -1
  );

  const statusText = String(
    value(raw, "status", "market_status", "state") || ""
  ).toLowerCase();

  const activeFlag = value(raw, "active", "is_active", "enabled");

  const active =
    typeof activeFlag === "boolean"
      ? activeFlag
      : !["inactive", "disabled", "halted", "paused", "closed"].includes(
          statusText
        );

  return {
    marketId: Number.isFinite(marketId) ? marketId : -1,
    symbol,
    active,
    markPrice: num(value(raw, "mark_price", "markPrice")),
    indexPrice: num(value(raw, "index_price", "indexPrice")),
    lastTradePrice: num(value(raw, "last_trade_price", "lastTradePrice")),
    openInterest: num(value(raw, "open_interest", "openInterest")),
    volume24h: num(
      value(raw, "daily_quote_token_volume", "volume_24h", "daily_volume")
    ),
    marketConfig: value(raw, "market_config", "marketConfig"),
  };
}

async function loadMarkets(): Promise<{ source: string; markets: NormalizedMarket[] }> {
  let lastError: Error | null = null;

  for (const base of LIGHTER_BASES) {
    try {
      const response = await fetch(base + "/api/v1/orderBookDetails", {
        headers: { accept: "application/json" },
        next: { revalidate: 15 },
      });

      if (!response.ok) {
        lastError = new Error("Lighter returned " + response.status);
        continue;
      }

      const body = await response.json();
      const rows = Array.isArray(body?.order_book_details)
        ? body.order_book_details
        : Array.isArray(body?.perps_order_books)
          ? body.perps_order_books
          : [];

      if (!rows.length) {
        lastError = new Error("Lighter market list was empty");
        continue;
      }

      return {
        source: base,
        markets: rows.map((row: RawMarket) => normalize(row)),
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Lighter request failed");
    }
  }

  throw lastError || new Error("Lighter markets unavailable");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().toUpperCase();
  const preIpoOnly = url.searchParams.get("preipo") !== "false";

  try {
    const { source, markets } = await loadMarkets();

    const preIpoNames = ["OPENAI", "ANTHROPIC"];
    const filtered = markets
      .filter((market) => market.symbol)
      .filter((market) => !preIpoOnly || preIpoNames.some((name) => market.symbol.includes(name)))
      .filter((market) => !query || market.symbol.includes(query))
      .sort((a, b) => Number(b.active) - Number(a.active));

    return NextResponse.json({
      source,
      count: filtered.length,
      note:
        "Lighter markets are external perpetual references, not BEP-20 quote assets. Fortune settles these experimental pools in an approved BSC settlement token.",
      markets: filtered,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Lighter markets unavailable",
        markets: [],
      },
      { status: 502 }
    );
  }
}
