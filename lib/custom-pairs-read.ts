import { createPublicClient, fallback, getAddress, http, isAddress, parseAbi, type Address, type PublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CUSTOM_PAIRS, customPhase, type CustomPairPhase } from "@/lib/custom-pairs";
import { CUSTOM_PAIR_CURVE_ABI, CUSTOM_PAIR_FACTORY_ABI, CUSTOM_PAIR_TOKEN_ABI, LAUNCH_RULES_ABI, SOCIAL_FEE_VAULT_ABI } from "@/lib/custom-pairs-artifacts";
import type { LaunchRulesView } from "@/lib/launch-rules";
import { toIdentity, type IdentityTuple, type SocialIdentity } from "@/lib/social-fees";

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
  /** FortuneLaunchRules when the launch was created with rules; null otherwise (and for launches from before rules existed). */
  rulesContract: Address | null;
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
  /** Set when the creator fee is split between wallets and social accounts through the social fee vault. */
  feeSplit: { vault: Address; collected: string; recipients: Array<SocialIdentity & { shareBps: number }> } | null;
  /** The launch's rules, when it has any. */
  rules: LaunchRulesView | null;
  blockNumber: string;
  blockTimestamp: number;
};

/** A split launch's creator-fee recipient is the social fee vault; any other recipient is a plain wallet. */
async function readFeeSplit(rpc: PublicClient, curve: Address, recipient: Address, blockNumber: bigint): Promise<CustomPairLaunchDetail["feeSplit"]> {
  const code = await rpc.getCode({ address: recipient, blockNumber }).catch(() => undefined);
  if (!code || code === "0x") return null;
  try {
    const [recipients, collected] = await Promise.all([
      rpc.readContract({ address: recipient, abi: SOCIAL_FEE_VAULT_ABI, functionName: "curveRecipients", args: [curve], blockNumber }) as Promise<
        readonly [readonly IdentityTuple[], readonly number[]]
      >,
      rpc.readContract({ address: recipient, abi: SOCIAL_FEE_VAULT_ABI, functionName: "collectedByCurve", args: [curve], blockNumber }) as Promise<bigint>,
    ]);
    const [identities, shares] = recipients;
    if (!identities.length) return null;
    return {
      vault: recipient,
      collected: collected.toString(),
      recipients: identities.map((identity, index) => ({ ...toIdentity(identity), shareBps: Number(shares[index]) })),
    };
  } catch {
    return null;
  }
}

const NO_ADDRESS = "0x0000000000000000000000000000000000000000";

type StoredRules = {
  launchTimestamp: bigint;
  maxWalletBps: number;
  maxBuyBps: number;
  maxSellBps: number;
  sellCooldown: number;
  curveOnly: boolean;
  vestingWindow: number;
  vestingCliff: number;
  vestingDuration: number;
  allowlistSeconds: number;
  allowlistCount: number;
  gateToken: Address;
  gateMinBalance: bigint;
  gateSeconds: number;
  exemptList: readonly Address[];
};

async function readLaunchRules(rpc: PublicClient, token: Address, contract: Address, blockNumber: bigint): Promise<LaunchRulesView | null> {
  try {
    const [stored, caps, active] = await Promise.all([
      rpc.readContract({ address: contract, abi: LAUNCH_RULES_ABI, functionName: "rulesOf", args: [token], blockNumber }) as Promise<StoredRules>,
      rpc.readContract({ address: contract, abi: LAUNCH_RULES_ABI, functionName: "capsOf", args: [token], blockNumber }) as Promise<readonly [bigint, bigint, bigint]>,
      rpc.readContract({ address: contract, abi: LAUNCH_RULES_ABI, functionName: "active", args: [token], blockNumber }) as Promise<boolean>,
    ]);
    const gateToken = stored.gateToken.toLowerCase() === NO_ADDRESS ? null : stored.gateToken;
    let gate: LaunchRulesView["gate"] = null;
    if (gateToken) {
      const [symbol, decimals] = await Promise.all([
        rpc.readContract({ address: gateToken, abi: ERC20, functionName: "symbol", blockNumber }).catch(() => "TOKEN"),
        rpc.readContract({ address: gateToken, abi: ERC20, functionName: "decimals", blockNumber }).catch(() => 18),
      ]);
      gate = { symbol: String(symbol).slice(0, 16), decimals: Number(decimals) };
    }
    return {
      address: contract,
      active,
      launchTimestamp: Number(stored.launchTimestamp),
      maxWalletBps: Number(stored.maxWalletBps),
      maxBuyBps: Number(stored.maxBuyBps),
      maxSellBps: Number(stored.maxSellBps),
      sellCooldown: Number(stored.sellCooldown),
      curveOnly: Boolean(stored.curveOnly),
      vestingWindow: Number(stored.vestingWindow),
      vestingCliff: Number(stored.vestingCliff),
      vestingDuration: Number(stored.vestingDuration),
      allowlistSeconds: Number(stored.allowlistSeconds),
      allowlistCount: Number(stored.allowlistCount),
      gateToken,
      gateMinBalance: stored.gateMinBalance.toString(),
      gateSeconds: Number(stored.gateSeconds),
      gate,
      exempt: [...stored.exemptList],
      caps: { maxWallet: caps[0].toString(), maxBuy: caps[1].toString(), maxSell: caps[2].toString() },
    };
  } catch {
    return null;
  }
}

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
  const [state, name, symbol, pairSymbol, pairName, pairDecimals, target, supply, protocolFeeBps, creatorFeeBps, metadata, totalSupply, rulesContract] = await Promise.all([
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
    // Tokens from before launch rules have no rules() at all.
    rpc.readContract({ address: record.token, abi: CUSTOM_PAIR_TOKEN_ABI, functionName: "rules", ...at }).catch(() => NO_ADDRESS as Address),
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
    rulesContract: String(rulesContract).toLowerCase() === NO_ADDRESS ? null : (rulesContract as Address),
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
      launchRules: null as Address | null,
      launches: [] as CustomPairLaunch[],
    };
  }
  const rpc = customPairClient();
  const blockNumber = await rpc.getBlockNumber();
  const factory = CUSTOM_PAIRS.factory;
  const [count, protocolFeeBps, launchesPaused, launchRules] = await Promise.all([
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchCount", blockNumber }),
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "protocolFeeBps", blockNumber }),
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchesPaused", blockNumber }),
    // Factories from before launch rules have no launchRules() at all.
    rpc.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "launchRules", blockNumber }).catch(() => NO_ADDRESS as Address),
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
    /** Set when this factory offers optional launch rules. */
    launchRules: String(launchRules).toLowerCase() === NO_ADDRESS ? null : (launchRules as Address),
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

  const [feeSplit, rules] = await Promise.all([
    readFeeSplit(rpc, curve, creatorFeeRecipient, blockNumber),
    row.rulesContract ? readLaunchRules(rpc, record.token, row.rulesContract, blockNumber) : Promise.resolve(null),
  ]);

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
    feeSplit,
    rules,
    blockNumber: blockNumber.toString(),
    blockTimestamp: Number(block.timestamp),
  };
}
