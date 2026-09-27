import { apiError, apiOk } from "@/lib/public-api";
import { canonicalAccount, socialPlatform } from "@/lib/social-fees";
import { resolveSocialAccount } from "@/lib/social-verify";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 60;
const attempts = new Map<string, { count: number; resetAt: number }>();
const cache = new Map<string, { value: { account: string; name: string | null }; expires: number }>();

function rateLimited(client: string) {
  const now = Date.now();
  if (attempts.size > 5_000) for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  const entry = attempts.get(client);
  if (!entry || entry.resetAt <= now) {
    attempts.set(client, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > PER_CLIENT;
}

/**
 * Turns what people paste for a platform whose accounts are ids (a Weibo or
 * Bilibili profile link or UID, a WeChat Official Account article link) into
 * the account the vault stores, plus the display name when the platform shares it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = socialPlatform(url.searchParams.get("platform"));
  const input = (url.searchParams.get("input") || "").trim().slice(0, 500);
  if (!platform) return apiError("invalid_request", "Choose a supported platform.", 400);
  if (!input) return apiError("invalid_request", "Enter an account or a link.", 400);

  if (!platform.resolvable) {
    const parsed = canonicalAccount(platform.key, input);
    if (!parsed.ok) return apiError("invalid_request", parsed.reason, 400);
    return apiOk({ platform: platform.key, account: parsed.account, name: null }, { cacheSeconds: 3_600 });
  }

  const key = `${platform.key}:${input.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return apiOk({ platform: platform.key, ...hit.value }, { cacheSeconds: 600 });

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(client)) return apiError("rate_limited", "Too many lookups. Try again in a few minutes.", 429);

  const resolved = await resolveSocialAccount(platform, input);
  if (!resolved.ok) {
    const unavailable = resolved.code === "SOURCE_UNAVAILABLE";
    return apiError(unavailable ? "dependency_unavailable" : "invalid_request", resolved.message, unavailable ? 503 : 400, { reason: resolved.code });
  }
  const value = { account: resolved.account, name: resolved.name };
  if (cache.size > 2_000) cache.clear();
  cache.set(key, { value, expires: Date.now() + 10 * 60_000 });
  return apiOk({ platform: platform.key, ...value }, { cacheSeconds: 600 });
}
