import { createPublicClient, fallback, getAddress, http, isAddress, parseAbi, type Address, type PublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CUSTOM_PAIRS, customPhase, type CustomPairPhase } from "@/lib/custom-pairs";
import { CUSTOM_PAIR_CURVE_ABI, CUSTOM_PAIR_FACTORY_ABI } from "@/lib/custom-pairs-artifacts";

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);
const V2_PAIR = parseAbi([
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
]);

export type CustomPairLaunch = {
  id: number;
  creator: Address;
  token: Address;
  curve: Address;
  pool: Address;
  createdAt: number;
  name: string;
  symbol: string;
  imageURI: string | null;
  pair: { address: Address; symbol: string; name: string; decimals: number };
  phase: CustomPairPhase;
  supply: string;
  /** Current total supply: the launch supply until graduation burns the unsold rest. */
  totalSupply: string;
  circulating: string;
  reserve: string;
  shieldReserve: string;
  graduationTarget: string;
  progressBps: number;
  /** Pair-token base units per whole launch token, scaled by 1e18: the curve price, or the pool price once graduated. */
  spotPriceX18: string;
  /** Pair tokens in the PancakeSwap pool after graduation. */
  poolPairReserve: string | null;
  tradeCount: number;
  protocolFeeBps: number;
  creatorFeeBps: number;
};

export type CustomPairLaunchDetail = CustomPairLaunch & {
  description: string | null;
  website: string | null;
  xProfile: string | null;
  telegram: string | null;
  launchTimestamp: number;
  virtualReserve: string;
  creatorFeeRecipient: Address;
  protocolFeesOwed: string;
  creatorFeesOwed: string;
  pairBalance: string;
  inventory: string;
  tokenTotalSupply: string;
  graduationReadyAt: number;
  rescueDelaySeconds: number;
  graduation: { pairDelivered: string; launchTokens: string; liquidity: string } | null;
  poolReserves: { pair: string; launch: string } | null;
  rescue: { circulating: string; holderClaims: string } | null;
  blockNumber: string;
  blockTimestamp: number;
};

let cached: PublicClient | null = null;

export function customPairClient() {
  if (cached) return cached;
  const urls = configuredRpcUrls(FORTUNE_NETWORK.chainId);
  cached = createPublicClient({
    chain: FORTUNE_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: fallback((urls.length ? urls : [FORTUNE_NETWORK.publicRpcUrl]).map((url) => http(url, { timeout: 10_000, retryCount: 1 }))),
    batch: { multicall: { wait: 16 } },
  }) as PublicClient;
  return cached;
}

type CurveStateTuple = {
  phase: number;
  reserve: bigint;
  shieldReserve: bigint;
  protocolFeesOwed: bigint;
  creatorFeesOwed: bigint;
  circulating: bigint;
  inventory: bigint;
  pairBalance: bigint;
  spotPriceX18: bigint;
  progressBps: bigint;
  shieldTaxBps: number;
  walletCapActive: boolean;
  graduationReadyAt: bigint;
  tradeCount: bigint;
};

type LaunchRecord = { creator: Address; token: Address; curve: Address; pairToken: Address; pool: Address; createdAt: bigint };

async function readRow(rpc: PublicClient, id: number, record: LaunchRecord, blockNumber: bigint) {
  const factory = CUSTOM_PAIRS.factory as Address;
  const at = { blockNumber };
  const [state, name, symbol, pairSymbol, pairName, pairDecimals, target, supply, protocolFeeBps, creatorFeeBps, metadata, totalSupply] = await Promise.all([
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "state", ...at }) as Promise<CurveStateTuple>,
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "name", ...at }),
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "symbol", ...at }),
    rpc.readContract({ address: record.pairToken, abi: ERC20, functionName: "symbol", ...at }).catch(() => "PAIR"),
    rpc.readContract({ address: record.pairToken, abi: ERC20, functionName: "name", ...at }).catch(() => ""),
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "pairDecimals", ...at }),
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "graduationTarget", ...at }),
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "launchSupply", ...at }),
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "protocolFeeBps", ...at }),
    rpc.readContract({ address: record.curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "creatorFeeBps", ...at }),
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "metadataOf", args: [record.token], ...at }),
    rpc.readContract({ address: record.token, abi: ERC20, functionName: "totalSupply", ...at }),
  ]);
  const phase = customPhase(state.phase);
  let spotPriceX18 = state.spotPriceX18;
  let poolPairReserve: string | null = null;
  if (phase === "Graduated") {
    // The curve is empty after graduation; the market price lives in the pool.
    const [reserves, token0] = await Promise.all([
      rpc.readContract({ address: record.pool, abi: V2_PAIR, functionName: "getReserves", ...at }),
      rpc.readContract({ address: record.pool, abi: V2_PAIR, functionName: "token0", ...at }),
    ]);
    const pairFirst = token0.toLowerCase() === record.pairToken.toLowerCase();
    const pairReserve = pairFirst ? reserves[0] : reserves[1];
    const launchReserve = pairFirst ? reserves[1] : reserves[0];
    if (launchReserve > 0n) spotPriceX18 = (pairReserve * 10n ** 36n) / launchReserve;
    poolPairReserve = pairReserve.toString();
  }
  const row: CustomPairLaunch = {
    id,
    creator: record.creator,
    token: record.token,
    curve: record.curve,
    pool: record.pool,
    createdAt: Number(record.createdAt),
    name: String(name).slice(0, 64),
    symbol: String(symbol).slice(0, 16),
    imageURI: metadata.imageURI || null,
    pair: { address: record.pairToken, symbol: String(pairSymbol).slice(0, 32), name: String(pairName).slice(0, 64), decimals: Number(pairDecimals) },
    phase,
    supply: supply.toString(),
    totalSupply: totalSupply.toString(),
    circulating: state.circulating.toString(),
    reserve: state.reserve.toString(),
    shieldReserve: state.shieldReserve.toString(),
    graduationTarget: target.toString(),
    progressBps: Number(state.progressBps),
    spotPriceX18: spotPriceX18.toString(),
    poolPairReserve,
    tradeCount: Number(state.tradeCount),
    protocolFeeBps: Number(protocolFeeBps),
    creatorFeeBps: Number(creatorFeeBps),
  };
  return { row, state, metadata };
}

export async function readCustomPairLaunches(offset = 0, limit = 24) {
  if (!CUSTOM_PAIRS.enabled || !CUSTOM_PAIRS.factory) {
    return {
      configured: false as const,
      chainId: FORTUNE_NETWORK.chainId,
      total: 0,
      blockNumber: null,
      protocolFeeBps: null,
      launchesPaused: null,
      launches: [] as CustomPairLaunch[],
    };
  }
  const rpc = customPairClient();
  const blockNumber = await rpc.getBlockNumber();
  const factory = CUSTOM_PAIRS.factory;
  const [count, protocolFeeBps, launchesPaused] = await Promise.all([
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchCount", blockNumber }),
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "protocolFeeBps", blockNumber }),
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchesPaused", blockNumber }),
  ]);
  const total = Number(count);
  const ids: number[] = [];
  for (let id = total - 1 - offset; id >= 0 && ids.length < limit; id--) ids.push(id);
  const launches = await Promise.all(
    ids.map(async (id) => {
      const record = (await rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchAt", args: [BigInt(id)], blockNumber })) as LaunchRecord;
      return (await readRow(rpc, id, record, blockNumber)).row;
    })
  );
  return {
    configured: true as const,
    chainId: FORTUNE_NETWORK.chainId,
    total,
    blockNumber: blockNumber.toString(),
    protocolFeeBps: Number(protocolFeeBps),
    launchesPaused: Boolean(launchesPaused),
    launches,
  };
}

export async function readCustomPairLaunch(curveAddress: string): Promise<CustomPairLaunchDetail | null> {
  if (!CUSTOM_PAIRS.enabled || !CUSTOM_PAIRS.factory || !isAddress(curveAddress)) return null;
  const rpc = customPairClient();
  const curve = getAddress(curveAddress);
  const factory = CUSTOM_PAIRS.factory;
  const block = await rpc.getBlock();
  const blockNumber = block.number;
  const indexPlusOne = Number(await rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "curveIndexPlusOne", args: [curve], blockNumber }));
  if (!indexPlusOne) return null;
  const id = indexPlusOne - 1;
  const record = (await rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchAt", args: [BigInt(id)], blockNumber })) as LaunchRecord;
  const { row, state, metadata } = await readRow(rpc, id, record, blockNumber);
  const at = { blockNumber };
  const read = <T,>(functionName: string) =>
    rpc.readContract({ address: curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: functionName as "reserve", ...at }) as unknown as Promise<T>;
  const [launchTimestamp, virtualReserve, creatorFeeRecipient, rescueDelay, delivered, launchTokens, liquidity, rescueCirculating, rescueHolderClaims] =
    await Promise.all([
      read<bigint>("launchTimestamp"),
      read<bigint>("virtualReserve"),
      read<Address>("creatorFeeRecipient"),
      read<number>("GRADUATION_RESCUE_DELAY"),
      read<bigint>("graduationPairDelivered"),
      read<bigint>("graduationLaunchTokens"),
      read<bigint>("graduationLiquidity"),
      read<bigint>("rescueCirculating"),
      read<bigint>("rescueHolderClaims"),
    ]);

  let poolReserves: CustomPairLaunchDetail["poolReserves"] = null;
  if (row.phase === "Graduated") {
    const [reserves, token0] = await Promise.all([
      rpc.readContract({ address: record.pool, abi: V2_PAIR, functionName: "getReserves", ...at }),
      rpc.readContract({ address: record.pool, abi: V2_PAIR, functionName: "token0", ...at }),
    ]);
    const pairFirst = token0.toLowerCase() === record.pairToken.toLowerCase();
    poolReserves = { pair: (pairFirst ? reserves[0] : reserves[1]).toString(), launch: (pairFirst ? reserves[1] : reserves[0]).toString() };
  }

  return {
    ...row,
    description: metadata.description || null,
    website: metadata.website || null,
    xProfile: metadata.xProfile || null,
    telegram: metadata.telegram || null,
    launchTimestamp: Number(launchTimestamp),
    virtualReserve: virtualReserve.toString(),
    creatorFeeRecipient,
    protocolFeesOwed: state.protocolFeesOwed.toString(),
    creatorFeesOwed: state.creatorFeesOwed.toString(),
    pairBalance: state.pairBalance.toString(),
    inventory: state.inventory.toString(),
    tokenTotalSupply: row.totalSupply,
    graduationReadyAt: Number(state.graduationReadyAt),
    rescueDelaySeconds: Number(rescueDelay),
    graduation: row.phase === "Graduated" ? { pairDelivered: delivered.toString(), launchTokens: launchTokens.toString(), liquidity: liquidity.toString() } : null,
    poolReserves,
    rescue: row.phase === "Rescued" ? { circulating: rescueCirculating.toString(), holderClaims: rescueHolderClaims.toString() } : null,
    blockNumber: blockNumber.toString(),
    blockTimestamp: Number(block.timestamp),
  };
}
