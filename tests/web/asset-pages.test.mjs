import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../../data/pair-universe.json" with { type: "json" };
import { buildUniverse, issuerSiblings, snapshotAsset, universePageIds } from "../../lib/pair-universe.ts";
import { CONTROL_TEXT, REASON_TEXT, tracksUsSession } from "../../lib/pair-reasons.ts";
import { sessionLine, usMarketStatus } from "../../lib/market-hours.ts";

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FUSD = "0x1bDcF1500866E273Cb11E99cC1832Aa2436Db17d";
const registryAsset = (address, overrides = {}) => ({
  address, name: "Asset", symbol: "ASSET", decimals: 18, category: "Test", oracle: address, maxOracleAge: 600, active: true, quoteEnabled: true,
  rewardEnabled: false, graduationEnabled: true, healthy: true, healthReason: "OK", priceUsd1e18: "1000000000000000000", updatedAt: 0, launchable: true, ...overrides,
});

test("every snapshot asset has a URL-safe page id", () => {
  const ids = universePageIds();
  assert.equal(ids.length, snapshot.assets.length);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/, id);
  assert.equal(snapshotAsset("nvidia-bstocks").symbol, "NVDAB");
  assert.equal(snapshotAsset("not-an-asset"), null);
});

test("issuer siblings compare the same underlying across issuers only", () => {
  const nvdab = snapshot.assets.find((asset) => asset.id === "nvidia-bstocks");
  const siblings = issuerSiblings(snapshot.assets, nvdab).map((asset) => asset.symbol).sort();
  assert.deepEqual(siblings, ["NVDAon", "NVDAx"]);

  const row = (id, underlying, leveraged = false, address = "0x1") => ({ id, underlying, leveraged, address });
  const items = [row("a", "QQQ"), row("b", "qqq"), row("c", "QQQ", true), row("d", "QQQ", false, null), row("e", null)];
  assert.deepEqual(issuerSiblings(items, items[0]).map((item) => item.id), ["b"], "case-insensitive, no leveraged mix, contracts only");
  assert.deepEqual(issuerSiblings(items, items[2]).map((item) => item.id), [], "leveraged products compare only with each other");
  assert.deepEqual(issuerSiblings(items, items[4]), [], "no underlying, no comparison");
});

test("every eligibility reason Fortune can show has plain-language text", () => {
  const scenarios = [
    { configured: true, chainId: 97, assets: [registryAsset(FUSD, { symbol: "fUSD" })] },
    { configured: true, chainId: 97, assets: [registryAsset(FUSD, { symbol: "fUSD", healthy: false })] },
    { configured: true, chainId: 56, assets: [registryAsset(WBNB, { symbol: "WBNB" })] },
    { configured: false, chainId: 56, assets: [] },
  ];
  const reasons = new Set();
  for (const registry of scenarios) {
    const { items } = buildUniverse({
      assets: snapshot.assets,
      coingecko: new Map(),
      dexscreener: new Map(),
      registry,
      lighter: [{ symbol: "OPENAI", active: true, price: 1, change24h: 0, volume24h: 1 }],
      preIpo: [{ id: "kalshi-prestocks", symbol: "KALSHI", name: "Kalshi PreStocks", image: null, market: { priceUsd: 1, change24h: 0, volume24h: 1, marketCap: null } }],
      now: Date.parse("2026-09-26T00:00:00Z"),
    });
    for (const item of items) for (const reason of item.fortune.reasons) reasons.add(reason);
  }
  assert.ok(reasons.size >= 5, "the scenarios exercise several reasons");
  for (const reason of reasons) assert.ok(REASON_TEXT[reason], `missing text for ${reason}`);
  for (const control of Object.values(CONTROL_TEXT)) assert.ok(control.on && control.off);
});

test("the US session line reads naturally in English and Chinese", () => {
  const saturday = Date.parse("2026-09-26T15:00:00Z");
  const status = usMarketStatus(saturday);
  assert.match(sessionLine(status, false, saturday), /^US market closed · pre-market /);
  assert.match(sessionLine(status, true, saturday), /^美股休市 · .+ 盘前开始$/);
  const open = Date.parse("2026-09-28T14:00:00Z");
  assert.match(sessionLine(usMarketStatus(open), false, open), /^US market open · closes /);
});

test("only assets that follow a US listing show market hours", () => {
  assert.equal(tracksUsSession({ kind: "stock", provider: "bStocks" }), true);
  assert.equal(tracksUsSession({ kind: "etf", provider: "Ondo" }), true);
  assert.equal(tracksUsSession({ kind: "commodity", provider: "Ondo" }), true, "a token wrapping a listed gold ETF");
  assert.equal(tracksUsSession({ kind: "commodity", provider: "Tether" }), false, "physical gold trades around the clock");
  assert.equal(tracksUsSession({ kind: "spv", provider: "Paimon" }), false, "pre-IPO claims have no listing");
  assert.equal(tracksUsSession({ kind: "token", provider: null }), false);
});
