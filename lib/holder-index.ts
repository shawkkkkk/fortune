import { formatUnits, parseAbiItem, type Address, type PublicClient } from "viem";
import type { HolderStore, RedisCommand, RedisValue } from "@/lib/holder-store";
import type { LedgerProviderConfig } from "@/lib/trade-ledger";

// Holder index: every Transfer of every Fortune launch, from the block that
// created it, folded into exact balances. A scheduled run (or a throttled run
// after a holders API read) moves one shared cursor forward through confirmed
// blocks; each range's balances, rankings, Launch Shield stats and the cursor
// are written in a single MULTI/EXEC, so a crash can only repeat a range, never
// half-apply it. A launch created before indexing began is "untracked".
//
// If the log provider has already pruned blocks the index still needed (the
// index went quiet for longer than the provider's history), every launch being
// tracked has a hole in its history and is marked "gap". A gap is repaired
// only when it provably can be: the balances of every address the index knows
// for that launch, read at the cursor block, must add up to its total supply
// exactly. Then no unknown address holds any of it, and the launch is exact
// again.

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const launchCreated = parseAbiItem("event LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed token, address curve, bytes32 manifestHash)");
const taxLaunchCreated = parseAbiItem("event TaxLaunchCreated(uint256 indexed launchId, address indexed creator, address indexed token, address curve, address quoteAsset, address taxProcessor, address dividendVault, bytes32 manifestHash)");
const bought = parseAbiItem("event Bought(address indexed buyer, address indexed quoteAsset, uint256 quoteIn, uint256 tokensOut, uint256 usdValue)");
const snipeTaxCharged = parseAbiItem("event SnipeTaxCharged(address indexed buyer, address indexed quoteAsset, uint256 grossQuoteIn, uint256 taxAmount, uint16 taxBps)");
const launchTimestampAbi = [{ type: "function", name: "launchTimestamp", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] }] as const;
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** The early-wallet cap window; taxed buys fall inside its first five seconds. */
export const SHIELD_WINDOW_SECONDS = 15;
/** BSC reaches fast finality within a few blocks; the index stays this far behind the head. */
export const CONFIRMATIONS = 20n;
/** Public log providers keep roughly 90,000 blocks; a fresh index starts inside that. */
export const DEFAULT_LOOKBACK = 80_000n;
const SHIELD_BLOCKS = 64n;
const MAX_CHUNK = 5_000n;
const MIN_CHUNK = 50n;
/** More transfer logs than this in one range means the range is too wide. */
const MAX_ROWS = 10_000;
/** Launches with more known holders than this are not re-checked after a gap. */
const RECONCILE_LIMIT = 5_000;
const RECONCILE_PER_RUN = 3;
/** A launch that failed its supply check is tried again after this many blocks (about an hour). */
const RECONCILE_RETRY_BLOCKS = 8_000n;
const ZERO = "0x0000000000000000000000000000000000000000";
const TOP = 10;

export type TokenStatus = "tracked" | "gap" | "inconsistent";

export type TrackedToken = {
  token: string;
  curve: string;
  creator: string;
  kind: "standard" | "tax";
  block: string;
  launchTimestamp: number;
  status: TokenStatus;
  /** Block of the last supply check after a gap. */
  checkedAt?: string;
  /** Block at which a supply check made the launch exact again. */
  reconciledAt?: string;
};

export type TransferRow = { token: string; from: string; to: string; value: bigint; block: bigint; logIndex: number };

export function holderKeys(chainId: number) {
  const prefix = `fortune:holders:v1:${chainId}`;
  return {
    state: `${prefix}:state`,
    tokens: `${prefix}:tokens`,
    lock: `${prefix}:lock`,
    throttle: `${prefix}:throttle`,
    bal: (token: string) => `${prefix}:bal:${token.toLowerCase()}`,
    rank: (token: string) => `${prefix}:rank:${token.toLowerCase()}`,
    shield: (token: string) => `${prefix}:shield:${token.toLowerCase()}`,
    buyers: (token: string) => `${prefix}:buyers:${token.toLowerCase()}`,
  };
}

/**
 * Balances after applying transfers in log order. Returns null when a sender
 * would go negative, which can only mean part of the history was missed.
 * Mints come from and burns go to the zero address, which is never a holder.
 */
export function applyTransfers(balances: Map<string, bigint>, rows: TransferRow[]): Map<string, bigint> | null {
  const next = new Map(balances);
  for (const row of rows) {
    const from = row.from.toLowerCase();
    const to = row.to.toLowerCase();
    if (from !== ZERO) {
      const balance = (next.get(from) ?? 0n) - row.value;
      if (balance < 0n) return null;
      next.set(from, balance);
    }
    if (to !== ZERO) next.set(to, (next.get(to) ?? 0n) + row.value);
  }
  return next;
}

function errorText(error: unknown) {
  const value = error as { details?: string; shortMessage?: string; message?: string } | null;
  return String(value?.details || value?.shortMessage || value?.message || error).toLowerCase();
}

/** The provider no longer serves this block range's history. */
export function historyPruned(error: unknown) {
  const text = errorText(error);
  return text.includes("pruned") || text.includes("missing trie node") || text.includes("history is not available");
}

/** The provider refused the request for its size; a narrower range will work. */
export function rangeTooLarge(error: unknown) {
  if (historyPruned(error)) return false;
  const text = errorText(error);
  return ["exceed", "block range", "too many", "more than", "limit", "response size", "too large"].some((phrase) => text.includes(phrase));
}

const asString = (value: RedisValue) => (value === null ? null : String(value));

function pairs(value: RedisValue): Array<[string, string]> {
  const flat = Array.isArray(value) ? value.map(String) : [];
  const out: Array<[string, string]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Ranking score: whole tokens as a double. Exact balances live in the hash. */
const score = (balance: bigint) => formatUnits(balance, 18);

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

export type IndexRun = {
  status: "ok" | "busy" | "error";
  from: string | null;
  cursor: string | null;
  target: string | null;
  chunks: number;
  discovered: number;
  transfers: number;
  gap: { from: string; to: string } | null;
  reconciled: number;
  message?: string;
};

type IndexOptions = {
  provider: LedgerProviderConfig;
  store: HolderStore;
  chainId: number;
  factories: Array<{ address: Address; kind: "standard" | "tax" }>;
  startBlock?: bigint;
  budgetMs?: number;
  now?: () => number;
  lockId?: string;
};

class Pruned extends Error {}
class Oversized extends Error {}
class LockLost extends Error {}

/** One retry for a transient failure; pruned and oversized ranges are reported, not retried. */
async function logs<T>(read: () => Promise<T>): Promise<T> {
  const classify = (error: unknown) => (historyPruned(error) ? new Pruned() : rangeTooLarge(error) ? new Oversized() : null);
  try {
    return await read();
  } catch (error) {
    const known = classify(error);
    if (known) throw known;
    try {
      return await read();
    } catch (again) {
      throw classify(again) ?? again;
    }
  }
}

/**
 * The first block in (pruned, head] whose logs the provider still serves.
 * History is pruned oldest first, so a binary search finds the edge.
 */
async function historyEdge(rpc: PublicClient, address: Address, pruned: bigint, head: bigint) {
  let low = pruned;
  let high = head;
  for (let i = 0; i < 48 && high - low > 1n; i++) {
    const mid = low + (high - low) / 2n;
    try {
      await rpc.getLogs({ address, fromBlock: mid, toBlock: mid });
      high = mid;
    } catch (error) {
      if (!historyPruned(error)) throw error;
      low = mid;
    }
  }
  return high;
}

/** Moves the shared cursor toward the confirmed head within the time budget. */
export async function advanceHolderIndex(options: IndexOptions): Promise<IndexRun> {
  const { provider, store, chainId, factories } = options;
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? 25_000;
  const keys = holderKeys(chainId);
  const rpc = provider.client as PublicClient;
  const lockId = options.lockId ?? `${started}-${Math.random().toString(36).slice(2)}`;
  const lockTtl = String(Math.max(budget, 5_000) + 60_000);
  const run: IndexRun = { status: "ok", from: null, cursor: null, target: null, chunks: 0, discovered: 0, transfers: 0, gap: null, reconciled: 0 };

  if (await rpc.getChainId() !== chainId) return { ...run, status: "error", message: "Wrong chain." };
  // Single writer. Every commit first checks the lock is still this run's and
  // extends it, so a run that outlives its lock can never write over another.
  const [locked] = await store.pipeline([["SET", keys.lock, lockId, "NX", "PX", lockTtl]]);
  if (locked !== "OK") return { ...run, status: "busy" };
  const commit = async (commands: RedisCommand[]) => {
    const [holder] = await store.pipeline([["GET", keys.lock]]);
    if (holder !== lockId) throw new LockLost();
    await store.pipeline([["PEXPIRE", keys.lock, lockTtl]]);
    await store.transaction(commands);
  };

  try {
    const head = await rpc.getBlockNumber();
    const target = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;
    run.target = target.toString();

    const [stateRaw, tokensRaw] = await store.pipeline([["HGETALL", keys.state], ["HGETALL", keys.tokens]]);
    const state = new Map(pairs(stateRaw));
    const tokens = new Map<string, TrackedToken>(pairs(tokensRaw).map(([token, json]) => [token, JSON.parse(json) as TrackedToken]));

    let cursor: bigint;
    if (state.has("cursor")) {
      cursor = BigInt(state.get("cursor")!);
    } else {
      const start = options.startBlock ?? (target > DEFAULT_LOOKBACK ? target - DEFAULT_LOOKBACK : 0n);
      cursor = start > 0n ? start - 1n : 0n;
      await commit([["HSET", keys.state, "cursor", cursor.toString(), "start", start.toString(), "updatedAt", String(Math.floor(now() / 1000))]]);
    }
    run.from = (cursor + 1n).toString();

    // A range refused for its size caps the span for the rest of the run.
    let widest = min(provider.chunk, MAX_CHUNK);
    let span = widest;
    while (cursor < target && now() - started < budget) {
      const from = cursor + 1n;
      const to = min(from + span - 1n, target);
      try {
        const result = await indexRange({ rpc, provider, store, keys, factories, tokens, from, to, now, commit });
        run.discovered += result.discovered;
        run.transfers += result.transfers;
      } catch (error) {
        if (error instanceof Oversized && span > MIN_CHUNK) {
          span = max(MIN_CHUNK, span / 2n);
          widest = span;
          continue;
        }
        if (!(error instanceof Pruned)) throw error;
        // The provider no longer serves [from, edge): every launch being tracked
        // may have moved in there, so none of their balances are exact any more.
        const edge = await historyEdge(rpc, factories[0]?.address ?? ZERO, from, target);
        if (edge <= from) throw new Error("The log provider does not serve recent history.");
        const commands: RedisCommand[] = [];
        for (const token of tokens.values()) {
          if (token.status !== "tracked") continue;
          token.status = "gap";
          commands.push(["HSET", keys.tokens, token.token, JSON.stringify(token)]);
        }
        commands.push(["HSET", keys.state, "cursor", (edge - 1n).toString(), "gapFrom", from.toString(), "gapTo", (edge - 1n).toString(), "updatedAt", String(Math.floor(now() / 1000))]);
        await commit(commands);
        run.gap = { from: from.toString(), to: (edge - 1n).toString() };
        cursor = edge - 1n;
        continue;
      }
      cursor = to;
      run.chunks += 1;
      if (span < widest) span = min(widest, span * 2n);
    }
    run.cursor = cursor.toString();
    if (cursor === target && now() - started < budget) {
      run.reconciled = await reconcile({ rpc, store, keys, tokens, block: target, deadline: started + budget, now, commit });
    }
    return run;
  } catch (error) {
    if (error instanceof LockLost) return { ...run, status: "busy", message: "Another run took over." };
    return { ...run, status: "error", message: String((error as Error)?.message || error).slice(0, 200) };
  } finally {
    const [holder] = await store.pipeline([["GET", keys.lock]]).catch(() => [null]);
    if (holder === lockId) await store.pipeline([["DEL", keys.lock]]).catch(() => undefined);
  }
}

type RangeContext = {
  rpc: PublicClient;
  provider: LedgerProviderConfig;
  store: HolderStore;
  keys: ReturnType<typeof holderKeys>;
  factories: IndexOptions["factories"];
  tokens: Map<string, TrackedToken>;
  from: bigint;
  to: bigint;
  now: () => number;
  commit: (commands: RedisCommand[]) => Promise<void>;
};

async function indexRange(context: RangeContext) {
  const { rpc, provider, store, keys, factories, from, to, now, commit } = context;
  // Work on a copy: nothing about this range is kept unless it all commits.
  const tokens = new Map([...context.tokens].map(([token, entry]) => [token, { ...entry }]));
  const commands: RedisCommand[] = [];

  // 1. Launches created in this range start being tracked from their creation block.
  let discovered = 0;
  if (factories.length) {
    const created = await logs(() => rpc.getLogs({ address: factories.map((factory) => factory.address), events: [launchCreated, taxLaunchCreated], fromBlock: from, toBlock: to, strict: true }));
    for (const log of created) {
      if (log.blockNumber === null || log.removed) throw new Error("Incomplete launch log.");
      const args = log.args as { token: Address; curve: Address; creator: Address };
      const token = args.token.toLowerCase();
      if (tokens.has(token)) continue;
      const kind = factories.find((factory) => factory.address.toLowerCase() === log.address.toLowerCase())?.kind ?? "standard";
      const launchTimestamp = Number(await rpc.readContract({ address: args.curve, abi: launchTimestampAbi, functionName: "launchTimestamp", blockNumber: to }));
      const entry: TrackedToken = { token, curve: args.curve.toLowerCase(), creator: args.creator.toLowerCase(), kind, block: log.blockNumber.toString(), launchTimestamp, status: "tracked" };
      tokens.set(token, entry);
      commands.push(["HSET", keys.tokens, token, JSON.stringify(entry)]);
      discovered += 1;
    }
  }

  const tracked = [...tokens.values()].filter((token) => token.status === "tracked");

  // 2. Every transfer of every tracked launch in this range, in log order.
  const rows: TransferRow[] = [];
  for (let i = 0; i < tracked.length; i += provider.addressBatch) {
    const batch = tracked.slice(i, i + provider.addressBatch).map((token) => token.token as Address);
    const found = await logs(() => rpc.getLogs({ address: batch, event: transferEvent, fromBlock: from, toBlock: to, strict: true }));
    for (const log of found) {
      if (log.blockNumber === null || log.logIndex === null || log.removed) throw new Error("Incomplete transfer log.");
      if (log.blockNumber < from || log.blockNumber > to) throw new Error("Transfer log outside the requested range.");
      if (!batch.includes(log.address.toLowerCase() as Address)) throw new Error("Transfer log from an unrequested contract.");
      rows.push({ token: log.address.toLowerCase(), from: log.args.from as string, to: log.args.to as string, value: log.args.value as bigint, block: log.blockNumber, logIndex: log.logIndex });
    }
    if (rows.length > MAX_ROWS) throw new Oversized();
  }
  rows.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));

  // 3. Fold them into exact balances, one launch at a time.
  const byToken = new Map<string, TransferRow[]>();
  for (const row of rows) {
    const list = byToken.get(row.token);
    if (list) list.push(row);
    else byToken.set(row.token, [row]);
  }
  const touched = [...byToken.entries()].map(([token, tokenRows]) => ({
    token,
    rows: tokenRows,
    addresses: [...new Set(tokenRows.flatMap((row) => [row.from.toLowerCase(), row.to.toLowerCase()]).filter((address) => address !== ZERO))],
  }));
  const current = touched.length ? await store.pipeline(touched.map(({ token, addresses }) => ["HMGET", keys.bal(token), ...addresses])) : [];
  touched.forEach(({ token, rows: tokenRows, addresses }, index) => {
    const values = (current[index] as RedisValue[]) ?? [];
    const before = new Map(addresses.map((address, i) => [address, BigInt(asString(values[i]) ?? "0")]));
    const after = applyTransfers(before, tokenRows);
    const entry = tokens.get(token)!;
    if (!after) {
      entry.status = "inconsistent";
      commands.push(["HSET", keys.tokens, token, JSON.stringify(entry)]);
      return;
    }
    const set: string[] = [];
    const remove: string[] = [];
    const ranks: string[] = [];
    for (const address of addresses) {
      const balance = after.get(address) ?? 0n;
      if (balance === before.get(address)) continue;
      if (balance === 0n) remove.push(address);
      else {
        set.push(address, balance.toString());
        ranks.push(score(balance), address);
      }
    }
    if (set.length) commands.push(["HSET", keys.bal(token), ...set], ["ZADD", keys.rank(token), ...ranks]);
    if (remove.length) commands.push(["HDEL", keys.bal(token), ...remove], ["ZREM", keys.rank(token), ...remove]);
  });

  // 4. Launch Shield window: buys in the first 15 s, and the tax charged in the first 5 s.
  const opening = tracked.filter((token) => token.status === "tracked" && BigInt(token.block) + SHIELD_BLOCKS >= from && BigInt(token.block) <= to);
  if (opening.length) {
    const stats = await store.pipeline(opening.map((token) => ["HGETALL", keys.shield(token.token)]));
    for (const [index, token] of opening.entries()) {
      const fromBlock = max(BigInt(token.block), from);
      const toBlock = min(BigInt(token.block) + SHIELD_BLOCKS, to);
      const found = await logs(() => rpc.getLogs({ address: token.curve as Address, events: [bought, snipeTaxCharged], fromBlock, toBlock, strict: true }));
      if (!found.length) continue;
      const times = new Map<bigint, number>();
      for (const log of found) {
        if (log.blockNumber === null || log.removed) throw new Error("Incomplete Launch Shield log.");
        if (times.has(log.blockNumber)) continue;
        times.set(log.blockNumber, Number((await rpc.getBlock({ blockNumber: log.blockNumber })).timestamp));
      }
      const early = found.filter((log) => (times.get(log.blockNumber!) ?? Infinity) < token.launchTimestamp + SHIELD_WINDOW_SECONDS);
      if (!early.length) continue;
      const stat = new Map(pairs(stats[index]));
      let buys = Number(stat.get("buys") ?? 0);
      let taxedBuys = Number(stat.get("taxedBuys") ?? 0);
      let tokensBought = BigInt(stat.get("tokens") ?? "0");
      const tax = new Map([...stat.entries()].filter(([field]) => field.startsWith("tax:")).map(([field, value]) => [field, BigInt(value)]));
      const buyers = new Set<string>();
      for (const log of early) {
        const args = log.args as Record<string, unknown>;
        if (log.eventName === "Bought") {
          buys += 1;
          tokensBought += args.tokensOut as bigint;
          buyers.add(String(args.buyer).toLowerCase());
        } else {
          taxedBuys += 1;
          const field = "tax:" + String(args.quoteAsset).toLowerCase();
          tax.set(field, (tax.get(field) ?? 0n) + (args.taxAmount as bigint));
        }
      }
      commands.push(["HSET", keys.shield(token.token), "buys", String(buys), "taxedBuys", String(taxedBuys), "tokens", tokensBought.toString(), ...[...tax.entries()].flatMap(([field, value]) => [field, value.toString()])]);
      if (buyers.size) commands.push(["SADD", keys.buyers(token.token), ...buyers]);
    }
  }

  // 5. Everything above and the cursor move together.
  commands.push(["HSET", keys.state, "cursor", to.toString(), "updatedAt", String(Math.floor(now() / 1000))]);
  await commit(commands);
  for (const [token, entry] of tokens) context.tokens.set(token, entry);
  return { discovered, transfers: rows.length };
}

type ReconcileContext = {
  rpc: PublicClient;
  store: HolderStore;
  keys: ReturnType<typeof holderKeys>;
  tokens: Map<string, TrackedToken>;
  block: bigint;
  deadline: number;
  now: () => number;
  commit: (commands: RedisCommand[]) => Promise<void>;
};

/**
 * Makes launches with a hole in their history exact again when that is
 * provable: at `block` (the cursor), the addresses the index knows must hold
 * the whole supply between them. Balances are then taken from the chain.
 */
async function reconcile(context: ReconcileContext) {
  const { rpc, store, keys, tokens, block, deadline, now, commit } = context;
  const due = [...tokens.values()]
    .filter((entry) => entry.status !== "tracked" && (!entry.checkedAt || block - BigInt(entry.checkedAt) >= RECONCILE_RETRY_BLOCKS))
    .slice(0, RECONCILE_PER_RUN);
  let fixed = 0;
  for (const original of due) {
    if (now() >= deadline) break;
    const entry = { ...original, checkedAt: block.toString() };
    const [raw] = await store.pipeline([["HGETALL", keys.bal(entry.token)]]);
    const known = pairs(raw).map(([address]) => address);
    const commands: RedisCommand[] = [];
    if (known.length && known.length <= RECONCILE_LIMIT) {
      try {
        const supply = await rpc.readContract({ address: entry.token as Address, abi: erc20Abi, functionName: "totalSupply", blockNumber: block });
        const balances: bigint[] = [];
        for (let i = 0; i < known.length; i += 500) {
          const rows = await rpc.multicall({
            blockNumber: block,
            allowFailure: false,
            contracts: known.slice(i, i + 500).map((address) => ({ address: entry.token as Address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address as Address] as const })),
          });
          balances.push(...(rows as bigint[]));
        }
        if (balances.length === known.length && balances.reduce((sum, balance) => sum + balance, 0n) === supply) {
          const set: string[] = [];
          const ranks: string[] = [];
          known.forEach((address, i) => {
            if (balances[i] > 0n) {
              set.push(address, balances[i].toString());
              ranks.push(score(balances[i]), address);
            }
          });
          commands.push(["DEL", keys.bal(entry.token), keys.rank(entry.token)]);
          if (set.length) commands.push(["HSET", keys.bal(entry.token), ...set], ["ZADD", keys.rank(entry.token), ...ranks]);
          entry.status = "tracked";
          entry.reconciledAt = block.toString();
        }
      } catch {
        // Unreadable right now: counts as a failed check, tried again later.
      }
    }
    commands.push(["HSET", keys.tokens, entry.token, JSON.stringify(entry)]);
    await commit(commands);
    tokens.set(entry.token, entry);
    if (entry.status === "tracked") fixed += 1;
  }
  return fixed;
}

export type HolderView =
  | { status: "untracked"; indexedFrom: string | null }
  | { status: "gap" | "inconsistent" | "pending"; indexedTo: string | null; updatedAt: number | null }
  | {
    status: "tracked";
    holders: number;
    top: Array<{ address: string; balance: string; share: number | null; early: boolean }>;
    topShare: number | null;
    shield: {
      windowSeconds: number;
      buys: number;
      wallets: number;
      tokens: string;
      share: number | null;
      taxedBuys: number;
      tax: Array<{ asset: string; amount: string }>;
      /** Early wallets whose balance was checked (at most 500). */
      checked: number;
      stillHolding: number;
      holdingNow: string;
      holdingShare: number | null;
    } | null;
    indexedTo: string;
    updatedAt: number | null;
    reconciledAt: string | null;
  };

const MAX_BUYERS = 500;

/**
 * What the index knows about one launch. `exclude` lists protocol addresses
 * (curve, official pools, vaults, burn addresses) that hold tokens without
 * being holders; they are left out of the count and the top list.
 */
export async function readHolderView(store: HolderStore, chainId: number, token: string, options: { exclude: string[]; totalSupply: bigint }): Promise<HolderView> {
  const keys = holderKeys(chainId);
  const id = token.toLowerCase();
  const exclude = [...new Set(options.exclude.map((address) => address.toLowerCase()))];
  const share = (amount: bigint) => (options.totalSupply > 0n ? Number((amount * 1_000_000n) / options.totalSupply) / 1_000_000 : null);

  const [meta, cursor, updatedAt, start] = await store.pipeline([
    ["HGET", keys.tokens, id],
    ["HGET", keys.state, "cursor"],
    ["HGET", keys.state, "updatedAt"],
    ["HGET", keys.state, "start"],
  ]);
  if (meta === null) return { status: "untracked", indexedFrom: asString(start) };
  const entry = JSON.parse(String(meta)) as TrackedToken;
  const indexedTo = asString(cursor);
  const updated = updatedAt === null ? null : Number(updatedAt);
  if (entry.status !== "tracked") return { status: entry.status, indexedTo, updatedAt: updated };
  if (indexedTo === null || BigInt(indexedTo) < BigInt(entry.block)) return { status: "pending", indexedTo, updatedAt: updated };

  const [count, ranked, shieldRaw, buyersRaw, ...scores] = await store.pipeline([
    ["ZCARD", keys.rank(id)],
    ["ZREVRANGE", keys.rank(id), "0", String(TOP + exclude.length - 1), "WITHSCORES"],
    ["HGETALL", keys.shield(id)],
    ["SMEMBERS", keys.buyers(id)],
    ...exclude.map((address) => ["ZSCORE", keys.rank(id), address]),
  ]);
  const holders = Number(count) - scores.filter((value) => value !== null).length;
  const leaders = pairs(ranked).map(([address]) => address).filter((address) => !exclude.includes(address)).slice(0, TOP);
  const allBuyers = Array.isArray(buyersRaw) ? buyersRaw.map(String) : [];
  const buyers = allBuyers.slice(0, MAX_BUYERS);
  const [leaderBalances, buyerBalances] = await store.pipeline([
    leaders.length ? ["HMGET", keys.bal(id), ...leaders] : ["HMGET", keys.bal(id), ZERO],
    buyers.length ? ["HMGET", keys.bal(id), ...buyers] : ["HMGET", keys.bal(id), ZERO],
  ]);
  const exact = (values: RedisValue, index: number) => BigInt(asString((values as RedisValue[])[index]) ?? "0");
  const early = new Set(allBuyers);
  const top = leaders.map((address, index) => {
    const balance = exact(leaderBalances, index);
    return { address, balance: balance.toString(), share: share(balance), early: early.has(address) };
  });
  const topTotal = top.reduce((sum, row) => sum + BigInt(row.balance), 0n);

  const stat = new Map(pairs(shieldRaw));
  let shield: Extract<HolderView, { status: "tracked" }>["shield"] = null;
  if (stat.size) {
    const tokensBought = BigInt(stat.get("tokens") ?? "0");
    let holdingNow = 0n;
    let stillHolding = 0;
    buyers.forEach((_, index) => {
      const balance = exact(buyerBalances, index);
      if (balance > 0n) stillHolding += 1;
      holdingNow += balance;
    });
    shield = {
      windowSeconds: SHIELD_WINDOW_SECONDS,
      buys: Number(stat.get("buys") ?? 0),
      wallets: allBuyers.length,
      tokens: tokensBought.toString(),
      share: share(tokensBought),
      taxedBuys: Number(stat.get("taxedBuys") ?? 0),
      tax: [...stat.entries()].filter(([field]) => field.startsWith("tax:")).map(([field, value]) => ({ asset: field.slice(4), amount: value })),
      checked: buyers.length,
      stillHolding,
      holdingNow: holdingNow.toString(),
      holdingShare: share(holdingNow),
    };
  }
  return {
    status: "tracked",
    holders: Math.max(0, holders),
    top,
    topShare: share(topTotal),
    shield,
    indexedTo,
    updatedAt: updated,
    reconciledAt: entry.reconciledAt ?? null,
  };
}
