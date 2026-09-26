import test from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import snapshot from "../../data/pair-universe.json" with { type: "json" };
import { buildUniverse, preIpoIssuer } from "../../lib/pair-universe.ts";
import { usMarketStatus, formatEtTime } from "../../lib/market-hours.ts";

const at = (iso) => Date.parse(iso);

test("US sessions follow New York time across DST and the NYSE calendar", () => {
  const friday = usMarketStatus(at("2026-09-25T23:00:00Z")); // Fri 7:00 p.m. EDT
  assert.equal(friday.session, "after");
  assert.equal(friday.nextChange, at("2026-09-26T00:00:00Z"));
  assert.equal(friday.nextSession, "closed");

  const saturday = usMarketStatus(at("2026-09-26T15:00:00Z"));
  assert.equal(saturday.session, "closed");
  assert.equal(saturday.closedReason, "weekend");
  assert.equal(saturday.nextChange, at("2026-09-28T08:00:00Z"), "Monday 4:00 a.m. EDT pre-market");

  const monday = usMarketStatus(at("2026-09-28T14:00:00Z"));
  assert.equal(monday.session, "regular");
  assert.equal(monday.nextChange, at("2026-09-28T20:00:00Z"));

  // First trading day after each DST switch opens pre-market at 4:00 local.
  assert.equal(usMarketStatus(at("2026-03-09T13:00:00Z")).session, "pre"); // 9:00 EDT
  assert.equal(usMarketStatus(at("2026-03-09T13:00:00Z")).nextChange, at("2026-03-09T13:30:00Z"));
  assert.equal(usMarketStatus(at("2026-11-02T14:00:00Z")).session, "pre"); // 9:00 EST
  assert.equal(usMarketStatus(at("2026-11-02T14:00:00Z")).nextChange, at("2026-11-02T14:30:00Z"));

  const thanksgiving = usMarketStatus(at("2026-11-26T15:00:00Z"));
  assert.equal(thanksgiving.closedReason, "holiday");
  assert.equal(thanksgiving.holiday, "Thanksgiving Day");
  assert.equal(thanksgiving.nextChange, at("2026-11-27T09:00:00Z"));

  const blackFriday = usMarketStatus(at("2026-11-27T18:30:00Z")); // 1:30 p.m. EST, early close
  assert.equal(blackFriday.session, "after");
  assert.equal(blackFriday.earlyClose, true);
  assert.equal(blackFriday.nextChange, at("2026-11-27T22:00:00Z"));

  assert.equal(usMarketStatus(at("2026-07-03T15:00:00Z")).holiday, "Independence Day (observed)");

  const newYearsEve = usMarketStatus(at("2027-01-01T02:00:00Z")); // Thu 9:00 p.m. EST, then a holiday
  assert.equal(newYearsEve.session, "closed");
  assert.equal(newYearsEve.nextChange, at("2027-01-04T09:00:00Z"), "skips the New Year holiday and the weekend");

  const beyond = usMarketStatus(at("2028-03-01T15:00:00Z"));
  assert.equal(beyond.calendarKnown, false);
});

test("ET labels include the weekday only when the change is on another day", () => {
  const now = at("2026-09-28T14:00:00Z");
  assert.equal(formatEtTime(at("2026-09-28T20:00:00Z"), now), "4:00 PM ET");
  assert.equal(formatEtTime(at("2026-09-29T08:00:00Z"), now), "Tue 4:00 AM ET");
});

test("pre-IPO listings split company and issuer", () => {
  assert.deepEqual(preIpoIssuer("OpenAI (Republic Pre-IPO)"), { company: "OpenAI", issuer: "Republic" });
  assert.deepEqual(preIpoIssuer("Kalshi PreStocks"), { company: "Kalshi", issuer: "PreStocks" });
  assert.deepEqual(preIpoIssuer("SpaceX (Tessera Pre-IPO)"), { company: "SpaceX", issuer: "Tessera" });
  assert.deepEqual(preIpoIssuer("Something else"), { company: "Something else", issuer: null });
});

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const NVDAB = "0x02FcA66C1D1Afb4e2a7884261Eb00F63598a7436";
const NVDAX = "0xc845b2894dBddd03858fd2D643B4eF725fE0849d";
const PPOLY = "0x1D80392D12CAAaF9E333Bb0bb7f021eaCf297Fe6";
const FUSD = "0x1bDcF1500866E273Cb11E99cC1832Aa2436Db17d";

const fixtures = [
  { id: "wbnb", symbol: "WBNB", name: "Wrapped BNB", group: "crypto", kind: "token", provider: null, underlying: null, address: WBNB, decimals: 18, controls: { upgradeable: false, pausable: false, rebasing: false }, image: null, source: "coingecko:wbnb", firstSeen: null },
  { id: "usdt", symbol: "USDT", name: "Tether USD", group: "crypto", kind: "token", provider: null, underlying: null, address: USDT, decimals: 18, controls: { upgradeable: false, pausable: false, rebasing: false }, image: null, source: "coingecko:usdt", firstSeen: "2026-09-20" },
  { id: "nvdab", symbol: "NVDAB", name: "NVIDIA", group: "stocks", kind: "stock", provider: "bStocks", underlying: "NVDA", address: NVDAB, decimals: 18, controls: { upgradeable: true, pausable: false, rebasing: false }, image: null, source: "coingecko:nvdab", firstSeen: null },
  { id: "nvdax", symbol: "NVDAx", name: "NVIDIA", group: "stocks", kind: "stock", provider: "xStocks", underlying: "NVDA", address: NVDAX, decimals: 18, controls: { upgradeable: true, pausable: false, rebasing: true }, image: null, source: "coingecko:nvdax", firstSeen: null },
  { id: "ppoly", symbol: "pPOLY", name: "Polymarket", group: "preipo", kind: "spv", provider: "Paimon", underlying: "Polymarket", address: PPOLY, decimals: 18, controls: { upgradeable: false, pausable: true, rebasing: false }, image: null, source: "coinmarketcap:ppoly", firstSeen: null },
];

function registryAsset(address, overrides = {}) {
  return { address, name: "Asset", symbol: "ASSET", decimals: 18, category: "Test", oracle: address, maxOracleAge: 600, active: true, quoteEnabled: true, rewardEnabled: false, graduationEnabled: true, healthy: true, healthReason: "OK", priceUsd1e18: "1000000000000000000", updatedAt: 0, launchable: true, ...overrides };
}

const market = (volume24h) => ({ priceUsd: 1, change24h: 0, volume24h, marketCap: null });

test("on testnet, only the active registry is launchable and mainnet listings say so", () => {
  const { items, featured } = buildUniverse({
    assets: fixtures,
    coingecko: new Map([["wbnb", market(5e8)], ["usdt", market(9e8)], ["nvdab", market(2e7)], ["nvdax", market(5e5)]]),
    dexscreener: new Map([[PPOLY.toLowerCase(), market(3e6)]]),
    registry: { configured: true, chainId: 97, assets: [registryAsset(FUSD, { symbol: "fUSD" })] },
    lighter: [{ symbol: "ANTHROPIC", active: true, price: 2126, change24h: 1, volume24h: 8e5 }],
    preIpo: [{ id: "kalshi-prestocks", symbol: "KALSHI", name: "Kalshi PreStocks", image: null, market: market(2e4) }],
    now: at("2026-09-25T12:00:00Z"),
  });
  const by = (symbol) => items.find((item) => item.symbol === symbol);

  assert.equal(items[0].symbol, "fUSD", "launchable assets sort first");
  assert.equal(by("fUSD").fortune.status, "launchable");
  assert.equal(featured[0], by("fUSD").id);
  assert.deepEqual(by("WBNB").fortune, { status: "discovery", reasons: ["MAINNET_ONLY"] });
  assert.deepEqual(by("NVDAB").fortune.reasons, ["MAINNET_ONLY", "RWA_OUT_OF_SCOPE_V1"]);
  assert.deepEqual(by("NVDAx").fortune.reasons, ["MAINNET_ONLY", "RWA_OUT_OF_SCOPE_V1", "REBASING_NEEDS_WRAPPER"]);
  assert.equal(by("pPOLY").market.source, "dexscreener");
  assert.match(by("pPOLY").notice, /no shares, voting, dividend/);
  assert.equal(by("ANTHROPIC").fortune.status, "reference");
  assert.deepEqual(by("ANTHROPIC").fortune.reasons, ["EXTERNAL_PERP_REFERENCE"]);
  assert.match(by("ANTHROPIC").notice, /void/);
  assert.equal(by("KALSHI").name, "Kalshi");
  assert.equal(by("KALSHI").provider, "PreStocks");
  assert.deepEqual(by("KALSHI").fortune.reasons, ["NOT_ON_BNB_CHAIN"]);

  assert.equal(by("USDT").isNew, true, "first seen five days earlier");
  assert.equal(by("WBNB").isNew, false);
  assert.equal(by("USDT").hot, true);
  assert.equal(by("NVDAx").hot, false, "under $1M of volume is never hot");
  assert.equal(by("ANTHROPIC").hot, false, "references without a BNB contract are never hot");
});

test("on mainnet, a registered WBNB is launchable once and everything else stays discovery", () => {
  const { items } = buildUniverse({
    assets: fixtures,
    coingecko: new Map(),
    dexscreener: new Map(),
    registry: { configured: true, chainId: 56, assets: [registryAsset(WBNB, { symbol: "WBNB" })] },
    lighter: [],
    preIpo: [],
    now: at("2026-09-25T12:00:00Z"),
  });
  assert.equal(items.filter((item) => item.address?.toLowerCase() === WBNB.toLowerCase()).length, 1);
  const wbnb = items.find((item) => item.symbol === "WBNB");
  assert.deepEqual(wbnb.fortune, { status: "launchable", reasons: [] });
  const usdt = items.find((item) => item.symbol === "USDT");
  assert.deepEqual(usdt.fortune.reasons, ["NOT_IN_ACTIVE_REGISTRY", "STANDARD_MAINNET_WBNB_ONLY"]);
  const stock = items.find((item) => item.symbol === "NVDAB");
  assert.deepEqual(stock.fortune.reasons, ["NOT_IN_ACTIVE_REGISTRY", "RWA_OUT_OF_SCOPE_V1", "STANDARD_MAINNET_WBNB_ONLY"]);
});

test("an unhealthy registry asset is shown as registered with the registry's reasons", () => {
  const { items } = buildUniverse({
    assets: [],
    coingecko: new Map(),
    dexscreener: new Map(),
    registry: { configured: true, chainId: 97, assets: [registryAsset(FUSD, { symbol: "fUSD", healthy: false })] },
    lighter: [],
    preIpo: [],
    now: Date.now(),
  });
  assert.equal(items[0].fortune.status, "registered");
  assert.deepEqual(items[0].fortune.reasons, ["ORACLE_UNHEALTHY"]);
});

test("the committed snapshot is well formed and keeps policy-critical facts", () => {
  const ids = new Set();
  const addresses = new Set();
  for (const asset of snapshot.assets) {
    assert.equal(asset.address, getAddress(asset.address), `${asset.id} address is checksummed`);
    assert.ok(!ids.has(asset.id), `${asset.id} is unique`);
    assert.ok(!addresses.has(asset.address.toLowerCase()), `${asset.address} is unique`);
    ids.add(asset.id);
    addresses.add(asset.address.toLowerCase());
    assert.ok(["crypto", "stocks", "rwa", "preipo"].includes(asset.group), asset.id);
    assert.ok(Number.isInteger(asset.decimals) && asset.decimals >= 0 && asset.decimals <= 36, asset.id);
    if (asset.group === "stocks") assert.ok(["bStocks", "Ondo", "xStocks"].includes(asset.provider), asset.id);
    // xStocks apply a share multiplier; Fortune must keep flagging it until a wrapper is used.
    if (asset.provider === "xStocks") assert.equal(asset.controls.rebasing, true, asset.id);
  }
  assert.ok(snapshot.assets.some((asset) => asset.id === "wbnb" && asset.address === "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"));
  assert.ok(snapshot.assets.filter((asset) => asset.group === "stocks").length > 100);
});

test("only CoinGecko image hosts reach the browser", async () => {
  const { safeImage } = await import("../../lib/pair-universe.ts");
  assert.equal(safeImage("https://coin-images.coingecko.com/coins/images/1/large/a.png"), "https://coin-images.coingecko.com/coins/images/1/small/a.png");
  assert.equal(safeImage("https://assets.coingecko.com/coins/images/1/small/a.png"), "https://assets.coingecko.com/coins/images/1/small/a.png");
  assert.equal(safeImage("https://tracker.example/pixel.png"), null);
  assert.equal(safeImage("http://coin-images.coingecko.com/a.png"), null);
  assert.equal(safeImage("javascript:alert(1)"), null);
  assert.equal(safeImage(null), null);
});
