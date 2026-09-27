import test from "node:test";
import assert from "node:assert/strict";
import { checkStockIdentity, companyKey, stockTokenCount } from "../../lib/stock-identity.ts";
import { FINDING_TEXT } from "../../lib/pair-inspector-text.ts";
import { PENNY_MAX_USD, isPennyStock } from "../../lib/pair-reasons.ts";

const AMC_ONDO = "0x1d7B5e06fdbe4FD33f5C64C081E32B5d539751D0";
const GOPRO_BSTOCK = "0x1ECfda023C46cA216b5c620eF357A6D0C03951E6";
const SILVER_ONDO = "0x8b872732b07be325a8803CDB480D9d20B6f8d11B";
const ELSEWHERE = "0x000000000000000000000000000000000000beef";

test("the verified set is every tokenized stock and ETF in the pair universe", () => {
  assert.ok(stockTokenCount() > 500, String(stockTokenCount()));
  // Stock-token issuers' ETF-backed commodities are listed shares too.
  assert.equal(checkStockIdentity({ address: SILVER_ONDO, chainId: 56, name: "iShares Silver Trust (Ondo Tokenized)", symbol: "SLVon" }).status, "verified");
});

test("the issuer's own contract on BNB Smart Chain is verified", () => {
  const amc = checkStockIdentity({ address: AMC_ONDO.toLowerCase(), chainId: 56, name: "AMC Entertainment (Ondo Tokenized)", symbol: "AMCon" });
  assert.equal(amc.status, "verified");
  assert.equal(amc.official.underlying, "AMC");
  // The same address on another chain is not the issuer's token.
  assert.equal(checkStockIdentity({ address: AMC_ONDO, chainId: 97, name: "AMC Entertainment (Ondo Tokenized)", symbol: "AMCon" }).status, "imitation");
});

test("imitations copy a stock token's symbol or a company's name and ticker; stock-token wording is unverified", () => {
  const symbol = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "Totally GoPro", symbol: "GPROB" });
  assert.equal(symbol.status, "imitation");
  assert.equal(symbol.reason, "TOKEN_SYMBOL");
  assert.equal(symbol.official.address, GOPRO_BSTOCK);

  // The Farmmi pattern: a stock with no real BNB token, dressed up as one.
  for (const name of ["Farmmi xStock", "Farmmi Stock Token", "Farmmi (Ondo Tokenized)", "Tokenized Stock Farmmi", "FAMI bStock"]) {
    const fake = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol: "FAMI" });
    assert.equal(fake.status, "unverified", name);
    assert.equal(fake.reason, "STOCK_NAMING", name);
  }

  const copy = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "GoPro, Inc.", symbol: "GPRO" });
  assert.equal(copy.status, "imitation");
  assert.equal(copy.reason, "NAME_AND_TICKER");
  assert.equal(copy.official.symbol, "GPROB");
});

test("punctuation and invisible format characters cannot bypass counterfeit checks", () => {
  for (const [name, symbol, status, reason] of [
    ["Totally GoPro", "GPRO-B", "imitation", "TOKEN_SYMBOL"],
    ["Farmmi x-stock", "FAMI", "unverified", "STOCK_NAMING"],
    ["Farmmi stock-token", "FAMI", "unverified", "STOCK_NAMING"],
    ["Tokenized\u200bstock Farmmi", "FAMI", "unverified", "STOCK_NAMING"],
    ["Ｆａｒｍｍｉ ＸＳｔｏｃｋ", "FAMI", "unverified", "STOCK_NAMING"],
  ]) {
    const fake = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol });
    assert.equal(fake.status, status, `${name} ${symbol}`);
    assert.equal(fake.reason, reason, `${name} ${symbol}`);
  }

  const disguisedTicker = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "AMC Entertainment", symbol: "A.M.C" });
  assert.equal(disguisedTicker.status, "imitation");
  assert.equal(disguisedTicker.reason, "NAME_AND_TICKER");
});

test("plural, glued and bracketed stock-token labels are unverified; ordinary words are not", () => {
  for (const name of [
    "Farmmi xStocks",
    "Farmmi Stock Tokens",
    "Tokenized Shares of Farmmi",
    "Farmmi Tokenized ETF",
    "Farmmi Robinhood Stocks",
    "FarmmiStockToken",
    "FARMMIXSTOCK",
    "FarmmixStock",
    "xStockFarmmi",
    "FAMIxStockOfficial",
    "Farmmi (Ondo)",
  ]) {
    assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol: "FAMI" }).status, "unverified", name);
  }
  for (const [name, symbol] of [["Max Stock", "MAX"], ["Web Stock", "WEB"], ["MetaStocks", "MTSKS"], ["Ondo", "ONDO"], ["Ondo U.S. Dollar Yield", "USDY"], ["Stockholm Token", "STHLM"]]) {
    assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol }).status, "none", `${name} ${symbol}`);
  }
});

test("issuer tokens Fortune has not reviewed are unverified, never imitations", () => {
  // Real issuer contracts on BNB Smart Chain that are missing from the snapshot (same proxy families as verified ones).
  for (const [name, symbol] of [
    ["Vertiv Holdings Co xStock", "VRTx"],
    ["C3.ai (Ondo Tokenized Stock)", "AIon"],
    ["SK Hynix (Anchored Tokenized Stock)", "ASKHY"],
    ["SpaceX aStock", "aSPCX"],
    ["Apple aStock", "aAAPL"],
    ["Alibaba", "BABAB"],
  ]) {
    const unlisted = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol });
    assert.equal(unlisted.status, "unverified", `${name} ${symbol}`);
    assert.equal(unlisted.reason, "STOCK_NAMING", `${name} ${symbol}`);
  }
  // A company's name with an issuer-style symbol names the verified token.
  const styled = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "AMC Entertainment", symbol: "AMCON" });
  assert.equal(styled.status, "unverified");
  assert.equal(styled.official.address, AMC_ONDO);
});

test("crypto tokens that share an issuer symbol's letters are not imitations", () => {
  // Issuers write "Ton" (AT&T), "LIon" (Li Auto), "WMTx" (Walmart), "Vx" (Visa), "BACon" (Bank of America).
  for (const [name, symbol] of [
    ["Toncoin", "TON"],
    ["Lion Token", "LION"],
    ["SOON Token", "SOON"],
    ["WorldMobileToken", "WMTX"],
    ["ViteX Coin", "VX"],
    ["BaconDAO", "BACON"],
    ["Giggle Mascot", "MAX"],
    ["MetaXCosmos", "METAX"],
    ["MetaBullish", "MetaB"],
    ["Primex Finance", "PMX"],
    ["Vameon", "VON"],
  ]) {
    assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol }).status, "none", `${name} ${symbol}`);
  }
  const exact = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "AT&T", symbol: "Ton" });
  assert.equal(exact.status, "imitation");
  assert.equal(exact.reason, "TOKEN_SYMBOL");
  // A name that is only the ticker is an overlap; a company's own name with its ticker is not.
  assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "OPEN", symbol: "OPEN" }).status, "overlap");
  assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "Meta", symbol: "META" }).status, "overlap");
  const disney = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "Disney", symbol: "DIS" });
  assert.equal(disney.status, "imitation");
  assert.equal(disney.reason, "NAME_AND_TICKER");
});

test("a shared name or ticker alone is a warning, and short tickers or unrelated tokens pass", () => {
  const meme = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "A Meme Coin", symbol: "AMC" });
  assert.equal(meme.status, "overlap");
  assert.equal(meme.official.underlying, "AMC");
  assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "GoPro", symbol: "GOPROFAN" }).status, "overlap");
  for (const [name, symbol] of [["PancakeSwap Token", "CAKE"], ["Tether USD", "USDT"], ["AI Agent", "AI"], ["Fortune Test Share", "tSHARE"], ["Wrapped BNB", "WBNB"]]) {
    assert.equal(checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol }).status, "none", `${name} ${symbol}`);
  }
  assert.equal(companyKey("NVIDIA Corp"), companyKey("NVIDIA"));
  assert.equal(companyKey("AMC Entertainment (Ondo Tokenized)"), "amc entertainment");
});

test("inspector findings for stock identity have plain-language text", () => {
  for (const code of ["VERIFIED_STOCK_TOKEN", "IMITATES_STOCK_TOKEN", "UNVERIFIED_STOCK_TOKEN", "SHARES_STOCK_NAME"]) {
    assert.ok(FINDING_TEXT[code]?.title && FINDING_TEXT[code]?.detail, code);
  }
});

test("penny stocks: common stocks under $5, never leveraged funds or ETFs", () => {
  const row = (overrides) => ({ group: "stocks", kind: "stock", name: "AMC Entertainment", leveraged: false, market: { priceUsd: 2.94 }, ...overrides });
  assert.equal(PENNY_MAX_USD, 5);
  assert.equal(isPennyStock(row({})), true);
  assert.equal(isPennyStock(row({ market: { priceUsd: 5 } })), false);
  assert.equal(isPennyStock(row({ market: { priceUsd: null } })), false);
  assert.equal(isPennyStock(row({ market: { priceUsd: 0 } })), false);
  assert.equal(isPennyStock(row({ kind: "etf" })), false);
  assert.equal(isPennyStock(row({ leveraged: true })), false);
  assert.equal(isPennyStock(row({ group: "crypto", kind: "token" })), false);
  assert.equal(isPennyStock(row({ name: "Ondo High Income Powered by BlackRock" })), false);
});
