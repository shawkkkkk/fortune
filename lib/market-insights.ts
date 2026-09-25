import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { buildCanonicalChart, type CanonicalChartPoint } from "@/lib/canonical-chart";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { readFortuneAssetUniverse, type FortuneRegistryAsset } from "@/lib/onchain-assets";
import {
  readFortuneLaunchByToken,
  readRecentFortuneLaunches,
  type OnchainFortuneLaunch,
} from "@/lib/onchain-launches";
import {
  readOfficialPools,
  readPoolStates,
  readTokenDecimals,
  v3PriceInQuote,
  type OfficialPool,
  type PoolState,
} from "@/lib/market-pools";
import {
  ledgerProvider,
  readLedger,
  type LedgerCoverage,
  type LedgerScan,
} from "@/lib/trade-ledger";

export const MARKET_SORTS = ["newest", "volume24h", "trending", "marketCap"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

// Ranking reads every field of each candidate, so non-newest sorts rank the most
// recent launches only. The response states the bound whenever it applies.
export const RANK_LIMIT = 100;
const DAY = 86_400;
const TRENDING_WINDOW = 6 * 3_600;

export type PairAsset = {
  address: Address;
  symbol: string;
  name: string;
  priceUsd: number | null;
  weightBps: number | null;
  reserve: string | null;
  reserveUsd: number | null;
  pool: { address: Address; dex: OfficialPool["dex"]; feeTier: number | null; liquidityUsd: number | null } | null;
};

export type MarketActivity = {
  volumeUsd: number | null;
  trades: number;
  buys: number;
  sells: number;
  lastTradeAt: number | null;
};

export type MarketSummary = OnchainFortuneLaunch & {
  priceUsd: number | null;
  priceSource: "curve" | OfficialPool["dex"];
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  pairs: PairAsset[];
  activity24h: MarketActivity | null;
  activityTrending: MarketActivity | null;
};

export type LedgerTrade = {
  source: "curve" | OfficialPool["dex"];
  market: Address;
  side: "buy" | "sell";
  trader: Address;
  tokenAmount: number;
  usdValue: number | null;
  priceUsd: number | null;
  blockNumber: string;
  transactionIndex: number;
  logIndex: number;
  transactionHash: `0x${string}`;
  timestamp: number;
};

const curveStateAbi = [
  { type: "function", name: "basePriceUsd1e18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "slopeUsd1e18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokensSold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduationWeights", stateMutability: "view", inputs: [], outputs: [{ type: "uint16[]" }] },
  { type: "function", name: "reserve", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

let stateClientCache: PublicClient | null = null;

function stateClient() {
  if (stateClientCache) return stateClientCache;
  const urls = configuredRpcUrls(FORTUNE_NETWORK.chainId);
  stateClientCache = createPublicClient({
    chain: FORTUNE_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: fallback((urls.length ? urls : [FORTUNE_NETWORK.publicRpcUrl]).map((url) => http(url, { timeout: 10_000 }))),
  }) as PublicClient;
  return stateClientCache;
}

const toNumber = (value: bigint, decimals = 18) => Number(formatUnits(value, decimals));

function assetPrice(asset: FortuneRegistryAsset | undefined) {
  if (!asset || !asset.healthy) return null;
  const value = toNumber(BigInt(asset.priceUsd1e18));
  return Number.isFinite(value) && value > 0 ? value : null;
}

type Context = {
  launches: OnchainFortuneLaunch[];
  blockNumber: bigint;
  assets: Map<string, FortuneRegistryAsset>;
  pools: Map<string, OfficialPool[]>;
  poolStates: Map<string, PoolState>;
};

async function buildContext(launches: OnchainFortuneLaunch[], blockNumber: bigint): Promise<Context> {
  const rpc = stateClient();
  const [universe, pools] = await Promise.all([
    readFortuneAssetUniverse().catch(() => null),
    readOfficialPools(rpc, launches.map((launch) => ({
      token: launch.token as Address, mode: launch.mode, graduated: launch.phase === 2, quoteAssets: launch.quoteAssets,
    })), blockNumber),
  ]);
  const states = await readPoolStates(rpc, [...pools.values()].flat(), blockNumber);
  return {
    launches,
    blockNumber,
    assets: new Map((universe?.assets || []).map((asset) => [asset.address.toLowerCase(), asset])),
    pools,
    poolStates: new Map(states.map((state) => [state.address.toLowerCase(), state])),
  };
}

function summarize(context: Context, launch: OnchainFortuneLaunch): Omit<MarketSummary, "activity24h" | "activityTrending"> {
  const pools = context.pools.get(launch.token.toLowerCase()) || [];
  let priceUsd: number | null = Number(launch.currentPriceUsd);
  let priceSource: MarketSummary["priceSource"] = "curve";
  let liquidityUsd: number | null = null;
  const poolLiquidity = new Map<string, number | null>();

  if (launch.phase === 2) {
    // A graduated token trades on its official pools; weight their prices by depth.
    let weighted = 0;
    let depth = 0;
    for (const pool of pools) {
      const state = context.poolStates.get(pool.address.toLowerCase());
      const quoteUsd = assetPrice(context.assets.get(pool.quoteAsset.toLowerCase()));
      if (!state || quoteUsd === null) { poolLiquidity.set(pool.address.toLowerCase(), null); continue; }
      const tvl = (state.quoteBalance + state.launchBalance * state.priceInQuote) * quoteUsd;
      poolLiquidity.set(pool.address.toLowerCase(), tvl);
      if (tvl > 0 && state.priceInQuote > 0) {
        weighted += state.priceInQuote * quoteUsd * tvl;
        depth += tvl;
      }
    }
    priceSource = pools[0]?.dex || "curve";
    const valued = pools.length > 0 && pools.every(pool => poolLiquidity.get(pool.address.toLowerCase()) != null);
    priceUsd = valued && depth > 0 ? weighted / depth : null;
    liquidityUsd = valued ? depth : null;
  }

  const supply = Number(launch.totalSupply);
  return {
    ...launch,
    priceUsd: priceUsd !== null && Number.isFinite(priceUsd) ? priceUsd : null,
    priceSource,
    marketCapUsd: priceUsd !== null && Number.isFinite(priceUsd * supply) ? priceUsd * supply : null,
    liquidityUsd,
    pairs: launch.quoteAssets.map((address) => {
      const asset = context.assets.get(address.toLowerCase());
      const pool = pools.find((item) => item.quoteAsset.toLowerCase() === address.toLowerCase());
      return {
        address: address as Address,
        symbol: asset?.symbol || address.slice(0, 6) + "…" + address.slice(-4),
        name: asset?.name || "Unregistered asset",
        priceUsd: assetPrice(asset),
        weightBps: null,
        reserve: null,
        reserveUsd: null,
        pool: pool ? { address: pool.address, dex: pool.dex, feeTier: pool.feeTier, liquidityUsd: poolLiquidity.get(pool.address.toLowerCase()) ?? null } : null,
      };
    }),
  };
}

/** Decodes curve trades and official-pool swaps into one ordered trade list per launch token. */
async function decodeTrades(context: Context, scan: LedgerScan) {
  const byCurve = new Map(context.launches.map((launch) => [launch.curve.toLowerCase(), launch]));
  const byPool = new Map<string, { launch: OnchainFortuneLaunch; pool: OfficialPool }>();
  for (const launch of context.launches) {
    for (const pool of context.pools.get(launch.token.toLowerCase()) || []) byPool.set(pool.address.toLowerCase(), { launch, pool });
  }

  const provider = ledgerProvider();
  const tradedCurves = [...new Set(scan.logs.filter((log) => log.eventName !== "Swap").map((log) => log.address.toLowerCase()))];
  const curveState = new Map<string, { base: bigint; slope: bigint; sold: bigint }>();
  if (provider && tradedCurves.length) {
    // Spot price after each trade is rebuilt from tokensSold at the scan head:
    // only buys (+tokensOut) and sells (-tokensIn) ever change it.
    const rows = await provider.client.multicall({ blockNumber: scan.head.number, contracts: tradedCurves.flatMap((curve) => [
      { address: curve as Address, abi: curveStateAbi, functionName: "basePriceUsd1e18" as const },
      { address: curve as Address, abi: curveStateAbi, functionName: "slopeUsd1e18" as const },
      { address: curve as Address, abi: curveStateAbi, functionName: "tokensSold" as const },
    ]) });
    tradedCurves.forEach((curve, i) => {
      const [base, slope, sold] = rows.slice(i * 3, i * 3 + 3);
      if (base.status === "success" && slope.status === "success" && sold.status === "success") {
        curveState.set(curve, { base: base.result as bigint, slope: slope.result as bigint, sold: sold.result as bigint });
      }
    });
  }

  const decimals = await readTokenDecimals(stateClient(), [...byPool.values()].flatMap(({ pool }) => [pool.launchToken, pool.quoteAsset]), context.blockNumber);
  const trades = new Map<string, LedgerTrade[]>();
  const anchors = new Map<string, { log: LedgerScan["logs"][number]; priceUsd: number }>();
  const push = (token: string, trade: LedgerTrade) => trades.set(token, [...(trades.get(token) || []), trade]);
  const base = (log: LedgerScan["logs"][number]) => ({
    blockNumber: log.blockNumber.toString(), transactionIndex: log.transactionIndex, logIndex: log.logIndex,
    transactionHash: log.transactionHash, timestamp: log.timestamp,
  });

  // Newest first so curve supply can be walked backwards from the head value.
  const soldAfter = new Map([...curveState.entries()].map(([curve, state]) => [curve, state.sold]));
  for (const log of [...scan.logs].reverse()) {
    const address = log.address.toLowerCase();
    const curveLaunch = byCurve.get(address);
    if (curveLaunch && (log.eventName === "Bought" || log.eventName === "Sold")) {
      const buy = log.eventName === "Bought";
      const tokens = (buy ? log.args.tokensOut : log.args.tokensIn) as bigint;
      const state = curveState.get(address);
      const after = soldAfter.get(address);
      const priceUsd = state && after !== undefined ? toNumber(curveSpotPrice(state.base, state.slope, after)) : null;
      if (state && after !== undefined) soldAfter.set(address, supplyBeforeTrade(after, buy ? "buy" : "sell", tokens));
      push(curveLaunch.token.toLowerCase(), {
        source: "curve", market: log.address, side: buy ? "buy" : "sell",
        trader: (buy ? log.args.buyer : log.args.seller) as Address,
        tokenAmount: toNumber(tokens), usdValue: toNumber(log.args.usdValue as bigint), priceUsd, ...base(log),
      });
      continue;
    }
    if (curveLaunch && log.eventName === "GraduationAnchor") {
      anchors.set(curveLaunch.token.toLowerCase(), { log, priceUsd: toNumber(log.args.priceUsd1e18 as bigint) });
      continue;
    }
    const poolEntry = byPool.get(address);
    if (!poolEntry || log.eventName !== "Swap") continue;
    const { launch, pool } = poolEntry;
    const launchDecimals = decimals(pool.launchToken);
    const quoteDecimals = decimals(pool.quoteAsset);
    // Today's oracle price is not evidence of a historical swap's USD value.
    // Keep historical USD unavailable until a block-pinned valuation source exists.
    const quoteUsd: number | null = null;
    let launchDelta: bigint;
    let quoteDelta: bigint;
    let priceInQuote: number;
    let trader: Address;
    if (log.swapKind === "v3") {
      const amount0 = log.args.amount0 as bigint;
      const amount1 = log.args.amount1 as bigint;
      launchDelta = pool.launchIsToken0 ? amount0 : amount1;
      quoteDelta = pool.launchIsToken0 ? amount1 : amount0;
      priceInQuote = v3PriceInQuote(log.args.sqrtPriceX96 as bigint, pool.launchIsToken0, launchDecimals, quoteDecimals);
      trader = log.args.recipient as Address;
    } else {
      const in0 = log.args.amount0In as bigint, in1 = log.args.amount1In as bigint;
      const out0 = log.args.amount0Out as bigint, out1 = log.args.amount1Out as bigint;
      launchDelta = pool.launchIsToken0 ? in0 - out0 : in1 - out1;
      quoteDelta = pool.launchIsToken0 ? in1 - out1 : in0 - out0;
      const tokens = toNumber(launchDelta < 0n ? -launchDelta : launchDelta, launchDecimals);
      priceInQuote = tokens > 0 ? toNumber(quoteDelta < 0n ? -quoteDelta : quoteDelta, quoteDecimals) / tokens : 0;
      trader = log.args.to as Address;
    }
    // Positive deltas flow into the pool: the trader bought when launch tokens left it.
    const buy = launchDelta < 0n;
    const quoteAmount = toNumber(quoteDelta < 0n ? -quoteDelta : quoteDelta, quoteDecimals);
    push(launch.token.toLowerCase(), {
      source: pool.dex, market: log.address, side: buy ? "buy" : "sell", trader,
      tokenAmount: toNumber(launchDelta < 0n ? -launchDelta : launchDelta, launchDecimals),
      usdValue: quoteUsd === null ? null : quoteAmount * quoteUsd,
      priceUsd: quoteUsd === null || priceInQuote <= 0 ? null : priceInQuote * quoteUsd,
      ...base(log),
    });
  }
  for (const list of trades.values()) list.reverse();
  return { trades, anchors };
}

export function activityFor(trades: LedgerTrade[], since: number): MarketActivity {
  const window = trades.filter((trade) => trade.timestamp >= since);
  return {
    volumeUsd: window.every(trade => trade.usdValue !== null && Number.isFinite(trade.usdValue))
      ? window.reduce((sum, trade) => sum + trade.usdValue!, 0) : null,
    trades: window.length,
    buys: window.filter((trade) => trade.side === "buy").length,
    sells: window.filter((trade) => trade.side === "sell").length,
    lastTradeAt: window.length ? window[window.length - 1].timestamp : null,
  };
}

/** True only when the scanned blocks span the whole window ending at the scan head. */
export function covers(coverage: LedgerCoverage | null, seconds: number) {
  if (!coverage) return false;
  if (coverage.complete && coverage.toTimestamp - coverage.requestedFrom >= seconds) return true;
  return coverage.toTimestamp - coverage.fromTimestamp >= seconds;
}

type Rankable = Pick<MarketSummary, "createdAt" | "marketCapUsd" | "activity24h" | "activityTrending">;

/**
 * Orders launches in place. Unknown values sort last; ties fall back to newest.
 * Trending compares trade count first and 6-hour volume second.
 */
export function rankMarkets<T extends Rankable>(items: T[], sort: MarketSort) {
  if (sort === "newest") return items.sort((a, b) => b.createdAt - a.createdAt);
  const key = (item: T): [number, number] | null => {
    if (sort === "marketCap") return item.marketCapUsd === null ? null : [item.marketCapUsd, 0];
    if (sort === "volume24h") return item.activity24h?.volumeUsd != null ? [item.activity24h.volumeUsd, 0] : null;
    return item.activityTrending ? [item.activityTrending.trades, item.activityTrending.volumeUsd ?? -1] : null;
  };
  return items.sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (!ka && !kb) return b.createdAt - a.createdAt;
    if (!ka) return 1;
    if (!kb) return -1;
    return kb[0] - ka[0] || kb[1] - ka[1] || b.createdAt - a.createdAt;
  });
}

/** Spot price (1e18 USD) of a linear curve: base + slope * tokensSold / 1e18. */
export function curveSpotPrice(base: bigint, slope: bigint, tokensSold: bigint) {
  return base + (slope * tokensSold) / 10n ** 18n;
}

/**
 * Supply before a trade, given the supply after it. Buys added tokensOut and
 * sells removed tokensIn; nothing else changes tokensSold.
 */
export function supplyBeforeTrade(after: bigint, side: "buy" | "sell", tokens: bigint) {
  return side === "buy" ? after - tokens : after + tokens;
}

export type MarketBoard = {
  configured: boolean;
  chainId: number;
  blockNumber: string | null;
  total: number;
  rankedAmong: number;
  sort: MarketSort;
  sortAvailable: boolean;
  items: MarketSummary[];
  hasMore: boolean;
  ledger: { available: boolean; coverage: LedgerCoverage | null; covers24h: boolean; coversTrending: boolean; trendingWindowSeconds: number };
};

/** Explore board: enriched launches with live prices, pairs and bounded ledger activity. */
export async function readMarketBoard(sort: MarketSort, offset: number, limit: number): Promise<MarketBoard> {
  const first = await readRecentFortuneLaunches(25, sort === "newest" ? offset : 0);
  if (!first.configured || first.blockNumber === null) {
    return { configured: false, chainId: FORTUNE_NETWORK.chainId, blockNumber: null, total: 0, rankedAmong: 0, sort, sortAvailable: false, items: [], hasMore: false,
      ledger: { available: false, coverage: null, covers24h: false, coversTrending: false, trendingWindowSeconds: TRENDING_WINDOW } };
  }
  const blockNumber = first.blockNumber;
  const launches = [...first.launches];
  if (sort !== "newest") {
    for (let next = 25; next < Math.min(first.total, RANK_LIMIT); next += 25) {
      launches.push(...(await readRecentFortuneLaunches(25, next, blockNumber)).launches);
    }
  }

  const context = await buildContext(launches, blockNumber);
  const provider = ledgerProvider();
  let scan: LedgerScan | null = null;
  if (provider && launches.length) {
    const addresses = launches.flatMap((launch) => [launch.curve as Address, ...(context.pools.get(launch.token.toLowerCase()) || []).map((pool) => pool.address)]);
    scan = await readLedger(provider, addresses, DAY).catch(() => null);
  }
  const decoded = scan ? await decodeTrades(context, scan).catch(() => null) : null;
  const coverage = scan?.coverage || null;
  const covers24h = Boolean(decoded) && covers(coverage, DAY);
  const coversTrending = Boolean(decoded) && covers(coverage, TRENDING_WINDOW);
  const head = coverage?.toTimestamp || Math.floor(Date.now() / 1000);

  const items: MarketSummary[] = launches.map((launch) => {
    const trades = decoded?.trades.get(launch.token.toLowerCase()) || [];
    return {
      ...summarize(context, launch),
      activity24h: covers24h ? activityFor(trades, head - DAY) : null,
      activityTrending: coversTrending ? activityFor(trades, head - TRENDING_WINDOW) : null,
    };
  });

  const sortAvailable = sort === "newest" || sort === "marketCap" || (sort === "volume24h"
    ? covers24h && items.every(item => item.activity24h?.volumeUsd != null) : coversTrending);
  if (sortAvailable) rankMarkets(items, sort);

  const page = sort === "newest" ? items.slice(0, limit) : items.slice(offset, offset + limit);
  return {
    configured: true,
    chainId: FORTUNE_NETWORK.chainId,
    blockNumber: blockNumber.toString(),
    total: first.total,
    rankedAmong: sort === "newest" ? first.total : launches.length,
    sort,
    sortAvailable,
    items: page,
    hasMore: sort === "newest" ? offset + page.length < first.total : offset + page.length < items.length,
    ledger: { available: Boolean(decoded), coverage, covers24h, coversTrending, trendingWindowSeconds: TRENDING_WINDOW },
  };
}

export const CHART_RANGES = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY } as const;
export type ChartRange = keyof typeof CHART_RANGES;

export function isChartRange(value: string): value is ChartRange {
  return Object.hasOwn(CHART_RANGES, value);
}

export type TokenMarket = {
  configured: boolean;
  chainId: number;
  blockNumber: string | null;
  summary: MarketSummary | null;
  chart: {
    range: ChartRange;
    points: CanonicalChartPoint[];
    ledger: { available: boolean; coverage: LedgerCoverage | null; coversRange: boolean };
  } | null;
  trades: LedgerTrade[];
};

/** One token: live summary, pair weights and reserves, canonical chart and recent trades. */
export async function readTokenMarket(token: Address, range: ChartRange): Promise<TokenMarket> {
  const lookup = await readFortuneLaunchByToken(token);
  if (!lookup.configured || !lookup.launch || lookup.blockNumber === null) {
    return { configured: lookup.configured, chainId: FORTUNE_NETWORK.chainId, blockNumber: lookup.blockNumber?.toString() ?? null, summary: null, chart: null, trades: [] };
  }
  const launch = lookup.launch;
  const blockNumber = lookup.blockNumber;
  const context = await buildContext([launch], blockNumber);
  const summary = summarize(context, launch);

  // Pair detail: graduation weights and per-asset accounted reserve, read at the catalog block.
  const rpc = stateClient();
  const [weightRows, reserveRows] = await Promise.all([
    rpc.multicall({ blockNumber, contracts: [{ address: launch.curve as Address, abi: curveStateAbi, functionName: "graduationWeights" as const }] }),
    summary.pairs.length
      ? rpc.multicall({ blockNumber, contracts: summary.pairs.map((pair) => ({ address: launch.curve as Address, abi: curveStateAbi, functionName: "reserve" as const, args: [pair.address] as const })) })
      : Promise.resolve([]),
  ]);
  const weights = weightRows[0].status === "success" ? weightRows[0].result : null;
  const pairDecimals = await readTokenDecimals(rpc, summary.pairs.map((pair) => pair.address), blockNumber);
  summary.pairs = summary.pairs.map((pair, i) => {
    const row = reserveRows[i];
    const reserve = row?.status === "success" ? toNumber(row.result as bigint, pairDecimals(pair.address)) : null;
    return {
      ...pair,
      weightBps: weights && weights.length === summary.pairs.length ? Number(weights[i]) : null,
      reserve: reserve === null ? null : String(reserve),
      reserveUsd: reserve !== null && pair.priceUsd !== null ? reserve * pair.priceUsd : null,
    };
  });

  const provider = ledgerProvider();
  const pools = context.pools.get(launch.token.toLowerCase()) || [];
  const scan = provider ? await readLedger(provider, [launch.curve as Address, ...pools.map((pool) => pool.address)], CHART_RANGES[range]).catch(() => null) : null;
  const decoded = scan ? await decodeTrades(context, scan).catch(() => null) : null;
  const trades = decoded?.trades.get(launch.token.toLowerCase()) || [];
  const coverage = scan?.coverage || null;
  const head = coverage?.toTimestamp || Math.floor(Date.now() / 1000);

  const anchor = decoded?.anchors.get(launch.token.toLowerCase());
  const chart = buildCanonicalChart({
    curve: trades.filter((trade) => trade.source === "curve" && trade.priceUsd !== null).map((trade) => ({
      blockNumber: Number(trade.blockNumber), transactionIndex: trade.transactionIndex, logIndex: trade.logIndex, timestamp: trade.timestamp, priceUsd: trade.priceUsd!,
    })),
    anchor: anchor ? { blockNumber: Number(anchor.log.blockNumber), transactionIndex: anchor.log.transactionIndex, logIndex: anchor.log.logIndex, timestamp: anchor.log.timestamp, priceUsd: anchor.priceUsd } : null,
    amm: trades.filter((trade) => trade.source !== "curve" && trade.priceUsd !== null).map((trade) => ({
      blockNumber: Number(trade.blockNumber), transactionIndex: trade.transactionIndex, logIndex: trade.logIndex, timestamp: trade.timestamp,
      priceUsd: trade.priceUsd!, pool: trade.market,
      // Depth filter input: the pool's liquidity at the snapshot block (one official pool per pair).
      liquidityUsd: summary.pairs.find((pair) => pair.pool?.address.toLowerCase() === trade.market.toLowerCase())?.pool?.liquidityUsd ?? 0,
    })),
    officialPools: pools.map((pool) => pool.address),
  });

  return {
    configured: true,
    chainId: FORTUNE_NETWORK.chainId,
    blockNumber: blockNumber.toString(),
    summary: {
      ...summary,
      activity24h: decoded && covers(coverage, DAY) ? activityFor(trades, head - DAY) : null,
      activityTrending: decoded && covers(coverage, TRENDING_WINDOW) ? activityFor(trades, head - TRENDING_WINDOW) : null,
    },
    chart: {
      range,
      points: chart.series,
      ledger: { available: Boolean(decoded), coverage, coversRange: Boolean(decoded) && covers(coverage, CHART_RANGES[range]) },
    },
    trades: [...trades].reverse().slice(0, 50),
  };
}
