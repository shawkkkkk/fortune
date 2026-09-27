import test from "node:test";
import assert from "node:assert/strict";
import { checkStockIdentity, companyKey, stockTokenCount } from "../../lib/stock-identity.ts";
import { FINDING_TEXT } from "../../lib/pair-inspector-text.ts";
import { PENNY_MAX_USD, isPennyStock } from "../../lib/pair-reasons.ts";

const AMC_ONDO = "0x1d7B5e06fdbe4FD33f5C64C081E32B5d539751D0";
const GOPRO_BSTOCK = "0x1ECfda023C46cA216b5c620eF357A6D0C03951E6";
const ELSEWHERE = "0x000000000000000000000000000000000000beef";

test("the verified set is every tokenized stock and ETF in the pair universe", () => {
  assert.ok(stockTokenCount() > 500, String(stockTokenCount()));
});

test("the issuer's own contract on BNB Smart Chain is verified", () => {
  const amc = checkStockIdentity({ address: AMC_ONDO.toLowerCase(), chainId: 56, name: "AMC Entertainment (Ondo Tokenized)", symbol: "AMCon" });
  assert.equal(amc.status, "verified");
  assert.equal(amc.official.underlying, "AMC");
  // The same address on another chain is not the issuer's token.
  assert.equal(checkStockIdentity({ address: AMC_ONDO, chainId: 97, name: "AMC Entertainment (Ondo Tokenized)", symbol: "AMCon" }).status, "imitation");
});

test("counterfeits: a stock token's ticker, stock-token wording, or a company's name and ticker together", () => {
  const symbol = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "Totally GoPro", symbol: "GPROB" });
  assert.equal(symbol.status, "imitation");
  assert.equal(symbol.reason, "TOKEN_SYMBOL");
  assert.equal(symbol.official.address, GOPRO_BSTOCK);

  // The Farmmi pattern: a stock with no real BNB token, dressed up as one.
  for (const name of ["Farmmi xStock", "Farmmi Stock Token", "Farmmi (Ondo Tokenized)", "Tokenized Stock Farmmi", "FAMI bStock"]) {
    const fake = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name, symbol: "FAMI" });
    assert.equal(fake.status, "imitation", name);
    assert.equal(fake.reason, "STOCK_NAMING", name);
  }

  const copy = checkStockIdentity({ address: ELSEWHERE, chainId: 56, name: "GoPro, Inc.", symbol: "GPRO" });
  assert.equal(copy.status, "imitation");
  assert.equal(copy.reason, "NAME_AND_TICKER");
  assert.equal(copy.official.symbol, "GPROB");
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
  for (const code of ["VERIFIED_STOCK_TOKEN", "IMITATES_STOCK_TOKEN", "SHARES_STOCK_NAME"]) {
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
