import { getAddress, hexToString, isAddress, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { customPairClient } from "@/lib/custom-pairs-read";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { STOCK_REWARDS, stockRewardsPhase, type StockRewardsPhase } from "@/lib/stock-rewards";
import {
  STOCK_REWARDS_CURVE_ABI,
  STOCK_REWARDS_FACTORY_ABI,
  STOCK_REWARDS_FEE_ROUTER_ABI,
  STOCK_REWARDS_LOCKER_ABI,
  STOCK_REWARDS_REGISTRY_ABI,
  STOCK_REWARDS_TOKEN_ABI,
  TEST_STOCK_ABI,
} from "@/lib/stock-rewards-artifacts";

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const ORACLE = parseAbi(["function priceUsd(address) view returns (uint256 price, uint256 updatedAt)"]);
const V3_FACTORY = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const V3_POOL = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)",
  "function token0() view returns (address)",
]);

const NO_ADDRESS = "0x0000000000000000000000000000000000000000";
const Q192 = 1n << 192n;

/** A stock the Stock Rewards registry lists, for the launch form. */
export type StockListing = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  category: string;
  priceUsd1e18: string;
  healthy: boolean;
  reason: string | null;
  /** Shares a testnet faucet call mints, in base units, when the stock has a faucet. */
  faucetAmount: string | null;
};

export type BasketStock = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  category: string;
  weightBps: number;
  /** The curve's accounted reserve, in base units. */
  reserve: string;
  reserveUsd1e18: string;
  /** This stock's fixed share of the graduation target. */
  targetUsd1e18: string;
  /** From the oracle the curve snapshotted at launch. Zero when it cannot be read. */
  priceUsd1e18: string;
  /** The launch's PancakeSwap V3 pool for this stock, once graduated. */
  pool: Address | null;
  /** Fees the locked position has earned and nobody has collected yet, once graduated. */
  poolFees: { stock: string; token: string } | null;
  /** Shares a testnet faucet call mints, in base units, when the stock has a faucet. */
  faucetAmount: string | null;
  rewards: {
    owed: string;
    streaming: string;
    streamEnd: number;
    totalReceived: string;
    /** Received by the token but not yet taken into the stream; a sync starts it. */
    waiting: string;
  };
};

export type StockRewardsLaunch = {
  id: number;
  creator: Address;
  token: Address;
  curve: Address;
  feeRouter: Address;
  createdAt: number;
  name: string;
  symbol: string;
  imageURI: string | null;
  phase: StockRewardsPhase;
  graduationUsd1e18: string;
  netReserveUsd1e18: string;
  progressBps: number;
  /** USD (1e18) per whole token: the curve price, or the first pool's price once graduated. */
  priceUsd1e18: string;
  totalSupply: string;
  tokensSold: string;
  creatorFeeBps: number;
  holderFeeBps: number;
  protocolFeeBps: number;
  poolFee: number;
  stocks: Array<Pick<BasketStock, "address" | "symbol" | "weightBps" | "decimals"> & { totalReceived: string }>;
};

export type StockRewardsLaunchDetail = Omit<StockRewardsLaunch, "stocks"> & {
  description: string | null;
  website: string | null;
  xProfile: string | null;
  telegram: string | null;
  launchTimestamp: number;
  graduationReadyAt: number;
  rescueDelaySeconds: number;
  eligibleSupply: string;
  curveInventory: string;
  creatorFeesToHolders: boolean;
  graduation: { attempts: number; failures: number; lastFailure: string | null; completed: boolean };
  positionIds: string[];
  rescue: { supply: string; redeemed: string } | null;
  stocks: BasketStock[];
  blockNumber: string;
  blockTimestamp: number;
};

type LaunchRecord = {
  creator: Address;
  token: Address;
  curve: Address;
  feeRouter: Address;
  graduationUsd1e18: bigint;
  creatorFeeBps: number;
  holderFeeBps: number;
  poolFee: number;
  createdAt: bigint;
};

type RewardStateTuple = { perShare: bigint; owed: bigint; streaming: bigint; streamEnd: bigint; totalReceived: bigint };

const client = () => customPairClient() as PublicClient;

function bytes32Text(value: Hex) {
  try {
    const text = hexToString(value).replace(/\0/g, "");
    return /^[A-Z0-9_]{2,32}$/.test(text) ? text : value;
  } catch {
    return value;
  }
}

/** USD (1e18) per whole launch token from a V3 pool price and the stock's USD price. */
export function poolTokenPriceUsd(sqrtPriceX96: bigint, launchIsToken0: boolean, stockDecimals: number, stockPriceUsd1e18: bigint) {
  if (sqrtPriceX96 === 0n || stockPriceUsd1e18 === 0n) return 0n;
  const ratioX192 = sqrtPriceX96 * sqrtPriceX96;
  const scale = 10n ** BigInt(stockDecimals);
  // token1 per token0 in base units is ratioX192 / 2^192.
  return launchIsToken0
    ? (ratioX192 * 10n ** 18n * stockPriceUsd1e18) / (Q192 * scale)
    : (Q192 * 10n ** 18n * stockPriceUsd1e18) / (ratioX192 * scale);
}

export async function readStockListings(): Promise<{ configured: boolean; registry: Address | null; stocks: StockListing[] }> {
  if (!STOCK_REWARDS.enabled || !STOCK_REWARDS.factory) return { configured: false, registry: null, stocks: [] };
  const rpc = client();
  const blockNumber = await rpc.getBlockNumber();
  const at = { blockNumber };
  const registry = (await rpc.readContract({ address: STOCK_REWARDS.factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "registry", ...at })) as Address;
  const count = Number(await rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "assetCount", ...at }));
  const addresses = await Promise.all(
    Array.from({ length: Math.min(count, 200) }, (_, index) =>
      rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "allAssets", args: [BigInt(index)], ...at }) as Promise<Address>
    )
  );
  const stocks = await Promise.all(
    addresses.map(async (address) => {
      const [config, decimals, health, name, symbol, faucetAmount] = await Promise.all([
        rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "assetConfig", args: [address], ...at }) as Promise<{
          quoteEnabled: boolean;
          rewardEnabled: boolean;
          graduationEnabled: boolean;
          active: boolean;
          category: string;
        }>,
        rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "registeredDecimals", args: [address], ...at }),
        rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "assetHealth", args: [address], ...at }) as Promise<
          readonly [boolean, Hex, bigint, bigint]
        >,
        rpc.readContract({ address, abi: ERC20, functionName: "name", ...at }).catch(() => ""),
        rpc.readContract({ address, abi: ERC20, functionName: "symbol", ...at }).catch(() => "STOCK"),
        rpc.readContract({ address, abi: TEST_STOCK_ABI, functionName: "faucetAmount", ...at }).catch(() => null),
      ]);
      if (!config.active || !config.quoteEnabled || !config.rewardEnabled || !config.graduationEnabled) return null;
      const listing: StockListing = {
        address: getAddress(address),
        symbol: String(symbol).slice(0, 16),
        name: String(name).slice(0, 64),
        decimals: Number(decimals),
        category: String(config.category).slice(0, 32),
        priceUsd1e18: health[2].toString(),
        healthy: health[0],
        reason: health[0] ? null : bytes32Text(health[1]),
        faucetAmount: faucetAmount === null ? null : String(faucetAmount),
      };
      return listing;
    })
  );
  return { configured: true, registry, stocks: stocks.filter((stock): stock is StockListing => stock !== null) };
}

async function stockPrice(rpc: PublicClient, curve: Address, stock: Address, blockNumber: bigint) {
  try {
    const oracle = (await rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "oracleFor", args: [stock], blockNumber })) as Address;
    const [price] = await rpc.readContract({ address: oracle, abi: ORACLE, functionName: "priceUsd", args: [stock], blockNumber });
    return price;
  } catch {
    return 0n;
  }
}

async function readSummary(rpc: PublicClient, id: number, record: LaunchRecord, blockNumber: bigint) {
  const factory = STOCK_REWARDS.factory as Address;
  const at = { blockNumber };
  const curve = record.curve;
  const [phaseValue, netReserveUsd, curvePrice, tokensSold, stockCount, name, symbol, totalSupply, metadata] = await Promise.all([
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "phase", ...at }),
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "netReserveUsd1e18", ...at }).catch(() => 0n),
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "currentPriceUsd1e18", ...at }),
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "tokensSold", ...at }),
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "quoteAssetCount", ...at }),
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "name", ...at }),
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "symbol", ...at }),
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "totalSupply", ...at }),
    rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "metadataOf", args: [record.token], ...at }) as Promise<{
      description: string;
      imageURI: string;
      website: string;
      xProfile: string;
      telegram: string;
    }>,
  ]);
  const addresses = (await Promise.all(
    Array.from({ length: Number(stockCount) }, (_, index) =>
      rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "quoteAssets", args: [BigInt(index)], ...at })
    )
  )) as Address[];
  const stocks = await Promise.all(
    addresses.map(async (address) => {
      const [symbolValue, weight, decimals, rewards] = await Promise.all([
        rpc.readContract({ address, abi: ERC20, functionName: "symbol", ...at }).catch(() => "STOCK"),
        rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "fixedWeightBps", args: [address], ...at }),
        rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "decimalsFor", args: [address], ...at }),
        rpc.readContract({ address: record.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "rewardState", args: [address], ...at }) as Promise<RewardStateTuple>,
      ]);
      return {
        address: getAddress(address),
        symbol: String(symbolValue).slice(0, 16),
        weightBps: Number(weight),
        decimals: Number(decimals),
        totalReceived: rewards.totalReceived.toString(),
      };
    })
  );
  const phase = stockRewardsPhase(Number(phaseValue));
  const graduationUsd = record.graduationUsd1e18;
  const progressBps = phase === "CurveActive"
    ? Number(graduationUsd > 0n ? (netReserveUsd * 10_000n) / graduationUsd : 0n)
    : 10_000;
  let priceUsd = curvePrice as bigint;
  if (phase === "Graduated" && stocks.length) {
    // The curve's price froze at graduation; the market lives in the pools.
    const poolPrice = await graduatedPrice(rpc, record, stocks[0].address, blockNumber);
    if (poolPrice > 0n) priceUsd = poolPrice;
  }
  const row: StockRewardsLaunch = {
    id,
    creator: record.creator,
    token: record.token,
    curve,
    feeRouter: record.feeRouter,
    createdAt: Number(record.createdAt),
    name: String(name).slice(0, 64),
    symbol: String(symbol).slice(0, 16),
    imageURI: metadata.imageURI || null,
    phase,
    graduationUsd1e18: graduationUsd.toString(),
    netReserveUsd1e18: (netReserveUsd as bigint).toString(),
    progressBps: Math.min(10_000, progressBps),
    priceUsd1e18: priceUsd.toString(),
    totalSupply: (totalSupply as bigint).toString(),
    tokensSold: (tokensSold as bigint).toString(),
    creatorFeeBps: Number(record.creatorFeeBps),
    holderFeeBps: Number(record.holderFeeBps),
    protocolFeeBps: 50,
    poolFee: Number(record.poolFee),
    stocks,
  };
  return { row, metadata, addresses };
}

async function graduatedPrice(rpc: PublicClient, record: LaunchRecord, stock: Address, blockNumber: bigint) {
  try {
    const v3 = (await rpc.readContract({ address: STOCK_REWARDS.factory as Address, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "pancakeV3Factory", blockNumber })) as Address;
    const pool = await rpc.readContract({ address: v3, abi: V3_FACTORY, functionName: "getPool", args: [record.token, stock, record.poolFee], blockNumber });
    if (pool.toLowerCase() === NO_ADDRESS) return 0n;
    const [slot0, token0, decimals, price] = await Promise.all([
      rpc.readContract({ address: pool, abi: V3_POOL, functionName: "slot0", blockNumber }),
      rpc.readContract({ address: pool, abi: V3_POOL, functionName: "token0", blockNumber }),
      rpc.readContract({ address: record.curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: "decimalsFor", args: [stock], blockNumber }),
      stockPrice(rpc, record.curve, stock, blockNumber),
    ]);
    return poolTokenPriceUsd(slot0[0], token0.toLowerCase() === record.token.toLowerCase(), Number(decimals), price);
  } catch {
    return 0n;
  }
}

export async function readStockRewardsLaunches(offset = 0, limit = 24) {
  if (!STOCK_REWARDS.enabled || !STOCK_REWARDS.factory) {
    return { configured: false as const, chainId: FORTUNE_NETWORK.chainId, total: 0, launchesPaused: null, blockNumber: null, launches: [] as StockRewardsLaunch[] };
  }
  const rpc = client();
  const blockNumber = await rpc.getBlockNumber();
  const factory = STOCK_REWARDS.factory;
  const [count, launchesPaused] = await Promise.all([
    rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "launchCount", blockNumber }),
    rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "launchesPaused", blockNumber }),
  ]);
  const total = Number(count);
  const ids: number[] = [];
  for (let id = total - 1 - offset; id >= 0 && ids.length < limit; id--) ids.push(id);
  const launches = await Promise.all(
    ids.map(async (id) => {
      const record = (await rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "launchAt", args: [BigInt(id)], blockNumber })) as LaunchRecord;
      return (await readSummary(rpc, id, record, blockNumber)).row;
    })
  );
  return { configured: true as const, chainId: FORTUNE_NETWORK.chainId, total, launchesPaused: Boolean(launchesPaused), blockNumber: blockNumber.toString(), launches };
}

export async function readStockRewardsLaunch(curveAddress: string): Promise<StockRewardsLaunchDetail | null> {
  if (!STOCK_REWARDS.enabled || !STOCK_REWARDS.factory || !isAddress(curveAddress)) return null;
  const rpc = client();
  const factory = STOCK_REWARDS.factory;
  const curve = getAddress(curveAddress);
  const block = await rpc.getBlock();
  const blockNumber = block.number;
  const at = { blockNumber };
  const indexPlusOne = Number(await rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "curveIndexPlusOne", args: [curve], ...at }));
  if (!indexPlusOne) return null;
  const id = indexPlusOne - 1;
  const record = (await rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "launchAt", args: [BigInt(id)], ...at })) as LaunchRecord;
  const { row, metadata, addresses } = await readSummary(rpc, id, record, blockNumber);
  const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
    rpc.readContract({ address: curve, abi: STOCK_REWARDS_CURVE_ABI, functionName: functionName as "phase", args: args as [], ...at }) as unknown as Promise<T>;

  const [launchTimestamp, graduationReadyAt, rescueDelay, rescueSupply, rescueRedeemed, eligibleSupply, inventory, surrendered, status, positionIds, v3Factory] =
    await Promise.all([
      read<bigint>("launchTimestamp"),
      read<bigint>("graduationReadyAt"),
      read<number>("GRADUATION_RESCUE_DELAY"),
      read<bigint>("rescueSupply"),
      read<bigint>("rescueRedeemed"),
      rpc.readContract({ address: record.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "eligibleSupply", ...at }),
      rpc.readContract({ address: record.token, abi: ERC20, functionName: "balanceOf", args: [curve], ...at }),
      rpc.readContract({ address: record.feeRouter, abi: STOCK_REWARDS_FEE_ROUTER_ABI, functionName: "creatorFeesSurrenderedToHolders", ...at }),
      rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "graduationStatus", args: [curve], ...at }) as Promise<
        readonly [bigint, bigint, bigint, Hex, boolean]
      >,
      rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "positionIds", args: [record.token], ...at }) as Promise<readonly bigint[]>,
      rpc.readContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "pancakeV3Factory", ...at }) as Promise<Address>,
    ]);

  const graduated = row.phase === "Graduated";
  // Fixed baskets give every stock a pool, so positions are in stock order.
  const uncollected = graduated ? await readUncollectedFees(rpc, record.token, positionIds, blockNumber) : [];
  const stocks = await Promise.all(
    addresses.map(async (address, index) => {
      const [name, decimals, reserve, target, price, stored, preview, held, pool, category, faucetAmount] = await Promise.all([
        rpc.readContract({ address, abi: ERC20, functionName: "name", ...at }).catch(() => ""),
        read<number>("decimalsFor", [address]),
        read<bigint>("reserve", [address]),
        read<bigint>("fixedTargetReserveUsd", [address]),
        stockPrice(rpc, curve, address, blockNumber),
        rpc.readContract({ address: record.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "rewardState", args: [address], ...at }) as Promise<RewardStateTuple>,
        rpc.readContract({ address: record.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "previewRewardState", args: [address], ...at }) as Promise<RewardStateTuple>,
        rpc.readContract({ address, abi: ERC20, functionName: "balanceOf", args: [record.token], ...at }).catch(() => 0n),
        graduated
          ? rpc.readContract({ address: v3Factory, abi: V3_FACTORY, functionName: "getPool", args: [record.token, address, record.poolFee], ...at }).catch(() => NO_ADDRESS as Address)
          : Promise.resolve(NO_ADDRESS as Address),
        readCategory(rpc, address, blockNumber),
        rpc.readContract({ address, abi: TEST_STOCK_ABI, functionName: "faucetAmount", ...at }).catch(() => null),
      ]);
      const fees = uncollected[index];
      const launchFirst = record.token.toLowerCase() < address.toLowerCase();
      const scale = 10n ** BigInt(decimals);
      const known = stored.owed + stored.streaming;
      const stock: BasketStock = {
        address,
        symbol: row.stocks[index].symbol,
        name: String(name).slice(0, 64),
        decimals: Number(decimals),
        category,
        weightBps: row.stocks[index].weightBps,
        reserve: reserve.toString(),
        reserveUsd1e18: (price > 0n ? (reserve * price) / scale : 0n).toString(),
        targetUsd1e18: target.toString(),
        priceUsd1e18: price.toString(),
        pool: pool.toLowerCase() === NO_ADDRESS ? null : pool,
        poolFees: fees ? { stock: (launchFirst ? fees[1] : fees[0]).toString(), token: (launchFirst ? fees[0] : fees[1]).toString() } : null,
        faucetAmount: faucetAmount === null ? null : String(faucetAmount),
        rewards: {
          owed: preview.owed.toString(),
          streaming: preview.streaming.toString(),
          streamEnd: Number(preview.streamEnd),
          totalReceived: preview.totalReceived.toString(),
          waiting: (held > known ? held - known : 0n).toString(),
        },
      };
      return stock;
    })
  );

  const [attempts, failures, , lastFailureCode, completed] = status;
  return {
    ...row,
    description: metadata.description || null,
    website: metadata.website || null,
    xProfile: metadata.xProfile || null,
    telegram: metadata.telegram || null,
    launchTimestamp: Number(launchTimestamp),
    graduationReadyAt: Number(graduationReadyAt),
    rescueDelaySeconds: Number(rescueDelay),
    eligibleSupply: (eligibleSupply as bigint).toString(),
    curveInventory: (inventory as bigint).toString(),
    creatorFeesToHolders: Boolean(surrendered),
    graduation: {
      attempts: Number(attempts),
      failures: Number(failures),
      lastFailure: Number(failures) > 0 && !completed ? bytes32Text(lastFailureCode) : null,
      completed,
    },
    positionIds: positionIds.map((value) => value.toString()),
    rescue: row.phase === "Rescued" ? { supply: rescueSupply.toString(), redeemed: rescueRedeemed.toString() } : null,
    stocks,
    blockNumber: blockNumber.toString(),
    blockTimestamp: Number(block.timestamp),
  };
}

/** What collecting each locked position would pay now, as (amount0, amount1), by simulating the locker's collectFees. */
async function readUncollectedFees(rpc: PublicClient, token: Address, positionIds: readonly bigint[], blockNumber: bigint) {
  if (!positionIds.length) return [];
  try {
    const locker = (await rpc.readContract({ address: STOCK_REWARDS.factory as Address, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "liquidityLocker", blockNumber })) as Address;
    return await Promise.all(
      positionIds.map(async (id) => {
        try {
          const { result } = await rpc.simulateContract({ address: locker, abi: STOCK_REWARDS_LOCKER_ABI, functionName: "collectFees", args: [id], account: token, blockNumber });
          return result as readonly [bigint, bigint];
        } catch {
          return null;
        }
      })
    );
  } catch {
    return [];
  }
}

async function readCategory(rpc: PublicClient, stock: Address, blockNumber: bigint) {
  try {
    const registry = (await rpc.readContract({ address: STOCK_REWARDS.factory as Address, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "registry", blockNumber })) as Address;
    const config = (await rpc.readContract({ address: registry, abi: STOCK_REWARDS_REGISTRY_ABI, functionName: "assetConfig", args: [stock], blockNumber })) as { category: string };
    return String(config.category).slice(0, 32);
  } catch {
    return "";
  }
}
