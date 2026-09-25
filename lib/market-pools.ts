import { type Address, type PublicClient, zeroAddress } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// Official graduation pools are resolved from Fortune's own lockers, never from a
// factory lookup alone: a pool only counts when Fortune's permanently locked LP
// position (V3) or locked LP balance (V2 tax) sits in it. Pure state reads, no logs.

export type OfficialPool = {
  address: Address;
  dex: "pancake-v3" | "pancake-v2";
  launchToken: Address;
  quoteAsset: Address;
  launchIsToken0: boolean;
  feeTier: number | null;
};

export type PoolState = OfficialPool & {
  // Launch-token price in quote units, from slot0 (V3) or reserves (V2).
  priceInQuote: number;
  quoteBalance: number;
  launchBalance: number;
};

const v3LockerAbi = [
  { type: "function", name: "positionManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "lockedPositionCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedTokenIds", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "position", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [
    { name: "launchToken", type: "address" }, { name: "feeRecipient", type: "address" }, { name: "poolKeyHash", type: "bytes32" },
    { name: "lockedAt", type: "uint64" }, { name: "registered", type: "bool" },
  ] }] },
] as const;

const positionManagerAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { name: "nonce", type: "uint96" }, { name: "operator", type: "address" }, { name: "token0", type: "address" }, { name: "token1", type: "address" },
    { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "liquidity", type: "uint128" },
    { name: "feeGrowthInside0LastX128", type: "uint256" }, { name: "feeGrowthInside1LastX128", type: "uint256" },
    { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
  ] },
] as const;

const v3FactoryAbi = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
] as const;

const v2LockerAbi = [
  { type: "function", name: "lockedPairCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedPairs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

const pairAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
] as const;

// PancakeSwap V3 slot0 packs feeProtocol as uint32 (Uniswap uses uint8).
const v3PoolAbi = [
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" },
    { name: "observationCardinality", type: "uint16" }, { name: "observationCardinalityNext", type: "uint16" },
    { name: "feeProtocol", type: "uint32" }, { name: "unlocked", type: "bool" },
  ] },
] as const;

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

type V3Index = { count: number; byToken: Map<string, bigint[]> };
type V2Index = { count: number; byToken: Map<string, Array<{ pair: Address; token0: Address; token1: Address }>> };

const v3Indexes = new Map<string, V3Index>();
const v2Indexes = new Map<string, V2Index>();
const resolved = new Map<string, OfficialPool[]>();
const decimalsCache = new Map<string, number>();

function ok<T>(row: { status: string; result?: unknown }, label: string): T {
  if (row.status !== "success" || row.result === undefined) throw new Error("Pool read failed: " + label);
  return row.result as T;
}

async function readV3Index(rpc: PublicClient, locker: Address, blockNumber: bigint): Promise<V3Index> {
  const key = locker.toLowerCase();
  const previous = v3Indexes.get(key) || { count: 0, byToken: new Map<string, bigint[]>() };
  const count = Number(await rpc.readContract({ address: locker, abi: v3LockerAbi, functionName: "lockedPositionCount", blockNumber }));
  if (count <= previous.count) return previous;

  const indexes = Array.from({ length: count - previous.count }, (_, offset) => BigInt(previous.count + offset));
  const ids = await rpc.multicall({ blockNumber, contracts: indexes.map((index) => ({ address: locker, abi: v3LockerAbi, functionName: "lockedTokenIds" as const, args: [index] as const })) });
  const tokenIds = ids.map((row, i) => ok<bigint>(row, "lockedTokenIds " + indexes[i]));
  const positions = await rpc.multicall({ blockNumber, contracts: tokenIds.map((id) => ({ address: locker, abi: v3LockerAbi, functionName: "position" as const, args: [id] as const })) });

  const byToken = new Map(previous.byToken);
  positions.forEach((row, i) => {
    const position = ok<{ launchToken: Address; registered: boolean }>(row, "position " + tokenIds[i]);
    if (!position.registered) return;
    const token = position.launchToken.toLowerCase();
    byToken.set(token, [...(byToken.get(token) || []), tokenIds[i]]);
  });
  const next = { count, byToken };
  v3Indexes.set(key, next);
  return next;
}

async function readV2Index(rpc: PublicClient, locker: Address, blockNumber: bigint): Promise<V2Index> {
  const key = locker.toLowerCase();
  const previous = v2Indexes.get(key) || { count: 0, byToken: new Map() };
  const count = Number(await rpc.readContract({ address: locker, abi: v2LockerAbi, functionName: "lockedPairCount", blockNumber }));
  if (count <= previous.count) return previous;

  const indexes = Array.from({ length: count - previous.count }, (_, offset) => BigInt(previous.count + offset));
  const pairRows = await rpc.multicall({ blockNumber, contracts: indexes.map((index) => ({ address: locker, abi: v2LockerAbi, functionName: "lockedPairs" as const, args: [index] as const })) });
  const pairs = pairRows.map((row, i) => ok<Address>(row, "lockedPairs " + indexes[i]));
  const tokenRows = await rpc.multicall({ blockNumber, contracts: pairs.flatMap((pair) => [
    { address: pair, abi: pairAbi, functionName: "token0" as const },
    { address: pair, abi: pairAbi, functionName: "token1" as const },
  ]) });

  const byToken = new Map(previous.byToken);
  pairs.forEach((pair, i) => {
    const token0 = ok<Address>(tokenRows[i * 2], "token0 " + pair);
    const token1 = ok<Address>(tokenRows[i * 2 + 1], "token1 " + pair);
    for (const token of [token0, token1]) {
      const lower = token.toLowerCase();
      byToken.set(lower, [...(byToken.get(lower) || []), { pair, token0, token1 }]);
    }
  });
  const next = { count, byToken };
  v2Indexes.set(key, next);
  return next;
}

/** Official graduation pools for each graduated launch token (cached: they never change). */
export async function readOfficialPools(
  rpc: PublicClient,
  launches: Array<{ token: Address; mode: "standard" | "tax"; graduated: boolean; quoteAssets: Address[] }>,
  blockNumber: bigint
) {
  const result = new Map<string, OfficialPool[]>();
  const pending = launches.filter((launch) => {
    const cached = resolved.get(launch.token.toLowerCase());
    if (cached) result.set(launch.token.toLowerCase(), cached);
    return launch.graduated && !cached;
  });
  if (!pending.length) return result;

  const standard = pending.filter((launch) => launch.mode === "standard");
  const tax = pending.filter((launch) => launch.mode === "tax");
  const v3Locker = FORTUNE_NETWORK.contracts.liquidityLocker as Address;
  const v2Locker = FORTUNE_NETWORK.contracts.taxLiquidityLocker as Address;

  if (standard.length && v3Locker && v3Locker !== zeroAddress) {
    const index = await readV3Index(rpc, v3Locker, blockNumber);
    const positionManager = await rpc.readContract({ address: v3Locker, abi: v3LockerAbi, functionName: "positionManager", blockNumber });
    const factory = await rpc.readContract({ address: positionManager, abi: positionManagerAbi, functionName: "factory", blockNumber });
    const wanted = standard.flatMap((launch) => (index.byToken.get(launch.token.toLowerCase()) || []).map((tokenId) => ({ launch, tokenId })));
    const positions = wanted.length ? await rpc.multicall({ blockNumber, contracts: wanted.map(({ tokenId }) => ({ address: positionManager, abi: positionManagerAbi, functionName: "positions" as const, args: [tokenId] as const })) }) : [];
    const keys = positions.map((row, i) => {
      const [, , token0, token1, fee] = ok<readonly [bigint, Address, Address, Address, number]>(row, "positions " + wanted[i].tokenId);
      return { ...wanted[i], token0, token1, fee: Number(fee) };
    });
    const pools = keys.length ? await rpc.multicall({ blockNumber, contracts: keys.map((key) => ({ address: factory, abi: v3FactoryAbi, functionName: "getPool" as const, args: [key.token0, key.token1, key.fee] as const })) }) : [];
    for (const launch of standard) {
      const official: OfficialPool[] = [];
      keys.forEach((key, i) => {
        if (key.launch !== launch) return;
        const pool = ok<Address>(pools[i], "getPool");
        if (pool === zeroAddress || official.some((item) => item.address === pool)) return;
        const launchIsToken0 = key.token0.toLowerCase() === launch.token.toLowerCase();
        official.push({ address: pool, dex: "pancake-v3", launchToken: launch.token, quoteAsset: launchIsToken0 ? key.token1 : key.token0, launchIsToken0, feeTier: key.fee });
      });
      if (official.length) resolved.set(launch.token.toLowerCase(), official);
      result.set(launch.token.toLowerCase(), official);
    }
  }

  if (tax.length && v2Locker && v2Locker !== zeroAddress) {
    const index = await readV2Index(rpc, v2Locker, blockNumber);
    for (const launch of tax) {
      const official = (index.byToken.get(launch.token.toLowerCase()) || []).map(({ pair, token0, token1 }) => {
        const launchIsToken0 = token0.toLowerCase() === launch.token.toLowerCase();
        return { address: pair, dex: "pancake-v2" as const, launchToken: launch.token, quoteAsset: launchIsToken0 ? token1 : token0, launchIsToken0, feeTier: null };
      });
      if (official.length) resolved.set(launch.token.toLowerCase(), official);
      result.set(launch.token.toLowerCase(), official);
    }
  }
  return result;
}

export async function readTokenDecimals(rpc: PublicClient, tokens: Address[], blockNumber: bigint) {
  const missing = [...new Set(tokens.map((token) => token.toLowerCase()))].filter((token) => !decimalsCache.has(token));
  if (missing.length) {
    const rows = await rpc.multicall({ blockNumber, contracts: missing.map((token) => ({ address: token as Address, abi: erc20Abi, functionName: "decimals" as const })) });
    rows.forEach((row, i) => decimalsCache.set(missing[i], Number(ok<number>(row, "decimals " + missing[i]))));
  }
  return (token: Address) => decimalsCache.get(token.toLowerCase()) ?? 18;
}

/** Price and balances of official pools at one block. */
export async function readPoolStates(rpc: PublicClient, pools: OfficialPool[], blockNumber: bigint): Promise<PoolState[]> {
  if (!pools.length) return [];
  const decimals = await readTokenDecimals(rpc, pools.flatMap((pool) => [pool.launchToken, pool.quoteAsset]), blockNumber);
  const rows = await rpc.multicall({ blockNumber, contracts: pools.flatMap((pool) => [
    pool.dex === "pancake-v3"
      ? { address: pool.address, abi: v3PoolAbi, functionName: "slot0" as const }
      : { address: pool.address, abi: pairAbi, functionName: "getReserves" as const },
    { address: pool.launchToken, abi: erc20Abi, functionName: "balanceOf" as const, args: [pool.address] as const },
    { address: pool.quoteAsset, abi: erc20Abi, functionName: "balanceOf" as const, args: [pool.address] as const },
  ]) });

  return pools.map((pool, i) => {
    const launchDecimals = decimals(pool.launchToken);
    const quoteDecimals = decimals(pool.quoteAsset);
    const launchBalance = Number(ok<bigint>(rows[i * 3 + 1], "launch balance")) / 10 ** launchDecimals;
    const quoteBalance = Number(ok<bigint>(rows[i * 3 + 2], "quote balance")) / 10 ** quoteDecimals;
    let priceInQuote: number;
    if (pool.dex === "pancake-v3") {
      const [sqrtPriceX96] = ok<readonly [bigint]>(rows[i * 3], "slot0");
      priceInQuote = v3PriceInQuote(sqrtPriceX96, pool.launchIsToken0, launchDecimals, quoteDecimals);
    } else {
      const [reserve0, reserve1] = ok<readonly [bigint, bigint, number]>(rows[i * 3], "getReserves");
      const launchReserve = Number(pool.launchIsToken0 ? reserve0 : reserve1) / 10 ** launchDecimals;
      const quoteReserve = Number(pool.launchIsToken0 ? reserve1 : reserve0) / 10 ** quoteDecimals;
      priceInQuote = launchReserve > 0 ? quoteReserve / launchReserve : 0;
    }
    return { ...pool, priceInQuote, quoteBalance, launchBalance };
  });
}

/** Launch-token price in quote units from a V3 sqrtPriceX96 (token1 per token0 = (sqrtP / 2^96)^2). */
export function v3PriceInQuote(sqrtPriceX96: bigint, launchIsToken0: boolean, launchDecimals: number, quoteDecimals: number) {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const token1PerToken0 = ratio * ratio;
  if (!Number.isFinite(token1PerToken0) || token1PerToken0 <= 0) return 0;
  // Raw ratio is in smallest units; scale to whole tokens.
  return launchIsToken0
    ? token1PerToken0 * 10 ** (launchDecimals - quoteDecimals)
    : (1 / token1PerToken0) * 10 ** (launchDecimals - quoteDecimals);
}
