import snapshot from "@/data/pair-universe.json";

// Is a token the tokenized stock it looks like? The verified set is every
// tokenized stock and ETF contract in data/pair-universe.json (bStocks, Ondo
// Global Markets, xStocks on BNB Smart Chain, checked onchain). A token that
// borrows a stock token's ticker or calls itself a tokenized stock without
// being one of those contracts is treated as a counterfeit: in September 2026
// a memecoin paired with a counterfeit "tokenized Farmmi" moved the real
// Nasdaq stock 350% while one wallet controlled the fake token's supply.

export type StockToken = { symbol: string; name: string; underlying: string | null; provider: string | null; address: string };

export type StockIdentity =
  | { status: "verified"; official: StockToken }
  | { status: "imitation"; reason: "TOKEN_SYMBOL" | "STOCK_NAMING" | "NAME_AND_TICKER"; official: StockToken | null }
  | { status: "overlap"; official: StockToken }
  | { status: "none"; official: null };

type SnapshotAsset = { symbol: string; name: string; underlying: string | null; provider: string | null; address: string; group: string; kind: string };

const STOCK_ASSETS = (snapshot.assets as SnapshotAsset[]).filter(
  (asset) => asset.group === "stocks" && (asset.kind === "stock" || asset.kind === "etf") && asset.address
);
const STOCK_TOKENS: StockToken[] = STOCK_ASSETS.map(({ symbol, name, underlying, provider, address }) => ({ symbol, name, underlying, provider, address }));

const BY_ADDRESS = new Map(STOCK_TOKENS.map((token) => [token.address.toLowerCase(), token]));
const BY_SYMBOL = new Map(STOCK_TOKENS.map((token) => [symbolKey(token.symbol), token]));
const BY_TICKER = new Map<string, StockToken>();
const BY_COMPANY = new Map<string, StockToken>();
for (const [index, token] of STOCK_TOKENS.entries()) {
  const ticker = symbolKey(token.underlying || "");
  // One- and two-letter tickers (T, X, ON, AI…) and fund tickers (NEAR, BITO…) collide with too many crypto tokens to mean anything.
  const company = STOCK_ASSETS[index].kind === "stock";
  if (company && ticker && ticker.length >= 3 && /^[a-z.]+$/.test(ticker) && !BY_TICKER.has(ticker)) BY_TICKER.set(ticker, token);
  const key = companyKey(token.name);
  if (key.length >= 4 && !BY_COMPANY.has(key)) BY_COMPANY.set(key, token);
}

/** How issuers and counterfeits label a tokenized share. */
const STOCK_TOKEN_WORDING = /(?:^|\s)(?:x\s*stock|b\s*stock|stock\s*token|tokeni[sz]ed\s*(?:stock|share|equity)|ondo\s*tokeni[sz]ed|robinhood\s*(?:stock|token))(?:\s|$)/;

function normalizedIdentityText(value: string) {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase();
}

/** Ignore punctuation and invisible format characters in symbols. */
export function symbolKey(value: string) {
  return normalizedIdentityText(value).replace(/[^a-z0-9]+/g, "");
}

/** Convert punctuation to word boundaries before testing stock-token wording. */
function wordingKey(value: string) {
  return normalizedIdentityText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function companyKey(name: string) {
  return normalizedIdentityText(name)
    .replace(/\((?:ondo\s*)?tokeni[sz]ed\)|x[\s-]*stock|b[\s-]*stock|stock[\s-]*token/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(?:inc|incorporated|corp|corporation|co|company|holdings?|group|ltd|limited|plc|sa|nv|ag|class [a-c]|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stockTokenCount() {
  return STOCK_TOKENS.length;
}

/**
 * Only BNB Smart Chain contracts can be verified stock tokens; on any other
 * chain (including BSC Testnet) a token posing as one is always a counterfeit.
 */
export function checkStockIdentity(input: { address: string; chainId: number; name: string | null; symbol: string | null }): StockIdentity {
  const verified = input.chainId === 56 ? BY_ADDRESS.get(input.address.toLowerCase()) : undefined;
  if (verified) return { status: "verified", official: verified };

  const symbol = (input.symbol || "").trim();
  const name = (input.name || "").trim();
  const normalizedSymbol = symbolKey(symbol);
  const company = name ? companyKey(name) : "";
  const byCompany = company.length >= 4 ? BY_COMPANY.get(company) ?? null : null;
  const byTicker = BY_TICKER.get(normalizedSymbol) ?? null;

  const bySymbol = BY_SYMBOL.get(normalizedSymbol);
  if (bySymbol) return { status: "imitation", reason: "TOKEN_SYMBOL", official: bySymbol };
  if (STOCK_TOKEN_WORDING.test(wordingKey(name)) || STOCK_TOKEN_WORDING.test(wordingKey(symbol))) {
    return { status: "imitation", reason: "STOCK_NAMING", official: byCompany ?? byTicker };
  }
  if (byCompany && byTicker && byCompany.underlying === byTicker.underlying) {
    return { status: "imitation", reason: "NAME_AND_TICKER", official: byCompany };
  }
  const overlap = byCompany ?? byTicker;
  if (overlap) return { status: "overlap", official: overlap };
  return { status: "none", official: null };
}
