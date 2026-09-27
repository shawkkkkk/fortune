import snapshot from "@/data/pair-universe.json";

// Is a token the tokenized stock it looks like? The verified set is every
// issuer security token in data/pair-universe.json: Anchored, bStocks, Ondo
// Global Markets and xStocks stocks, ETFs and ETF-backed commodities on BNB
// Smart Chain, checked onchain.
// - Copying one of those tokens' symbols, or a listed company's name together
//   with its ticker, is an imitation.
// - Calling itself a tokenized stock, or pairing a company's name with an
//   issuer-style symbol (AMCON, BABAB, AAAPL), without being one of those
//   contracts is unverified. Issuers have deployed more tokens than Fortune
//   has reviewed (hundreds more xStocks on BNB Smart Chain alone), so it may
//   be genuine, but Fortune does not pair with it: in September 2026 a
//   memecoin paired with a counterfeit "tokenized Farmmi" moved the real
//   Nasdaq stock 350% while one wallet controlled the fake token's supply.

export type StockToken = { symbol: string; name: string; underlying: string | null; provider: string | null; address: string };

export type StockIdentity =
  | { status: "verified"; official: StockToken }
  | { status: "imitation"; reason: "TOKEN_SYMBOL" | "NAME_AND_TICKER"; official: StockToken }
  | { status: "unverified"; reason: "STOCK_NAMING"; official: StockToken | null }
  | { status: "overlap"; official: StockToken }
  | { status: "none"; official: null };

type SnapshotAsset = { symbol: string; name: string; underlying: string | null; provider: string | null; address: string; group: string; kind: string };

const ASSETS = snapshot.assets as SnapshotAsset[];
// The stock-token issuers' ETF-backed commodities (Ondo's iShares Silver Trust, xStocks' gold) are listed shares too.
const ISSUERS = new Set(ASSETS.filter((asset) => asset.group === "stocks").map((asset) => asset.provider));
const SECURITY_ASSETS = ASSETS.filter((asset) => asset.address && (asset.group === "stocks" || (asset.group === "rwa" && ISSUERS.has(asset.provider))));
const STOCK_TOKENS: StockToken[] = SECURITY_ASSETS.map(({ symbol, name, underlying, provider, address }) => ({ symbol, name, underlying, provider, address }));

const BY_ADDRESS = new Map(STOCK_TOKENS.map((token) => [token.address.toLowerCase(), token]));
// Case matters: issuers write "Ton" (AT&T), "LIon" (Li Auto) and "WMTx" (Walmart); TON, LION and WMTX are unrelated crypto tokens.
const BY_SYMBOL = new Map(STOCK_TOKENS.map((token) => [symbolForm(token.symbol), token]));
const BY_TICKER = new Map<string, StockToken>();
const BY_COMPANY = new Map<string, StockToken>();
for (const [index, token] of STOCK_TOKENS.entries()) {
  const ticker = symbolKey(token.underlying || "");
  // One- and two-letter tickers (T, X, ON, AI…) and fund tickers (NEAR, BITO…) collide with too many crypto tokens to mean anything.
  const company = SECURITY_ASSETS[index].kind === "stock";
  if (company && ticker && ticker.length >= 3 && /^[a-z.]+$/.test(ticker) && !BY_TICKER.has(ticker)) BY_TICKER.set(ticker, token);
  const key = companyKey(token.name);
  if (key.length >= 4 && !BY_COMPANY.has(key)) BY_COMPANY.set(key, token);
}

/** How issuers and counterfeits label a tokenized share, singular or plural: xStocks' "xStock", bStocks' "bStock", Anchored's "aStock". */
const label = (issuerLetters: string) =>
  String.raw`(?:[${issuerLetters}]\s*stocks?|stock\s*tokens?|tokeni[sz]ed\s*(?:stocks?|shares?|equit(?:y|ies)|etfs?)|ondo\s*tokeni[sz]ed|robinhood\s*(?:stocks?|tokens?))`;
/** The label as its own words ("Farmmi xStock", "Farmmi x-stock"), so "Max Stock" and "Web Stock" are not it. */
const LABEL_WORDS = new RegExp(String.raw`(?:^|\s)${label("xab")}(?=\s|$)`);
/** The label glued to a name or ticker ("FARMMIXSTOCK", "xStockFarmmi"); too many words end in "a" ("MetaStocks") to include aStock. */
const LABEL_GLUED = new RegExp(String.raw`^${label("xb")}|${label("xb")}$`);

/** NFKC folds full-width and compatibility characters; invisible format characters (zero-width spaces, joiners) are dropped. */
function identityText(value: string) {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

function normalizedIdentityText(value: string) {
  return identityText(value).toLowerCase();
}

/** A symbol without punctuation or invisible format characters, in its original case. */
function symbolForm(value: string) {
  return identityText(value).replace(/[^A-Za-z0-9]+/g, "");
}

/** Ignore punctuation and invisible format characters in symbols. */
export function symbolKey(value: string) {
  return symbolForm(value).toLowerCase();
}

/** Convert punctuation to word boundaries before testing stock-token wording. */
function wordingKey(value: string) {
  return normalizedIdentityText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasStockTokenWording(value: string) {
  const text = identityText(value);
  // "(Ondo" is how Ondo marks its tokens; the ONDO token itself is just "Ondo".
  if (/[([{]\s*ondo\b/i.test(text)) return true;
  // Camel case also marks words, which finds the label inside a longer name ("FAMIxStockOfficial").
  const camel = text.replace(/([A-Z]{2,})([xab])(?=[A-Z]|\s|$)/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return [wordingKey(text), wordingKey(camel)].some((words) => LABEL_WORDS.test(words) || words.split(" ").some((word) => LABEL_GLUED.test(word)));
}

export function companyKey(name: string) {
  return normalizedIdentityText(name)
    .replace(/\([^)]*tokeni[sz]ed[^)]*\)|x[\s-]*stock|b[\s-]*stock|stock[\s-]*token/g, " ")
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
 * chain (including BSC Testnet) a token posing as one is never verified.
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
  // Issuers name tokens after the ticker plus Ondo's "on", xStocks' "x" or bStocks' "B" (bStocks keeps the plain company name),
  // or Anchored's "a" in front.
  const issuerBases = [normalizedSymbol.replace(/(?:on|x|b)$/, ""), normalizedSymbol.replace(/^a/, "")].filter((base) => base !== normalizedSymbol);
  const byIssuerSymbol = issuerBases.map((base) => BY_TICKER.get(base)).find((token) => token && token.underlying === byCompany?.underlying) ?? null;
  const issuerBase = byIssuerSymbol ? symbolKey(byIssuerSymbol.underlying || "") : "";

  const bySymbol = BY_SYMBOL.get(symbolForm(symbol));
  if (bySymbol) return { status: "imitation", reason: "TOKEN_SYMBOL", official: bySymbol };
  // A company's name with its ticker ("Disney", DIS); a name that is only the ticker ("OPEN", OPEN) is an overlap.
  if (byCompany && byTicker && byCompany.underlying === byTicker.underlying && company !== normalizedSymbol) {
    return { status: "imitation", reason: "NAME_AND_TICKER", official: byCompany };
  }
  const issuerStyled = byCompany && byIssuerSymbol && byCompany.underlying === byIssuerSymbol.underlying && company !== issuerBase;
  if (issuerStyled || hasStockTokenWording(name) || hasStockTokenWording(symbol)) {
    return { status: "unverified", reason: "STOCK_NAMING", official: byCompany ?? byTicker };
  }
  const overlap = byCompany ?? byTicker;
  if (overlap) return { status: "overlap", official: overlap };
  return { status: "none", official: null };
}
