import type { Address } from "viem";
import { FORTUNE_NETWORK, FORTUNE_TAX_NETWORK_CONFIGURED } from "@/lib/fortune-network";
import { advanceHolderIndex, holderKeys, type IndexRun } from "@/lib/holder-index";
import type { HolderStore } from "@/lib/holder-store";
import { FORTUNE_READ_NETWORK_CONFIGURED } from "@/lib/read-network";
import { ledgerProvider } from "@/lib/trade-ledger";

// Server wiring for the holder index: which factories it follows, where a fresh
// index starts, and how often page views may move it forward.

export function holderFactories(): Array<{ address: Address; kind: "standard" | "tax" }> {
  if (!FORTUNE_READ_NETWORK_CONFIGURED || !FORTUNE_NETWORK.contracts.factory) return [];
  const list: Array<{ address: Address; kind: "standard" | "tax" }> = [{ address: FORTUNE_NETWORK.contracts.factory as Address, kind: "standard" }];
  if (FORTUNE_TAX_NETWORK_CONFIGURED && FORTUNE_NETWORK.contracts.taxFactory) list.push({ address: FORTUNE_NETWORK.contracts.taxFactory as Address, kind: "tax" });
  return list;
}

/** Where a fresh index starts; without it, about 80,000 blocks back (what public log providers keep). */
export function holderStartBlock(env: Record<string, string | undefined> = process.env) {
  const raw = env.FORTUNE_HOLDER_INDEX_START_BLOCK?.trim();
  return raw && /^\d{1,12}$/.test(raw) ? BigInt(raw) : undefined;
}

/** How often page views may move the index forward: 60 s by default, 15 s to 1 h. */
export function holderIntervalMs(env: Record<string, string | undefined> = process.env) {
  const seconds = Number(env.FORTUNE_HOLDER_INDEX_INTERVAL_SECONDS || 60);
  return Math.round(Math.min(3_600, Math.max(15, Number.isFinite(seconds) ? seconds : 60)) * 1_000);
}

/** One index run, unless one already started within the interval (`force` skips that check). */
export async function advanceIfDue(store: HolderStore, budgetMs: number, force = false): Promise<IndexRun | null> {
  const provider = ledgerProvider();
  const factories = holderFactories();
  if (!provider || !factories.length) return null;
  const keys = holderKeys(FORTUNE_NETWORK.chainId);
  if (!force) {
    const [claimed] = await store.pipeline([["SET", keys.throttle, String(Date.now()), "NX", "PX", String(holderIntervalMs())]]);
    if (claimed !== "OK") return null;
  }
  return advanceHolderIndex({ provider, store, chainId: FORTUNE_NETWORK.chainId, factories, startBlock: holderStartBlock(), budgetMs });
}
