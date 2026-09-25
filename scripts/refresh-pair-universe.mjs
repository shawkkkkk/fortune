#!/usr/bin/env node
// Rebuilds data/pair-universe.json: the reviewed identity list of BNB Smart
// Chain pair candidates (tokenized stocks and ETFs, tokenized commodities,
// pre-IPO SPV tokens and major BNB assets).
//
// Contract addresses come from CoinGecko's platform map or a named primary
// source, and are kept only when the contract answers onchain with a matching
// symbol. The file stores identity and issuer-control facts, never prices:
// prices, volume and logos are fetched live at request time.
//
// A listing here is discovery, not Fortune approval. Pairing still requires the
// active onchain Asset Registry, an oracle and the release asset policy.
//
// Usage:
//   node scripts/refresh-pair-universe.mjs [--rpc=https://…] [--baseline]
// Behind an HTTPS proxy, run Node with NODE_USE_ENV_PROXY=1.
// --baseline records no first-seen dates, so nothing is labelled NEW.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

const OUT = new URL("../data/pair-universe.json", import.meta.url);
const COINGECKO = "https://api.coingecko.com/api/v3";
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const RPC = typeof args.rpc === "string" ? args.rpc : process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com";
const today = new Date().toISOString().slice(0, 10);

// Stock issuers whose BNB Smart Chain tokens CoinGecko groups by category.
const STOCK_CATEGORIES = [
  { category: "bstocks-ecosystem", provider: "bStocks", pages: 1 },
  { category: "ondo-tokenized-assets", provider: "Ondo", pages: 2 },
  { category: "xstocks-ecosystem", provider: "xStocks", pages: 1 },
];

// Tokenized gold on BNB Smart Chain.
const RWA_CATEGORIES = [{ category: "tokenized-gold", pages: 1 }];

// BNB assets always offered for discovery, whatever their rank.
const CORE_CRYPTO = [
  "wbnb", "binance-bridged-usdt-bnb-smart-chain", "binance-bridged-usdc-bnb-smart-chain", "usd1-wlfi",
  "first-digital-usd", "united-stables", "binance-bitcoin", "binance-peg-weth", "pancakeswap-token",
  "binance-peg-sol", "binance-peg-xrp", "binance-peg-dogecoin", "binance-peg-near-protocol",
  "binance-peg-zcash-token", "myx-finance",
];
const CRYPTO_MIN_VOLUME_USD = 2_000_000;
const CRYPTO_LIMIT = 60;

// Tokens CoinGecko does not map to BNB Smart Chain, each with a primary source.
const CURATED = [
  {
    id: "paimon-polymarket-spv-token",
    address: "0x1D80392D12CAAaF9E333Bb0bb7f021eaCf297Fe6",
    group: "preipo",
    provider: "Paimon",
    kind: "spv",
    underlying: "Polymarket",
    displayName: "Polymarket",
    source: "coinmarketcap:paimon-polymarket-spv-token",
  },
];

// CoinGecko symbols that differ from the token's own onchain symbol.
const SYMBOL_ALIASES = {
  "binance-bridged-usdt-bnb-smart-chain": "USDT",
  "tether-gold-tokens": "XAUT",
  "binance-peg-weth": "ETH",
};

// Funds whose issuer names do not say "ETF" (e.g. "TBLL xStock", "SPY").
const ETF_TICKERS = new Set([
  "SPY", "QQQ", "IVV", "TLT", "IEFA", "AGG", "ITOT", "EFA", "TIP", "IEMG", "IWF", "SGOV", "EEM", "IBIT", "VTI",
  "TQQQ", "SQQQ", "SOXL", "SOXS", "KORU", "EWY", "DRAM", "SNXX", "SMH", "XLK", "IWM", "DIA", "VOO", "ARKK", "TBLL", "IJR",
]);
// Funds that hold a physical commodity rather than companies.
const COMMODITY_TICKERS = new Set(["GLD", "IAU", "SLV", "FGDL", "GLDM", "SGOL", "AAAU", "BAR", "PPLT", "SIVR", "PALL"]);

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function coingecko(path, attempt = 0) {
  const response = await fetch(COINGECKO + path, {
    headers: { accept: "application/json", ...(process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {}) },
  });
  if (response.status === 429 && attempt < 4) {
    await sleep(15_000 * (attempt + 1));
    return coingecko(path, attempt + 1);
  }
  if (!response.ok) throw new Error(`CoinGecko ${path} returned ${response.status}`);
  await sleep(2_500);
  return response.json();
}

async function category(id, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await coingecko(`/coins/markets?vs_currency=usd&category=${id}&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`);
    rows.push(...batch);
    if (batch.length < 250) break;
  }
  return rows;
}

function stripIssuer(name) {
  return name
    .replace(/\s*\((?:bStocks|Ondo)[^)]*\)\s*$/i, "")
    .replace(/\s+xStock$/i, "")
    .trim();
}

function underlyingTicker(symbol, provider) {
  if (provider === "bStocks") return symbol.replace(/B$/, "");
  if (provider === "Ondo") return symbol.replace(/on$/, "");
  if (provider === "xStocks") return symbol.replace(/x$/, "");
  return symbol;
}

function classifyStock(name, ticker) {
  const symbol = ticker.toUpperCase();
  if (COMMODITY_TICKERS.has(symbol)) return { group: "rwa", kind: "commodity" };
  const etf = ETF_TICKERS.has(symbol) || /\bETF\b|\bTrust\b|\bFund\b|\bIndex\b|S&P|SP500|^Nasdaq$|Vanguard|iShares|SPDR/i.test(name);
  return { group: "stocks", kind: etf ? "etf" : "stock" };
}

function leveraged(name) {
  return /\b[23]X\b|UltraPro|\bBull\b|\bBear\b/i.test(name);
}

function normalize(symbol) {
  return symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function symbolsAgree(onchain, expected) {
  const a = normalize(onchain);
  const b = normalize(expected);
  return Boolean(a && b) && (a === b || a.startsWith(b) || b.startsWith(a));
}

const erc20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function paused() view returns (bool)",
  "function multiplier() view returns (uint256)",
]);
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

async function inspect(client, candidates) {
  const blockNumber = await client.getBlockNumber();
  const functions = ["name", "symbol", "decimals", "totalSupply", "paused", "multiplier"];
  const results = [];
  for (let start = 0; start < candidates.length; start += 60) {
    const chunk = candidates.slice(start, start + 60);
    const calls = chunk.flatMap((candidate) => functions.map((functionName) => ({ address: candidate.address, abi: erc20, functionName })));
    const [answers, codes, slots] = await Promise.all([
      client.multicall({ contracts: calls, allowFailure: true, blockNumber }),
      Promise.all(chunk.map((candidate) => client.getCode({ address: candidate.address, blockNumber }))),
      Promise.all(chunk.flatMap((candidate) => [IMPLEMENTATION_SLOT, BEACON_SLOT].map((slot) => client.getStorageAt({ address: candidate.address, slot, blockNumber })))),
    ]);
    chunk.forEach((candidate, index) => {
      const value = (offset) => {
        const answer = answers[index * functions.length + offset];
        return answer.status === "success" ? answer.result : null;
      };
      const hasSlot = (slot) => Boolean(slot && BigInt(slot) !== 0n);
      results.push({
        candidate,
        code: codes[index],
        name: value(0),
        symbol: value(1),
        decimals: value(2),
        totalSupply: value(3),
        pausable: value(4) !== null,
        paused: value(4) === true,
        rebasing: value(5) !== null,
        upgradeable: hasSlot(slots[index * 2]) || hasSlot(slots[index * 2 + 1]),
      });
    });
  }
  return { blockNumber, results };
}

async function main() {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const firstSeen = new Map((previous?.assets || []).map((asset) => [asset.id, asset.firstSeen ?? null]));

  console.log("Reading CoinGecko platform map…");
  const coins = await coingecko("/coins/list?include_platform=true");
  const bscAddress = new Map(coins
    .map((coin) => [coin.id, coin.platforms?.["binance-smart-chain"] || null])
    .filter(([, address]) => address && /^0x[0-9a-fA-F]{40}$/.test(address)));

  const candidates = new Map();
  const add = (candidate) => {
    const key = candidate.address.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, candidate);
  };

  for (const { category: id, provider, pages } of STOCK_CATEGORIES) {
    console.log("Reading", id);
    for (const coin of await category(id, pages)) {
      const address = bscAddress.get(coin.id);
      if (!address) continue;
      add({ id: coin.id, address: getAddress(address), provider, cgSymbol: coin.symbol, cgName: coin.name, image: coin.image || null, source: "coingecko:" + coin.id, family: "stock" });
    }
  }
  for (const { category: id, pages } of RWA_CATEGORIES) {
    console.log("Reading", id);
    for (const coin of await category(id, pages)) {
      const address = bscAddress.get(coin.id);
      if (!address || !(coin.total_volume > 100_000)) continue;
      add({ id: coin.id, address: getAddress(address), provider: coin.name.includes("Tether") ? "Tether" : coin.name.includes("Matrixdock") ? "Matrixdock" : null, cgSymbol: coin.symbol, cgName: coin.name, image: coin.image || null, source: "coingecko:" + coin.id, family: "gold" });
    }
  }
  console.log("Reading binance-smart-chain");
  const stockIds = new Set([...candidates.values()].map((candidate) => candidate.id));
  const ranked = await category("binance-smart-chain", 1);
  const missingCore = CORE_CRYPTO.filter((id) => !ranked.some((coin) => coin.id === id));
  const core = missingCore.length ? await coingecko(`/coins/markets?vs_currency=usd&ids=${missingCore.join(",")}&sparkline=false`) : [];
  const crypto = [
    ...[...ranked, ...core].filter((coin) => CORE_CRYPTO.includes(coin.id)),
    ...ranked.filter((coin) => !CORE_CRYPTO.includes(coin.id) && (coin.total_volume || 0) >= CRYPTO_MIN_VOLUME_USD),
  ].filter((coin) => bscAddress.has(coin.id) && !stockIds.has(coin.id));
  for (const coin of crypto.slice(0, CRYPTO_LIMIT)) {
    add({ id: coin.id, address: getAddress(bscAddress.get(coin.id)), provider: null, cgSymbol: coin.symbol, cgName: coin.name, image: coin.image || null, source: "coingecko:" + coin.id, family: "crypto" });
  }
  for (const curated of CURATED) add({ ...curated, address: getAddress(curated.address), family: "curated" });

  console.log(`Inspecting ${candidates.size} contracts on BNB Smart Chain via ${new URL(RPC).host}…`);
  const client = createPublicClient({ chain: bsc, transport: http(RPC, { batch: { batchSize: 40 }, timeout: 30_000, retryCount: 3 }) });
  if (await client.getChainId() !== 56) throw new Error("RPC is not BNB Smart Chain mainnet.");
  const { blockNumber, results } = await inspect(client, [...candidates.values()]);

  const assets = [];
  const rejected = [];
  for (const row of results) {
    const { candidate } = row;
    const expected = SYMBOL_ALIASES[candidate.id] || candidate.cgSymbol || row.symbol || "";
    if (!row.code || row.code === "0x") { rejected.push([candidate.id, "no contract code"]); continue; }
    if (typeof row.symbol !== "string" || row.decimals === null) { rejected.push([candidate.id, "not a readable ERC-20"]); continue; }
    if (candidate.family !== "curated" && !symbolsAgree(row.symbol, expected)) { rejected.push([candidate.id, `onchain symbol ${row.symbol} ≠ ${expected}`]); continue; }
    if (row.decimals > 36) { rejected.push([candidate.id, "unsupported decimals"]); continue; }

    let group = "crypto";
    let kind = "token";
    let displayName = candidate.cgName || row.name;
    let underlying = null;
    if (candidate.family === "stock") {
      underlying = underlyingTicker(row.symbol, candidate.provider);
      displayName = stripIssuer(candidate.cgName);
      ({ group, kind } = classifyStock(displayName, underlying));
    } else if (candidate.family === "gold") {
      group = "rwa";
      kind = "commodity";
      underlying = "XAU";
    } else if (candidate.family === "curated") {
      group = candidate.group;
      kind = candidate.kind;
      underlying = candidate.underlying;
      displayName = candidate.displayName;
    }

    const seen = firstSeen.has(candidate.id) ? firstSeen.get(candidate.id) : args.baseline || !previous ? null : today;
    assets.push({
      id: candidate.id,
      symbol: row.symbol,
      name: displayName,
      contractName: row.name,
      group,
      kind,
      provider: candidate.provider,
      underlying,
      leveraged: leveraged(displayName) || undefined,
      address: candidate.address,
      decimals: Number(row.decimals),
      controls: { upgradeable: row.upgradeable, pausable: row.pausable, rebasing: row.rebasing },
      image: candidate.image ? candidate.image.replace("/large/", "/small/") : null,
      source: candidate.source,
      firstSeen: seen,
    });
  }

  assets.sort((a, b) => a.group.localeCompare(b.group) || String(a.provider).localeCompare(String(b.provider)) || a.symbol.localeCompare(b.symbol));
  const out = {
    generatedAt: new Date().toISOString(),
    chainId: 56,
    verifiedAtBlock: Number(blockNumber),
    sources: {
      addresses: "CoinGecko platform map (BNB Smart Chain) and named primary sources, each confirmed by onchain symbol, name and decimals",
      controls: "Onchain probes: EIP-1967 implementation/beacon slots (upgradeable), paused() (issuer pause switch), multiplier() (rebasing share multiplier)",
    },
    assets,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");

  const count = (group) => assets.filter((asset) => asset.group === group).length;
  console.log(`Wrote ${assets.length} assets at block ${blockNumber}: ${count("stocks")} stocks/ETFs, ${count("rwa")} RWA, ${count("preipo")} pre-IPO, ${count("crypto")} crypto.`);
  if (rejected.length) {
    console.log(`Rejected ${rejected.length}:`);
    for (const [id, reason] of rejected) console.log(`  ${id}: ${reason}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
