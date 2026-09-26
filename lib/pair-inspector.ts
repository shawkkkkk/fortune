import {
  createPublicClient,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  fallback,
  getAddress,
  http,
  isAddress,
  keccak256,
  numberToHex,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { PAIR_TOKEN_PROBE_ABI, PAIR_TOKEN_PROBE_RUNTIME } from "@/lib/custom-pairs-artifacts";

// Pair-token inspector for custom pairs. It reads a token's metadata and
// bytecode, then simulates the transfers a custom-pair curve makes (buyer to
// curve, curve to seller, curve to pool) with eth_call state overrides and
// measures every balance change. Nothing is signed or broadcast.

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function getOwner() view returns (address)",
]);
const V2_FACTORY = parseAbi(["function getPair(address,address) view returns (address)"]);
const BEACON = parseAbi(["function implementation() view returns (address)"]);

const SLOT_1967_IMPLEMENTATION = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SLOT_1967_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const SLOT_ZEPPELINOS = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";
const DEAD: Address = "0x000000000000000000000000000000000000dEaD";

// Stand-in addresses for the simulated curve, wallet and pool. They hold no
// state on either BSC network; the probe code is placed there for one call.
const SIM_CURVE: Address = "0x5eed00000000000000000000000000000000c0e0";
const SIM_WALLET: Address = "0x5eed00000000000000000000000000000000c0e1";
const SIM_POOL: Address = "0x5eed00000000000000000000000000000000c0e2";
// A fresh wallet given a synthetic balance, so the simulation behaves like a new buyer.
const SIM_HOLDER: Address = "0x5eed00000000000000000000000000000000c0df";
const SIM_ORIGIN: Address = "0x5eed00000000000000000000000000000000c0de";
const PROXY_SLOTS = new Set([SLOT_1967_IMPLEMENTATION, SLOT_1967_BEACON, SLOT_ZEPPELINOS, "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"]);

type NetworkRefs = {
  pancakeV2Factory: Address;
  quotes: Address[];
  exchangeWallets: Address[];
};

const NETWORKS: Record<number, NetworkRefs> = {
  56: {
    pancakeV2Factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    quotes: [
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
      "0x55d398326f99059fF775485246999027B3197955", // USDT
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
    ],
    exchangeWallets: [
      "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
      "0x5a52E96BAcdaBb82fd05763E25335261B270Efcb",
    ],
  },
  97: {
    pancakeV2Factory: "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc",
    quotes: ["0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"], // WBNB
    exchangeWallets: [],
  },
};

const SELECTOR_GROUPS = {
  pause: ["pause()", "unpause()", "paused()", "setPaused(bool)"],
  blacklist: [
    "blacklist(address)",
    "addToBlacklist(address)",
    "isBlacklisted(address)",
    "isBlackListed(address)",
    "addBlackList(address)",
    "setBlacklist(address,bool)",
    "blacklistAddress(address,bool)",
    "_isBlacklisted(address)",
    "isBlocked(address)",
    "freeze(address)",
    "isFrozen(address)",
    "setBots(address[])",
    "blockBots(address[])",
    "isBot(address)",
  ],
  mint: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)", "issue(uint256)"],
  feeChange: [
    "setTaxFee(uint256)",
    "setFee(uint256)",
    "setFees(uint256,uint256)",
    "setBuyFee(uint256)",
    "setSellFee(uint256)",
    "setBuyTax(uint256)",
    "setSellTax(uint256)",
    "setTaxes(uint256,uint256)",
    "setTax(uint256)",
    "updateFees(uint256,uint256)",
    "updateBuyFees(uint256,uint256,uint256)",
    "updateSellFees(uint256,uint256,uint256)",
    "setTransferFee(uint256)",
    "setLiquidityFeePercent(uint256)",
    "setTaxFeePercent(uint256)",
  ],
  limits: [
    "_maxTxAmount()",
    "maxTransactionAmount()",
    "maxWallet()",
    "_maxWalletSize()",
    "maxWalletAmount()",
    "setMaxTxPercent(uint256)",
    "setMaxWalletPercent(uint256)",
    "updateMaxTxnAmount(uint256)",
    "updateMaxWalletAmount(uint256)",
    "setMaxTxAmount(uint256)",
    "setMaxWalletSize(uint256)",
  ],
  rebasing: [
    "rebase(uint256,int256)",
    "rebase(uint256)",
    "multiplier()",
    "sharesOf(address)",
    "getSharesByPooledEth(uint256)",
    "scaledBalanceOf(address)",
    "gonsPerFragment()",
  ],
} as const;

export type ControlGroup = keyof typeof SELECTOR_GROUPS;

const SELECTORS: Record<ControlGroup, Set<string>> = Object.fromEntries(
  Object.entries(SELECTOR_GROUPS).map(([group, signatures]) => [
    group,
    new Set(signatures.map((signature) => toFunctionSelector(signature).slice(2).toLowerCase())),
  ])
) as Record<ControlGroup, Set<string>>;

/** Four-byte values pushed by PUSH1..PUSH4, which is how dispatchers compare selectors. */
export function pushedSelectors(code: string) {
  const bytes = code.startsWith("0x") ? code.slice(2) : code;
  const found = new Set<string>();
  for (let i = 0; i < bytes.length; i += 2) {
    const op = parseInt(bytes.slice(i, i + 2), 16);
    if (op >= 0x60 && op <= 0x7f) {
      const size = op - 0x5f;
      if (size <= 4) found.add(bytes.slice(i + 2, i + 2 + size * 2).padStart(8, "0").toLowerCase());
      i += size * 2;
    }
  }
  return found;
}

export function controlsInCode(codes: string[]) {
  const pushed = new Set<string>();
  for (const code of codes) for (const selector of pushedSelectors(code)) pushed.add(selector);
  const result = {} as Record<ControlGroup, boolean>;
  for (const group of Object.keys(SELECTORS) as ControlGroup[]) {
    result[group] = [...SELECTORS[group]].some((selector) => pushed.has(selector));
  }
  return result;
}

/** EIP-1167 minimal proxy target, if the code is one. */
export function minimalProxyTarget(code: string): Address | null {
  const match = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
  return match ? getAddress("0x" + match[1]) : null;
}

function slotAddress(value: Hex | undefined) {
  if (!value || /^0x0*$/.test(value)) return null;
  const address = "0x" + value.slice(-40);
  return isAddress(address) && !/^0x0{40}$/.test(address) ? getAddress(address) : null;
}

export type TransferLeg = {
  attempted: boolean;
  ok: boolean;
  amount: string;
  received: string;
  senderSpent: string;
  taxBps: number | null;
  extraSenderBps: number;
  reverted: boolean;
};

export type FindingLevel = "block" | "warn" | "info";
export type Finding = { code: string; level: FindingLevel; value?: number };

export type PairInspection = {
  chainId: number;
  blockNumber: string;
  address: Address;
  token: { name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null };
  contract: {
    codeSize: number;
    implementation: Address | null;
    owner: Address | null;
    controls: Record<ControlGroup, boolean>;
  };
  simulation: {
    holder: Address | null;
    holderKind: "fresh" | "wallet" | "burn" | "owner" | "exchange" | "pool" | null;
    holderBalance: string | null;
    buy: TransferLeg | null;
    sell: TransferLeg | null;
    pool: TransferLeg | null;
  };
  maxTaxBps: number | null;
  verdict: "unsupported" | "caution" | "clear";
  findings: Finding[];
};

function clientFor(chainId: number) {
  const configured = configuredRpcUrls(chainId);
  const fallbackUrl =
    chainId === FORTUNE_NETWORK.chainId
      ? FORTUNE_NETWORK.publicRpcUrl
      : chainId === 56
        ? process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org"
        : "https://bsc-testnet-dataseed.bnbchain.org";
  const urls = configured.length ? configured : [fallbackUrl];
  return createPublicClient({
    chain: chainId === 56 ? bsc : bscTestnet,
    transport: fallback(urls.map((url) => http(url, { timeout: 8_000, retryCount: 0 }))),
  }) as PublicClient;
}

/** Share of `amount` that did not arrive, in basis points, rounded down so wei-level rounding reads as zero. */
function bpsLost(amount: bigint, received: bigint) {
  if (amount <= 0n || received >= amount) return 0;
  return Number(((amount - received) * 10_000n) / amount);
}

type ProbeLeg = {
  attempted: boolean;
  ok: boolean;
  amount: bigint;
  senderSpent: bigint;
  recipientReceived: bigint;
  revertData: Hex;
};

function leg(raw: ProbeLeg): TransferLeg | null {
  if (!raw.attempted) return null;
  const ok = raw.ok && raw.recipientReceived > 0n;
  return {
    attempted: true,
    ok,
    amount: raw.amount.toString(),
    received: raw.recipientReceived.toString(),
    senderSpent: raw.senderSpent.toString(),
    taxBps: raw.ok ? (raw.recipientReceived > 0n ? bpsLost(raw.amount, raw.recipientReceived) : 10_000) : null,
    extraSenderBps: raw.senderSpent > raw.amount ? bpsLost(raw.senderSpent, raw.amount) : 0,
    reverted: !raw.ok,
  };
}

type Holder = {
  address: Address;
  kind: NonNullable<PairInspection["simulation"]["holderKind"]>;
  balance: bigint;
  stateDiff?: { slot: Hex; value: Hex };
};

const BALANCE_OF = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// Storage keys of `mapping(address => …)` at slots 0..299 for SIM_HOLDER, which covers
// plain and upgradeable (gap-shifted) layouts. Namespaced layouts fall back to raw keys.
const HOLDER_MAPPING_KEYS = new Set(
  Array.from({ length: 300 }, (_, index) =>
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [SIM_HOLDER, BigInt(index)]))
  )
);

function withTimeout<T>(work: Promise<T>, ms: number) {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Finds the storage slot behind balanceOf(SIM_HOLDER) and gives it a balance, like Foundry's deal. */
async function syntheticHolder(rpc: PublicClient, token: Address, blockNumber: bigint, totalSupply: bigint): Promise<Holder | null> {
  const data = encodeFunctionData({ abi: BALANCE_OF, functionName: "balanceOf", args: [SIM_HOLDER] });
  const access = await rpc.createAccessList({ to: token, data, blockNumber });
  const keys = access.accessList
    .filter((entry) => entry.address.toLowerCase() === token.toLowerCase())
    .flatMap((entry) => entry.storageKeys)
    .filter((slot) => !PROXY_SLOTS.has(slot.toLowerCase()));
  const keyed = keys.filter((slot) => HOLDER_MAPPING_KEYS.has(slot));
  const slots = [...keyed, ...keys.filter((slot) => !HOLDER_MAPPING_KEYS.has(slot)).slice(0, 4)].slice(0, 6);
  // A plain balance first; share or reflection accounting may need a larger raw value.
  const values = [totalSupply > 0n ? totalSupply : 10n ** 30n, 2n ** 200n];
  for (const value of values) {
    for (const slot of slots) {
      const stateDiff = { slot, value: numberToHex(value, { size: 32 }) };
      const result = await rpc
        .call({ to: token, data, blockNumber, stateOverride: [{ address: token, stateDiff: [stateDiff] }] })
        .catch(() => null);
      if (!result?.data || result.data === "0x") continue;
      const balance = BigInt(result.data);
      if (balance > 3n) return { address: SIM_HOLDER, kind: "fresh", balance, stateDiff };
    }
  }
  return null;
}

async function findHolder(
  rpc: PublicClient,
  token: Address,
  blockNumber: bigint,
  owner: Address | null,
  hint: Address | null,
  refs: NetworkRefs | undefined
) {
  const candidates: Array<{ address: Address; kind: Holder["kind"] }> = [];
  if (hint) candidates.push({ address: hint, kind: "wallet" });
  candidates.push({ address: DEAD, kind: "burn" });
  if (owner) candidates.push({ address: owner, kind: "owner" });
  for (const wallet of refs?.exchangeWallets ?? []) candidates.push({ address: wallet, kind: "exchange" });
  if (refs) {
    const pairs = await Promise.all(
      refs.quotes
        .filter((quote) => quote.toLowerCase() !== token.toLowerCase())
        .map((quote) =>
          rpc
            .readContract({ address: refs.pancakeV2Factory, abi: V2_FACTORY, functionName: "getPair", args: [token, quote], blockNumber })
            .catch(() => null)
        )
    );
    for (const pair of pairs) if (pair && !/^0x0{40}$/.test(pair)) candidates.push({ address: pair, kind: "pool" });
  }
  const unique = candidates.filter(
    (candidate, index) =>
      candidate.address.toLowerCase() !== token.toLowerCase() &&
      candidates.findIndex((other) => other.address.toLowerCase() === candidate.address.toLowerCase()) === index
  );
  const balances = await Promise.all(
    unique.map((candidate) =>
      rpc.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [candidate.address], blockNumber }).catch(() => 0n)
    )
  );
  // Prefer a wallet-like holder: a token's own AMM pool can trigger its buy/sell tax.
  const ranked = unique
    .map((candidate, index) => ({ ...candidate, balance: balances[index] }))
    .filter((candidate) => candidate.balance > 1n);
  return (ranked.find((candidate) => candidate.kind !== "pool") ?? ranked[0] ?? null) as Holder | null;
}

function verdictFor(findings: Finding[]): PairInspection["verdict"] {
  if (findings.some((finding) => finding.level === "block")) return "unsupported";
  if (findings.some((finding) => finding.level === "warn")) return "caution";
  return "clear";
}

export async function inspectPairToken(input: { address: string; chainId?: number; holder?: string | null }): Promise<PairInspection> {
  if (!isAddress(input.address)) throw new Error("invalid address");
  const address = getAddress(input.address);
  const chainId = input.chainId ?? FORTUNE_NETWORK.chainId;
  const hint = input.holder && isAddress(input.holder) ? getAddress(input.holder) : null;
  const rpc = clientFor(chainId);
  if ((await rpc.getChainId()) !== chainId) throw new Error("rpc chain mismatch");
  const blockNumber = await rpc.getBlockNumber();
  const findings: Finding[] = [];

  const code = (await rpc.getCode({ address, blockNumber })) ?? "0x";
  const empty = {
    controls: { pause: false, blacklist: false, mint: false, feeChange: false, limits: false, rebasing: false },
  };
  if (code === "0x") {
    findings.push({ code: "NO_CONTRACT", level: "block" });
    return {
      chainId,
      blockNumber: blockNumber.toString(),
      address,
      token: { name: null, symbol: null, decimals: null, totalSupply: null },
      contract: { codeSize: 0, implementation: null, owner: null, controls: empty.controls },
      simulation: { holder: null, holderKind: null, holderBalance: null, buy: null, sell: null, pool: null },
      maxTaxBps: null,
      verdict: "unsupported",
      findings,
    };
  }

  const read = <T,>(functionName: "name" | "symbol" | "decimals" | "totalSupply" | "owner" | "getOwner") =>
    rpc.readContract({ address, abi: ERC20, functionName, blockNumber }).then((value) => value as T).catch(() => null);
  const [name, symbol, decimals, totalSupply, owner, getOwner, implSlot, beaconSlot, legacySlot] = await Promise.all([
    read<string>("name"),
    read<string>("symbol"),
    read<number>("decimals"),
    read<bigint>("totalSupply"),
    read<Address>("owner"),
    read<Address>("getOwner"),
    rpc.getStorageAt({ address, slot: SLOT_1967_IMPLEMENTATION, blockNumber }).catch(() => undefined),
    rpc.getStorageAt({ address, slot: SLOT_1967_BEACON, blockNumber }).catch(() => undefined),
    rpc.getStorageAt({ address, slot: SLOT_ZEPPELINOS, blockNumber }).catch(() => undefined),
  ]);

  let implementation = slotAddress(implSlot) ?? slotAddress(legacySlot) ?? minimalProxyTarget(code);
  const beacon = slotAddress(beaconSlot);
  if (!implementation && beacon) {
    implementation = await rpc
      .readContract({ address: beacon, abi: BEACON, functionName: "implementation", blockNumber })
      .then((value) => getAddress(value))
      .catch(() => null);
  }
  const implementationCode = implementation ? ((await rpc.getCode({ address: implementation, blockNumber }).catch(() => "0x")) ?? "0x") : "0x";
  const controls = controlsInCode([code, implementationCode]);
  const ownerAddress = [owner, getOwner].find((value) => value && isAddress(value) && !/^0x0{40}$/.test(value)) ?? null;

  if (decimals === null || totalSupply === null) findings.push({ code: "NOT_ERC20", level: "block" });
  else if (decimals > 36) findings.push({ code: "DECIMALS_UNSUPPORTED", level: "block" });
  if (implementation || beacon) findings.push({ code: "UPGRADEABLE", level: "warn" });
  if (controls.pause) findings.push({ code: "PAUSABLE", level: "warn" });
  if (controls.blacklist) findings.push({ code: "BLACKLIST", level: "warn" });
  if (controls.feeChange) findings.push({ code: "FEE_CHANGEABLE", level: "warn" });
  if (controls.limits) findings.push({ code: "TRANSFER_LIMITS", level: "warn" });
  if (controls.rebasing) findings.push({ code: "REBASING", level: "warn" });
  if (controls.mint) findings.push({ code: "MINTABLE", level: "info" });
  if (ownerAddress) findings.push({ code: "HAS_OWNER", level: "info" });

  const simulation: PairInspection["simulation"] = {
    holder: null,
    holderKind: null,
    holderBalance: null,
    buy: null,
    sell: null,
    pool: null,
  };
  let maxTaxBps: number | null = null;

  if (decimals !== null && totalSupply !== null) {
    const holder =
      (await withTimeout(syntheticHolder(rpc, address, blockNumber, totalSupply).catch(() => null), 6_000)) ??
      (await withTimeout(
        findHolder(rpc, address, blockNumber, ownerAddress ? getAddress(ownerAddress) : null, hint, NETWORKS[chainId]).catch(() => null),
        6_000
      ));
    if (!holder) {
      findings.push({ code: "NO_HOLDER_FOUND", level: "info" });
    } else {
      simulation.holder = holder.address;
      simulation.holderKind = holder.kind;
      simulation.holderBalance = holder.balance.toString();
      const unit = 10n ** BigInt(Math.min(decimals, 36));
      const amount = holder.balance / 4n < unit ? holder.balance / 4n || 1n : unit;
      try {
        const data = encodeFunctionData({
          abi: PAIR_TOKEN_PROBE_ABI,
          functionName: "run",
          args: [address, amount, SIM_CURVE, SIM_WALLET, SIM_POOL],
        });
        const stateOverride = [holder.address, SIM_CURVE, SIM_WALLET, SIM_POOL].map((target) => ({
          address: target,
          code: PAIR_TOKEN_PROBE_RUNTIME as Hex,
        })) as Array<{ address: Address; code?: Hex; stateDiff?: Array<{ slot: Hex; value: Hex }> }>;
        if (holder.stateDiff) stateOverride.push({ address, stateDiff: [holder.stateDiff] });
        const result = await rpc.call({ account: SIM_ORIGIN, to: holder.address, data, blockNumber, gas: 30_000_000n, stateOverride });
        const report = decodeFunctionResult({ abi: PAIR_TOKEN_PROBE_ABI, functionName: "run", data: result.data ?? "0x" }) as {
          seed: ProbeLeg;
          payout: ProbeLeg;
          pull: ProbeLeg;
          toPool: ProbeLeg;
        };
        const seed = leg(report.seed);
        simulation.buy = leg(report.pull) ?? (holder.kind !== "pool" ? seed : null);
        simulation.sell = leg(report.payout);
        simulation.pool = leg(report.toPool);
        const legs = [seed, simulation.buy, simulation.sell, simulation.pool];
        if (legs.some((item) => item?.reverted)) findings.push({ code: "TRANSFER_REVERTS", level: "block" });
        else if (legs.some((item) => item && item.taxBps === 10_000)) findings.push({ code: "NOTHING_ARRIVES", level: "block" });
        if (legs.some((item) => item && item.extraSenderBps > 0)) findings.push({ code: "TAX_ON_TOP", level: "block" });
        const taxes = [simulation.buy, simulation.sell, simulation.pool].map((item) => item?.taxBps).filter((value): value is number => value !== null && value !== undefined);
        maxTaxBps = taxes.length ? Math.max(...taxes) : null;
        if (simulation.buy?.taxBps) findings.push({ code: "BUY_TAX", level: "warn", value: simulation.buy.taxBps });
        if (simulation.sell?.taxBps) findings.push({ code: "SELL_TAX", level: "warn", value: simulation.sell.taxBps });
        if (simulation.pool?.taxBps) findings.push({ code: "POOL_TAX", level: "warn", value: simulation.pool.taxBps });
        if (maxTaxBps !== null && maxTaxBps > 2_500) findings.push({ code: "TAX_OVER_25", level: "warn", value: maxTaxBps });
        if (holder.kind === "pool") findings.push({ code: "SIMULATED_FROM_POOL", level: "info" });
      } catch {
        findings.push({ code: "SIMULATION_UNAVAILABLE", level: "info" });
      }
    }
  }

  return {
    chainId,
    blockNumber: blockNumber.toString(),
    address,
    token: {
      name: name?.slice(0, 128) ?? null,
      symbol: symbol?.slice(0, 64) ?? null,
      decimals,
      totalSupply: totalSupply?.toString() ?? null,
    },
    contract: {
      codeSize: (code.length - 2) / 2,
      implementation,
      owner: ownerAddress ? getAddress(ownerAddress) : null,
      controls,
    },
    simulation,
    maxTaxBps,
    verdict: verdictFor(findings),
    findings,
  };
}
