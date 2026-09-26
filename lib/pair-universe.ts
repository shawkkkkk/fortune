// Server-side pair universe: every asset a Fortune launch could pair with on
// BNB Smart Chain, with live market data and Fortune's own launchability.
//
// Identity comes from data/pair-universe.json (addresses checked onchain by
// scripts/refresh-pair-universe.mjs); prices come live from public market APIs;
// launchability comes only from the active onchain Asset Registry and the
// release asset policy. Discovery never implies approval.

import snapshot from "@/data/pair-universe.json";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { readFortuneAssetUniverse, type FortuneRegistryAsset } from "@/lib/onchain-assets";
import { pairEligibility, STANDARD_MAINNET_QUOTE } from "@/lib/pair-policy";

export type UniverseGroup = "crypto" | "stocks" | "rwa" | "preipo";
export type UniverseKind = "token" | "stock" | "etf" | "commodity" | "spv" | "perp" | "offchain";
export type UniverseStatus = "launchable" | "registered" | "discovery" | "reference";

export type UniverseAsset = {
  id: string;
  symbol: string;
  name: string;
  group: UniverseGroup;
  kind: UniverseKind;
  provider: string | null;
  underlying: string | null;
  leveraged: boolean;
  /** Chain the contract lives on; null for offchain or other-chain references. */
  chainId: number | null;
  address: string | null;
  decimals: number | null;
  controls: { upgradeable: boolean; pausable: boolean; rebasing: boolean } | null;
  image: string | null;
  venue: string | null;
  market: {
    priceUsd: number | null;
    change24h: number | null;
    volume24h: number | null;
    marketCap: number | null;
    source: "coingecko" | "dexscreener" | "lighter" | "registry" | null;
  };
  hot: boolean;
  isNew: boolean;
  fortune: { status: UniverseStatus; reasons: string[] };
  notice: string | null;
  noticeSource: string | null;
};

type SnapshotAsset = {
  id: string;
  symbol: string;
  name: string;
  group: string;
  kind: string;
  provider: string | null;
  underlying: string | null;
  leveraged?: boolean;
  address: string;
  decimals: number;
  controls: { upgradeable: boolean; pausable: boolean; rebasing: boolean };
  image: string | null;
  source: string;
  firstSeen: string | null;
};

export type MarketRow = {
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  image?: string | null;
};

export type LighterMarket = { symbol: string; active: boolean; price: number | null; change24h: number | null; volume24h: number | null };
export type PreIpoListing = { id: string; symbol: string; name: string; image: string | null; market: MarketRow };

type RegistryRead = { configured: boolean; chainId: number; assets: FortuneRegistryAsset[] };

const COINGECKO = "https://api.coingecko.com/api/v3";
const MARKET_CATEGORIES: Array<[string, number]> = [
  ["bstocks-ecosystem", 1],
  ["ondo-tokenized-assets", 2],
  ["xstocks-ecosystem", 1],
  ["tokenized-gold", 1],
  ["binance-smart-chain", 1],
];
const PRE_IPO_CATEGORY = "tokenized-pre-ipo-stocks";
const LIGHTER_BASES = ["https://mainnet.zklighter.elliot.ai", "https://api.rh.lighter.xyz"];
// Companies with an active Lighter pre-IPO perpetual used as a price reference.
const LIGHTER_PRE_IPO = ["OPENAI", "ANTHROPIC"];
const NEW_DAYS = 21;
const HOT_PER_GROUP = 6;
const HOT_MIN_VOLUME = 1_000_000;

// Company statements that change what a pre-IPO token can be worth.
export const PRE_IPO_NOTICES: Record<string, { text: string; source: string }> = {
  OpenAI: {
    text: "OpenAI and Anthropic have said share transfers to SPVs without their approval are void, and that tokens selling that exposure may have no value.",
    source: "https://www.coindesk.com/markets/2026/05/13/anthropic-openai-tokens-plunge-nearly-40-as-ai-firms-warn-spv-transfers-are-invalid",
  },
  Anthropic: {
    text: "Anthropic and OpenAI have said share transfers to SPVs without their approval are void, and that tokens selling that exposure may have no value.",
    source: "https://www.coindesk.com/markets/2026/05/13/anthropic-openai-tokens-plunge-nearly-40-as-ai-firms-warn-spv-transfers-are-invalid",
  },
};
export const SPV_NOTICE = {
  text: "SPV tokens give contractual or indirect economic exposure only: no shares, voting, dividend or information rights in the company.",
  source: "https://crypto.news/binance-wallet-opens-4-8m-ppoly-pre-access-event/",
};

const FEATURED_IDS = [
  "wbnb",
  "binance-bridged-usdt-bnb-smart-chain",
  "binance-bridged-usdc-bnb-smart-chain",
  "usd1-wlfi",
  "binance-bitcoin",
  "binance-peg-weth",
];

// Logos are rendered by browsers, so only CoinGecko's own image hosts are passed through.
export function safeImage(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.replace("/large/", "/small/"));
    return url.protocol === "https:" && (url.hostname === "coin-images.coingecko.com" || url.hostname === "assets.coingecko.com") ? url.href : null;
  } catch {
    return null;
  }
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cgHeaders() {
  const key = process.env.COINGECKO_API_KEY;
  return { accept: "application/json", ...(key ? { "x-cg-demo-api-key": key } : {}) };
}

async function getJson(url: string, init: RequestInit & { next?: { revalidate: number } }) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${new URL(url).host} returned ${response.status}`);
  return response.json();
}

function cgRow(coin: Record<string, unknown>): MarketRow {
  return {
    priceUsd: finite(coin.current_price),
    change24h: finite(coin.price_change_percentage_24h),
    volume24h: finite(coin.total_volume),
    marketCap: finite(coin.market_cap) || null,
    image: safeImage(coin.image),
  };
}

/** Live CoinGecko rows keyed by CoinGecko id, plus which categories answered. */
export async function fetchCoinGeckoMarkets(ids: string[]) {
  const rows = new Map<string, MarketRow>();
  const requests = MARKET_CATEGORIES.flatMap(([category, pages]) =>
    Array.from({ length: pages }, (_, index) => ({ category, page: index + 1 })));
  const settled = await Promise.allSettled(requests.map(({ category, page }) =>
    getJson(`${COINGECKO}/coins/markets?vs_currency=usd&category=${category}&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=24h`,
      { headers: cgHeaders(), next: { revalidate: 300 } })));
  settled.forEach((result) => {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) return;
    for (const coin of result.value) if (typeof coin?.id === "string") rows.set(coin.id, cgRow(coin));
  });
  const missing = ids.filter((id) => !rows.has(id));
  for (let start = 0; start < missing.length && start < 200; start += 100) {
    try {
      const batch = await getJson(`${COINGECKO}/coins/markets?vs_currency=usd&ids=${missing.slice(start, start + 100).join(",")}&per_page=100&sparkline=false&price_change_percentage=24h`,
        { headers: cgHeaders(), next: { revalidate: 300 } });
      if (Array.isArray(batch)) for (const coin of batch) if (typeof coin?.id === "string") rows.set(coin.id, cgRow(coin));
    } catch { /* Leave these assets without live data. */ }
  }
  const answered = settled.filter((result) => result.status === "fulfilled").length;
  return { rows, complete: answered === requests.length };
}

/** DexScreener prices for BSC tokens CoinGecko does not track, keyed by lowercase address. */
export async function fetchDexScreener(addresses: string[]) {
  const rows = new Map<string, MarketRow>();
  for (let start = 0; start < addresses.length; start += 30) {
    const chunk = addresses.slice(start, start + 30);
    try {
      const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/bsc/${chunk.join(",")}`, { next: { revalidate: 300 } });
      if (!Array.isArray(pairs)) continue;
      for (const address of chunk) {
        const own = pairs
          .filter((pair) => String(pair?.baseToken?.address || "").toLowerCase() === address.toLowerCase())
          .sort((a, b) => (finite(b?.liquidity?.usd) ?? 0) - (finite(a?.liquidity?.usd) ?? 0));
        const best = own[0];
        if (!best) continue;
        rows.set(address.toLowerCase(), {
          priceUsd: finite(Number(best.priceUsd)),
          change24h: finite(best.priceChange?.h24),
          volume24h: own.reduce((sum, pair) => sum + (finite(pair?.volume?.h24) ?? 0), 0),
          marketCap: finite(best.marketCap) ?? finite(best.fdv),
        });
      }
    } catch { /* Leave these assets without live data. */ }
  }
  return rows;
}

export async function fetchLighterPreIpo(): Promise<LighterMarket[]> {
  for (const base of LIGHTER_BASES) {
    try {
      const body = await getJson(base + "/api/v1/orderBookDetails", { headers: { accept: "application/json" }, next: { revalidate: 60 } });
      const rows: Array<Record<string, unknown>> = Array.isArray(body?.order_book_details) ? body.order_book_details : [];
      return rows
        .filter((row) => LIGHTER_PRE_IPO.includes(String(row.symbol || "").toUpperCase()))
        .map((row) => ({
          symbol: String(row.symbol).toUpperCase(),
          active: String(row.status || "").toLowerCase() === "active",
          price: finite(Number(row.last_trade_price ?? row.mark_price)),
          change24h: finite(Number(row.daily_price_change)),
          volume24h: finite(Number(row.daily_quote_token_volume)),
        }));
    } catch { /* Try the next Lighter host. */ }
  }
  return [];
}

/** Pre-IPO tokens CoinGecko tracks on any chain (discovery references). */
export async function fetchPreIpoListings(): Promise<PreIpoListing[]> {
  const coins = await getJson(`${COINGECKO}/coins/markets?vs_currency=usd&category=${PRE_IPO_CATEGORY}&per_page=100&sparkline=false&price_change_percentage=24h`,
    { headers: cgHeaders(), next: { revalidate: 900 } });
  if (!Array.isArray(coins)) return [];
  return coins
    .filter((coin) => typeof coin?.id === "string" && typeof coin?.name === "string")
    .map((coin) => ({
      id: coin.id,
      symbol: String(coin.symbol || "").toUpperCase(),
      name: coin.name,
      image: safeImage(coin.image),
      market: cgRow(coin),
    }));
}

/** "OpenAI (Republic Pre-IPO)" → { company: "OpenAI", issuer: "Republic" }; "Kalshi PreStocks" → PreStocks. */
export function preIpoIssuer(name: string) {
  const bracket = name.match(/^(.*?)\s*\(([^)]+?)\s+Pre-IPO\)$/i);
  if (bracket) return { company: bracket[1].trim(), issuer: bracket[2].trim() };
  const suffix = name.match(/^(.*?)\s+(PreStocks)$/i);
  if (suffix) return { company: suffix[1].trim(), issuer: "PreStocks" };
  return { company: name.trim(), issuer: null };
}

function statusFor(asset: { group: UniverseGroup; chainId: number | null; address: string | null; controls: UniverseAsset["controls"] }, registry: FortuneRegistryAsset | undefined, activeChainId: number) {
  if (registry) {
    const verdict = pairEligibility(registry, activeChainId);
    return { status: (verdict.eligible ? "launchable" : "registered") as UniverseStatus, reasons: verdict.reasons };
  }
  const reasons: string[] = [];
  if (asset.chainId === 56 && activeChainId !== 56) reasons.push("MAINNET_ONLY");
  else reasons.push("NOT_IN_ACTIVE_REGISTRY");
  if (asset.group !== "crypto") reasons.push("RWA_OUT_OF_SCOPE_V1");
  if (asset.controls?.rebasing) reasons.push("REBASING_NEEDS_WRAPPER");
  if (activeChainId === 56 && asset.address?.toLowerCase() !== STANDARD_MAINNET_QUOTE) reasons.push("STANDARD_MAINNET_WBNB_ONLY");
  return { status: "discovery" as UniverseStatus, reasons };
}

function isRecent(firstSeen: string | null | undefined, now: number) {
  if (!firstSeen) return false;
  const seen = Date.parse(firstSeen + "T00:00:00Z");
  return Number.isFinite(seen) && now - seen <= NEW_DAYS * 86_400_000;
}

export type UniverseInputs = {
  assets: SnapshotAsset[];
  coingecko: Map<string, MarketRow>;
  dexscreener: Map<string, MarketRow>;
  registry: RegistryRead;
  lighter: LighterMarket[];
  preIpo: PreIpoListing[];
  now: number;
};

/** Pure merge of identity, live data and registry state. */
export function buildUniverse(input: UniverseInputs) {
  const activeChainId = input.registry.chainId;
  const registryByAddress = new Map(input.registry.assets.map((asset) => [asset.address.toLowerCase(), asset]));
  const listed = new Set<string>();
  const items: UniverseAsset[] = [];

  // Registry assets that are not BNB mainnet listings (e.g. testnet fUSD) come first.
  for (const asset of input.registry.assets) {
    const key = asset.address.toLowerCase();
    if (input.assets.some((item) => item.address.toLowerCase() === key && activeChainId === 56)) continue;
    const price = Number(asset.priceUsd1e18) / 1e18;
    items.push({
      id: `registry:${activeChainId}:${key}`,
      symbol: asset.symbol,
      name: asset.name,
      group: "crypto",
      kind: "token",
      provider: "Fortune registry",
      underlying: null,
      leveraged: false,
      chainId: activeChainId,
      address: asset.address,
      decimals: asset.decimals,
      controls: null,
      image: null,
      venue: null,
      market: { priceUsd: Number.isFinite(price) && price > 0 ? price : null, change24h: null, volume24h: null, marketCap: null, source: "registry" },
      hot: false,
      isNew: false,
      fortune: statusFor({ group: "crypto", chainId: activeChainId, address: asset.address, controls: null }, asset, activeChainId),
      notice: null,
      noticeSource: null,
    });
    listed.add(key);
  }

  for (const asset of input.assets) {
    const key = asset.address.toLowerCase();
    if (listed.has(key)) continue;
    const live = input.coingecko.get(asset.id) ?? input.dexscreener.get(key) ?? null;
    const source = input.coingecko.has(asset.id) ? "coingecko" : input.dexscreener.has(key) ? "dexscreener" : null;
    const group = asset.group as UniverseGroup;
    const controls = asset.controls;
    items.push({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      group,
      kind: asset.kind as UniverseKind,
      provider: asset.provider ?? null,
      underlying: asset.underlying ?? null,
      leveraged: Boolean(asset.leveraged),
      chainId: 56,
      address: asset.address,
      decimals: asset.decimals,
      controls,
      image: live?.image ?? safeImage(asset.image),
      venue: null,
      market: {
        priceUsd: live?.priceUsd ?? null,
        change24h: live?.change24h ?? null,
        volume24h: live?.volume24h ?? null,
        marketCap: live?.marketCap ?? null,
        source,
      },
      hot: false,
      isNew: isRecent(asset.firstSeen, input.now),
      fortune: statusFor({ group, chainId: 56, address: asset.address, controls }, activeChainId === 56 ? registryByAddress.get(key) : undefined, activeChainId),
      notice: group === "preipo" ? SPV_NOTICE.text : null,
      noticeSource: group === "preipo" ? SPV_NOTICE.source : null,
    });
    listed.add(key);
  }

  for (const market of input.lighter) {
    const company = market.symbol === "OPENAI" ? "OpenAI" : market.symbol === "ANTHROPIC" ? "Anthropic" : market.symbol;
    items.push({
      id: `lighter:${market.symbol.toLowerCase()}`,
      symbol: market.symbol,
      name: company,
      group: "preipo",
      kind: "perp",
      provider: "Lighter",
      underlying: company,
      leveraged: false,
      chainId: null,
      address: null,
      decimals: null,
      controls: null,
      image: null,
      venue: market.active ? "Lighter perpetual" : "Lighter perpetual · inactive",
      market: { priceUsd: market.price, change24h: market.change24h, volume24h: market.volume24h, marketCap: null, source: "lighter" },
      hot: false,
      isNew: false,
      fortune: { status: "reference", reasons: ["EXTERNAL_PERP_REFERENCE"] },
      notice: PRE_IPO_NOTICES[company]?.text ?? null,
      noticeSource: PRE_IPO_NOTICES[company]?.source ?? null,
    });
  }

  for (const listing of input.preIpo) {
    const { company, issuer } = preIpoIssuer(listing.name);
    items.push({
      id: listing.id,
      symbol: listing.symbol,
      name: company,
      group: "preipo",
      kind: "offchain",
      provider: issuer,
      underlying: company,
      leveraged: false,
      chainId: null,
      address: null,
      decimals: null,
      controls: null,
      image: listing.image,
      venue: "Not on BNB Chain",
      market: { ...listing.market, source: "coingecko" },
      hot: false,
      isNew: false,
      fortune: { status: "reference", reasons: ["NOT_ON_BNB_CHAIN"] },
      notice: PRE_IPO_NOTICES[company]?.text ?? SPV_NOTICE.text,
      noticeSource: PRE_IPO_NOTICES[company]?.source ?? SPV_NOTICE.source,
    });
  }

  // HOT: the busiest few BNB Chain assets per group by 24h volume.
  for (const group of ["crypto", "stocks", "rwa", "preipo"] as const) {
    items
      .filter((item) => item.group === group && item.address && (item.market.volume24h ?? 0) >= HOT_MIN_VOLUME)
      .sort((a, b) => (b.market.volume24h ?? 0) - (a.market.volume24h ?? 0))
      .slice(0, HOT_PER_GROUP)
      .forEach((item) => { item.hot = true; });
  }

  const byVolume = (a: UniverseAsset, b: UniverseAsset) =>
    Number(b.fortune.status === "launchable") - Number(a.fortune.status === "launchable") ||
    Number(Boolean(b.address)) - Number(Boolean(a.address)) ||
    (b.market.volume24h ?? -1) - (a.market.volume24h ?? -1) ||
    (b.market.marketCap ?? -1) - (a.market.marketCap ?? -1) ||
    a.symbol.localeCompare(b.symbol);
  items.sort(byVolume);

  const topStocks = items.filter((item) => item.group === "stocks" && item.market.volume24h !== null).slice(0, 4).map((item) => item.id);
  const featured = [
    ...items.filter((item) => item.fortune.status === "launchable" || item.fortune.status === "registered").map((item) => item.id),
    ...FEATURED_IDS.filter((id) => items.some((item) => item.id === id)),
    ...topStocks,
    ...items.filter((item) => item.group === "rwa").slice(0, 1).map((item) => item.id),
    ...items.filter((item) => item.group === "preipo" && item.chainId === 56).map((item) => item.id),
  ];

  return { items, featured: [...new Set(featured)] };
}

export async function readPairUniverse(now = Date.now()) {
  const assets = snapshot.assets as unknown as SnapshotAsset[];
  const coingeckoIds = assets.filter((asset) => asset.source.startsWith("coingecko:")).map((asset) => asset.id);
  const dexAddresses = assets.filter((asset) => !asset.source.startsWith("coingecko:")).map((asset) => asset.address);

  const [coingecko, dexscreener, registry, lighter, preIpo] = await Promise.allSettled([
    fetchCoinGeckoMarkets(coingeckoIds),
    fetchDexScreener(dexAddresses),
    readFortuneAssetUniverse(),
    fetchLighterPreIpo(),
    fetchPreIpoListings(),
  ]);

  const registryRead: RegistryRead = registry.status === "fulfilled"
    ? { configured: registry.value.configured, chainId: registry.value.chainId, assets: registry.value.assets }
    : { configured: false, chainId: FORTUNE_NETWORK.chainId, assets: [] };

  const { items, featured } = buildUniverse({
    assets,
    coingecko: coingecko.status === "fulfilled" ? coingecko.value.rows : new Map(),
    dexscreener: dexscreener.status === "fulfilled" ? dexscreener.value : new Map(),
    registry: registryRead,
    lighter: lighter.status === "fulfilled" ? lighter.value : [],
    preIpo: preIpo.status === "fulfilled" ? preIpo.value : [],
    now,
  });

  return {
    chainId: registryRead.chainId,
    snapshot: { generatedAt: snapshot.generatedAt, verifiedAtBlock: snapshot.verifiedAtBlock, chainId: snapshot.chainId },
    coverage: {
      registry: registry.status === "fulfilled" && registryRead.configured,
      marketData: coingecko.status === "fulfilled" && coingecko.value.complete,
      preIpoReferences: lighter.status === "fulfilled" && preIpo.status === "fulfilled",
    },
    featured,
    items,
  };
}
