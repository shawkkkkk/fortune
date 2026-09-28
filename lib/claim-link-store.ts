// Private claim links this browser made, one list per chain, so a launcher who
// closes the tab can still send them. The secrets stay in this browser's
// storage: nothing is uploaded, and clearing site data loses them.

import { claimAccountOf } from "@/lib/social-fees";

export type SavedClaimLink = {
  secret: string;
  /** keccak256 of the secret: the account the launch names. */
  account: string;
  /** The launcher's own note on who the link is for. */
  note: string;
  createdAt: number;
  /** The launch that names it, once known. */
  curve: string | null;
  symbol: string | null;
};

export const CLAIM_LINK_LIMIT = 100;

export function claimLinksKey(chainId: number) {
  return `fortune:claim-links:${chainId}`;
}

/** Parses stored JSON into valid, distinct links, newest first, capped. */
export function parseClaimLinks(raw: string | null): SavedClaimLink[] {
  try {
    const value = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const links: SavedClaimLink[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.secret !== "string") continue;
      const account = claimAccountOf(item.secret);
      if (!account || seen.has(account)) continue;
      seen.add(account);
      links.push({
        secret: item.secret,
        account,
        note: typeof item.note === "string" ? item.note.slice(0, 80) : "",
        createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : 0,
        curve: typeof item.curve === "string" && /^0x[0-9a-fA-F]{40}$/.test(item.curve) ? item.curve : null,
        symbol: typeof item.symbol === "string" && item.symbol ? item.symbol.slice(0, 24) : null,
      });
    }
    return links.slice(0, CLAIM_LINK_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Adds links or updates them by account, keeping what a later call leaves out.
 * Updated and new links move to the front.
 */
export function mergeClaimLinks(
  list: SavedClaimLink[],
  updates: Array<{ secret: string; note?: string; curve?: string | null; symbol?: string | null }>,
  now = Date.now()
): SavedClaimLink[] {
  const byAccount = new Map(list.map((link) => [link.account, link]));
  const touched: SavedClaimLink[] = [];
  for (const update of updates) {
    const account = claimAccountOf(update.secret);
    if (!account) continue;
    const previous = byAccount.get(account);
    byAccount.delete(account);
    touched.push({
      secret: update.secret,
      account,
      note: (update.note ?? previous?.note ?? "").slice(0, 80),
      createdAt: previous?.createdAt || now,
      curve: update.curve ?? previous?.curve ?? null,
      symbol: update.symbol ?? previous?.symbol ?? null,
    });
  }
  return [...touched, ...byAccount.values()].slice(0, CLAIM_LINK_LIMIT);
}

export function loadClaimLinks(chainId: number): SavedClaimLink[] {
  try {
    return parseClaimLinks(window.localStorage.getItem(claimLinksKey(chainId)));
  } catch {
    return [];
  }
}

/** Returns false when this browser would not store them (private mode, blocked storage). */
export function rememberClaimLinks(chainId: number, updates: Parameters<typeof mergeClaimLinks>[1]) {
  try {
    const next = mergeClaimLinks(loadClaimLinks(chainId), updates);
    window.localStorage.setItem(claimLinksKey(chainId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
