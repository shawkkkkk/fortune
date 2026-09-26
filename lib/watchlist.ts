// Browser-local watchlist of Fortune launches, one list per chain. Nothing is
// sent anywhere: starring a token only writes this browser's storage.

import { useCallback, useEffect, useState } from "react";

const EVENT = "fortune-watchlist";
export const WATCHLIST_LIMIT = 50;

export function watchlistKey(chainId: number) {
  return `fortune:watchlist:${chainId}`;
}

/** Parses stored JSON into distinct lowercase addresses, newest first, capped. */
export function parseWatchlist(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .filter((item): item is string => typeof item === "string" && /^0x[0-9a-fA-F]{40}$/.test(item))
      .map((item) => item.toLowerCase())
      .filter((item) => !seen.has(item) && seen.add(item))
      .slice(0, WATCHLIST_LIMIT);
  } catch {
    return [];
  }
}

/** Adds (to the front) or removes a token. A full list drops its oldest entry. */
export function toggleInList(list: string[], token: string) {
  const key = token.toLowerCase();
  return list.includes(key) ? list.filter((item) => item !== key) : [key, ...list].slice(0, WATCHLIST_LIMIT);
}

export function useWatchlist(chainId: number) {
  const [list, setList] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const read = () => {
      try {
        setList(parseWatchlist(localStorage.getItem(watchlistKey(chainId))));
      } catch {
        setAvailable(false);
      }
    };
    read();
    const onStorage = (event: StorageEvent) => { if (event.key === watchlistKey(chainId)) read(); };
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, [chainId]);

  const toggle = useCallback((token: string) => {
    try {
      const next = toggleInList(parseWatchlist(localStorage.getItem(watchlistKey(chainId))), token);
      localStorage.setItem(watchlistKey(chainId), JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
      return true;
    } catch {
      setAvailable(false);
      return false;
    }
  }, [chainId]);

  return { list, available, toggle, has: (token: string) => list.includes(token.toLowerCase()) };
}
