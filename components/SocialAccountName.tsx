"use client";

import { useEffect, useState } from "react";
import type { SocialPlatform } from "@/lib/social-fees";

// Display names for platforms whose accounts are ids (Weibo and Bilibili UIDs,
// WeChat gh_ ids, Xiaohongshu user ids), looked up once per page through
// Fortune's resolver.

const names = new Map<string, Promise<string | null>>();

export async function resolveAccount(platformKey: string, input: string): Promise<{ account: string; name: string | null }> {
  const response = await fetch(`/api/public/v1/social/resolve?platform=${encodeURIComponent(platformKey)}&input=${encodeURIComponent(input)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || "That account could not be looked up.");
  const data = body.data as { account: string; name: string | null };
  // A note or article link can name an account its bare id cannot (Xiaohongshu profiles need a login).
  if (data.name) names.set(`${platformKey}:${data.account}`, Promise.resolve(data.name));
  return data;
}

export function useResolvedName(platform: SocialPlatform | null, account: string) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!platform?.resolvable || !account || !platform.pattern.test(account)) {
      setName(null);
      return undefined;
    }
    const key = `${platform.key}:${account}`;
    let pending = names.get(key);
    if (!pending) {
      pending = resolveAccount(platform.key, account).then((result) => result.name).catch(() => null);
      names.set(key, pending);
    }
    let live = true;
    pending.then((value) => {
      if (live) setName(value);
    });
    return () => {
      live = false;
    };
  }, [platform, account]);
  return name;
}
