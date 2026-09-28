import type { Address } from "viem";
import { claimAccountOf, claimSecretFromText, type SocialPlatform, type SocialPlatformKey } from "@/lib/social-fees";

// Server-side ownership checks for social fee recipients. Every request goes to
// a fixed public endpoint of the platform itself; the proof link a person pastes
// only supplies an id, never a host, so this cannot be pointed anywhere else.
// No platform credentials are needed. FORTUNE_GITHUB_TOKEN (read-only, no
// scopes) is optional and only raises GitHub's rate limit.

export type ProofFailure =
  | "PROOF_URL"
  | "PROOF_NOT_FOUND"
  | "WRONG_ACCOUNT"
  | "CODE_MISSING"
  | "WALLET_NOT_VERIFIED"
  | "SOURCE_UNAVAILABLE";

export type ProofOutcome =
  | { ok: true; stableRawId: string | null; evidence: { url: string | null; author: string; excerpt: string } }
  | { ok: false; code: ProofFailure; message: string };

export type ProofRequest = {
  platform: SocialPlatform;
  account: string;
  code: string;
  wallet: Address;
  proofUrl: string | null;
  /** Private claim links only: the secret from the link. Never logged or echoed. */
  secret?: string | null;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const ORIGINS = {
  xSyndication: "https://cdn.syndication.twimg.com",
  xOembed: "https://publish.twitter.com",
  github: "https://api.github.com",
  tiktok: "https://www.tiktok.com",
  telegram: "https://t.me",
  youtube: "https://www.youtube.com",
  bluesky: "https://public.api.bsky.app",
  farcaster: "https://hub.pinata.cloud",
  weiboPassport: "https://passport.weibo.com",
  weibo: "https://weibo.com",
  bilibili: "https://api.bilibili.com",
  wechat: "https://mp.weixin.qq.com",
  xiaohongshu: "https://www.xiaohongshu.com",
  xhslink: "https://xhslink.com",
} as const;

type OriginKey = keyof typeof ORIGINS;

/**
 * Local end-to-end tests point every source at one loopback server. Anything
 * that is not http://127.0.0.1:<port> or http://localhost:<port> is ignored, so
 * a production deployment can never be redirected to a remote host this way.
 */
export function proofOrigins(env: Record<string, string | undefined> = process.env): Record<OriginKey, string> {
  const mock = env.FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN?.trim();
  if (mock && /^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(mock)) {
    return Object.fromEntries((Object.keys(ORIGINS) as OriginKey[]).map((key) => [key, `${mock}/${key}`])) as Record<OriginKey, string>;
  }
  const hub = env.FORTUNE_FARCASTER_HUB_URL?.trim();
  return { ...ORIGINS, farcaster: hub && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(hub) ? hub : ORIGINS.farcaster };
}

const MAX_BODY_BYTES = 1_000_000;
// WeChat article pages run to several megabytes and name the account near the end.
const WECHAT_BODY_BYTES = 6_000_000;

/**
 * One retry for a network error or a 5xx: platform edges drop the odd request.
 * Redirects are errors unless `manualRedirect` is set; then a 3xx comes back
 * with its Location and no body, and is never followed.
 */
async function fetchText(fetcher: FetchLike, url: string, init?: RequestInit, maxBytes = MAX_BODY_BYTES, manualRedirect = false) {
  try {
    const first = await fetchOnce(fetcher, url, init, maxBytes, manualRedirect);
    if (first.status < 500) return first;
  } catch {
    // retried below
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return fetchOnce(fetcher, url, init, maxBytes, manualRedirect);
}

async function fetchOnce(fetcher: FetchLike, url: string, init?: RequestInit, maxBytes = MAX_BODY_BYTES, manualRedirect = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url, {
      ...init,
      redirect: manualRedirect ? "manual" : "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "fortunepad-social-verifier/1.0 (+https://fortunepad.fun)", ...(init?.headers || {}) },
    });
    // Error/redirect bodies are never ownership evidence, even if they happen
    // to contain fields resembling a successful platform response.
    if (!response.ok) {
      await response.body?.cancel();
      const location = manualRedirect && response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      return { status: response.status, body: "", location };
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: response.status, body: "", location: null };
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          controller.abort();
          await reader.cancel();
          throw new Error("Social proof response exceeded its byte limit");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return { status: response.status, body, location: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(fetcher: FetchLike, url: string, init?: RequestInit): Promise<{ status: number; json: T | null }> {
  const { status, body } = await fetchText(fetcher, url, init);
  try {
    return { status, json: JSON.parse(body) as T };
  } catch {
    return { status, json: null };
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–" };

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] === "#") {
        const point = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : "";
      }
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    });
}

function containsCode(text: string, code: string) {
  return text.toLowerCase().includes(code.toLowerCase());
}

function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

function parseProofUrl(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

const fail = (code: ProofFailure, message: string): ProofOutcome => ({ ok: false, code, message });
const unavailable = (source: string) => fail("SOURCE_UNAVAILABLE", `${source} did not answer. Try again in a minute.`);

// ------------------------------------------------------------------------ X

/** Token cdn.syndication.twimg.com expects for a post id (same derivation as react-tweet). */
export function xSyndicationToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, "");
}

export function xPostId(url: URL) {
  if (!/^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,25})(?:\/.*)?$/);
  return match ? match[1] : null;
}

type XSyndication = {
  __typename?: string;
  text?: string;
  user?: { screen_name?: string; id_str?: string };
  note_tweet?: { note_tweet_results?: { result?: { text?: string } } };
};

async function verifyX(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const id = url ? xPostId(url) : null;
  if (!id) return fail("PROOF_URL", "Paste the link to the post, like https://x.com/handle/status/1234567890.");
  const link = `https://x.com/i/status/${id}`;

  let syndication: { status: number; json: XSyndication | null } | null = null;
  try {
    syndication = await fetchJson<XSyndication>(fetcher, `${origins.xSyndication}/tweet-result?id=${id}&token=${xSyndicationToken(id)}&lang=en`);
  } catch {
    syndication = null;
  }
  const post = syndication?.json;
  if (post?.user?.screen_name && post.__typename !== "TweetTombstone") {
    const author = post.user.screen_name.toLowerCase();
    if (author !== request.account) return fail("WRONG_ACCOUNT", `That post is by @${author}, not @${request.account}.`);
    const text = [post.text || "", post.note_tweet?.note_tweet_results?.result?.text || ""].join("\n");
    if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The post does not contain your code.");
    return { ok: true, stableRawId: post.user.id_str || null, evidence: { url: link, author: `@${author}`, excerpt: excerpt(text) } };
  }

  // Fallback: the public oEmbed endpoint names the real author whatever handle the link uses.
  let oembed: { status: number; json: { author_url?: string; html?: string } | null };
  try {
    oembed = await fetchJson(fetcher, `${origins.xOembed}/oembed?url=${encodeURIComponent(`https://twitter.com/i/status/${id}`)}&omit_script=1&dnt=true`);
  } catch {
    return unavailable("X");
  }
  if (oembed.status === 404 || oembed.status === 403) return fail("PROOF_NOT_FOUND", "That post was not found or is not public.");
  const authorUrl = oembed.json?.author_url;
  if (!authorUrl || !oembed.json?.html) return syndication ? fail("PROOF_NOT_FOUND", "That post was not found or is not public.") : unavailable("X");
  const author = authorUrl.replace(/\/+$/, "").split("/").pop()?.toLowerCase() || "";
  if (author !== request.account) return fail("WRONG_ACCOUNT", `That post is by @${author}, not @${request.account}.`);
  // Only the post's own paragraph counts, not the byline or links around it.
  const paragraph = oembed.json.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const text = htmlToText(paragraph);
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The post does not contain your code.");
  return { ok: true, stableRawId: null, evidence: { url: link, author: `@${author}`, excerpt: excerpt(text) } };
}

// ------------------------------------------------------------------- GitHub

export function gistId(url: URL) {
  if (url.hostname.toLowerCase() !== "gist.github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts.length === 1 ? parts[0] : parts.length >= 2 ? parts[1] : "";
  return /^(?:[0-9a-f]{20,40}|\d{1,12})$/i.test(id) ? id.toLowerCase() : null;
}

type Gist = {
  description?: string | null;
  owner?: { login?: string; id?: number };
  files?: Record<string, { content?: string }>;
};

async function verifyGitHub(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const id = url ? gistId(url) : null;
  if (!id) return fail("PROOF_URL", "Paste the gist link, like https://gist.github.com/username/0123456789abcdef.");
  const token = process.env.FORTUNE_GITHUB_TOKEN?.trim();
  let gist: { status: number; json: Gist | null };
  try {
    gist = await fetchJson<Gist>(fetcher, `${origins.github}/gists/${id}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    return unavailable("GitHub");
  }
  if (gist.status === 404) return fail("PROOF_NOT_FOUND", "That gist was not found.");
  if (gist.status === 403 || gist.status === 429) return unavailable("GitHub (rate limited)");
  const login = gist.json?.owner?.login?.toLowerCase();
  if (!login || !gist.json?.owner?.id) return unavailable("GitHub");
  if (login !== request.account) return fail("WRONG_ACCOUNT", `That gist belongs to ${login}, not ${request.account}.`);
  const text = [gist.json.description || "", ...Object.values(gist.json.files || {}).map((file) => file.content || "")].join("\n");
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The gist does not contain your code.");
  return {
    ok: true,
    stableRawId: String(gist.json.owner.id),
    evidence: { url: `https://gist.github.com/${login}/${id}`, author: login, excerpt: excerpt(text) },
  };
}

// ------------------------------------------------------------------- TikTok

export function tiktokVideo(url: URL) {
  if (!/^(?:www\.|m\.)?tiktok\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/@([A-Za-z0-9_.]{2,24})\/(video|photo)\/(\d{5,25})\/?$/);
  return match ? { handle: match[1], kind: match[2], id: match[3] } : null;
}

async function verifyTikTok(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const video = url ? tiktokVideo(url) : null;
  if (!video) return fail("PROOF_URL", "Paste the full video link, like https://www.tiktok.com/@handle/video/1234567890.");
  const canonical = `https://www.tiktok.com/@${video.handle}/${video.kind}/${video.id}`;
  let oembed: { status: number; json: { author_unique_id?: string; title?: string } | null };
  try {
    oembed = await fetchJson(fetcher, `${origins.tiktok}/oembed?url=${encodeURIComponent(canonical)}`);
  } catch {
    return unavailable("TikTok");
  }
  const author = oembed.json?.author_unique_id?.toLowerCase();
  if (!author) return oembed.status >= 500 ? unavailable("TikTok") : fail("PROOF_NOT_FOUND", "That video was not found or is not public.");
  if (author !== request.account) return fail("WRONG_ACCOUNT", `That video is by @${author}, not @${request.account}.`);
  const text = oembed.json?.title || "";
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The video caption does not contain your code.");
  return { ok: true, stableRawId: null, evidence: { url: canonical, author: `@${author}`, excerpt: excerpt(text) } };
}

// ----------------------------------------------------------------- Telegram

export function telegramPost(url: URL) {
  if (!/^(?:www\.)?(?:t\.me|telegram\.me)$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})\/(\d{1,12})\/?$/);
  return match ? { channel: match[1], id: match[2] } : null;
}

async function verifyTelegram(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const post = url ? telegramPost(url) : null;
  if (!post) return fail("PROOF_URL", "Paste the post link, like https://t.me/channel/123.");
  let page: { status: number; body: string };
  try {
    page = await fetchText(fetcher, `${origins.telegram}/${post.channel}/${post.id}?embed=1&mode=tme`);
  } catch {
    return unavailable("Telegram");
  }
  if (page.status >= 500) return unavailable("Telegram");
  const html = page.body;
  const dataPost = html.match(/data-post="([^"]+)"/)?.[1]?.toLowerCase();
  if (!dataPost || /tgme_widget_message_error/.test(html)) return fail("PROOF_NOT_FOUND", "That post was not found or is not public.");
  if (dataPost !== `${post.channel.toLowerCase()}/${post.id}`) return fail("PROOF_NOT_FOUND", "That post was not found or is not public.");
  // The post must be published by the channel itself, not a member of a group.
  const owner = html.match(/class="tgme_widget_message_owner_name"[^>]*href="https:\/\/t\.me\/([A-Za-z0-9_]+)"/)?.[1]?.toLowerCase();
  if (owner !== request.account) {
    return fail("WRONG_ACCOUNT", owner ? `That post is by @${owner}, not @${request.account}.` : `That post was not published by @${request.account}.`);
  }
  const body = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  const text = htmlToText(body);
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The post does not contain your code.");
  return { ok: true, stableRawId: null, evidence: { url: `https://t.me/${owner}/${post.id}`, author: `@${owner}`, excerpt: excerpt(text) } };
}

// ------------------------------------------------------------------ YouTube

export function youtubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  else if (/^(?:www\.|m\.)?youtube\.com$/.test(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

async function verifyYouTube(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const id = url ? youtubeVideoId(url) : null;
  if (!id) return fail("PROOF_URL", "Paste the video link, like https://www.youtube.com/watch?v=abcdefghijk.");
  let oembed: { status: number; json: { author_url?: string; title?: string } | null };
  try {
    oembed = await fetchJson(fetcher, `${origins.youtube}/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
  } catch {
    return unavailable("YouTube");
  }
  if (!oembed.json) return oembed.status >= 500 ? unavailable("YouTube") : fail("PROOF_NOT_FOUND", "That video was not found or is private.");
  const handle = oembed.json.author_url?.match(/\/@([^/?#]+)/)?.[1];
  if (!handle) return fail("WRONG_ACCOUNT", "That channel has no @handle yet. Set one in YouTube Studio first.");
  const author = decodeURIComponent(handle).toLowerCase();
  if (author !== request.account) return fail("WRONG_ACCOUNT", `That video is by @${author}, not @${request.account}.`);
  const text = oembed.json.title || "";
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The video title does not contain your code.");
  return { ok: true, stableRawId: null, evidence: { url: `https://www.youtube.com/watch?v=${id}`, author: `@${author}`, excerpt: excerpt(text) } };
}

// ------------------------------------------------------------------ Bluesky

export function blueskyPost(url: URL) {
  if (!/^(?:www\.)?bsky\.app$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([a-z0-9]{8,20})\/?$/i);
  if (!match) return null;
  const actor = decodeURIComponent(match[1]).toLowerCase();
  if (!/^(?:did:plc:[a-z2-7]{24}|did:web:[a-z0-9.-]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*)$/.test(actor)) return null;
  return { actor, rkey: match[2] };
}

type BlueskyPosts = { posts?: Array<{ author?: { did?: string; handle?: string }; record?: { text?: string } }> };

async function verifyBluesky(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const post = url ? blueskyPost(url) : null;
  if (!post) return fail("PROOF_URL", "Paste the post link, like https://bsky.app/profile/handle.bsky.social/post/3k2abc.");
  try {
    let did = post.actor;
    if (!did.startsWith("did:")) {
      const resolved = await fetchJson<{ did?: string }>(fetcher, `${origins.bluesky}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`);
      if (!resolved.json?.did) return resolved.status >= 500 ? unavailable("Bluesky") : fail("PROOF_NOT_FOUND", "That Bluesky account was not found.");
      did = resolved.json.did;
    }
    const uri = `at://${did}/app.bsky.feed.post/${post.rkey}`;
    const result = await fetchJson<BlueskyPosts>(fetcher, `${origins.bluesky}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    if (!result.json) return unavailable("Bluesky");
    const found = result.json.posts?.[0];
    if (!found?.author?.handle || !found.author.did) return fail("PROOF_NOT_FOUND", "That post was not found.");
    const author = found.author.handle.toLowerCase();
    if (author !== request.account) return fail("WRONG_ACCOUNT", `That post is by @${author}, not @${request.account}.`);
    const text = found.record?.text || "";
    if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The post does not contain your code.");
    return {
      ok: true,
      stableRawId: found.author.did,
      evidence: { url: `https://bsky.app/profile/${author}/post/${post.rkey}`, author: `@${author}`, excerpt: excerpt(text) },
    };
  } catch {
    return unavailable("Bluesky");
  }
}

// ---------------------------------------------------------------- Farcaster

type HubVerifications = {
  messages?: Array<{
    data?: {
      fid?: number;
      verificationAddAddressBody?: { address?: string; protocol?: string; verificationType?: number; chainId?: number };
      verificationAddEthAddressBody?: { address?: string; verificationType?: number; chainId?: number };
    };
  }>;
};

async function verifyFarcaster(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  try {
    const proof = await fetchJson<{ fid?: number }>(fetcher, `${origins.farcaster}/v1/userNameProofByName?name=${encodeURIComponent(request.account)}`);
    if (!proof.json) return unavailable("Farcaster");
    const fid = proof.json.fid;
    if (!fid) return fail("PROOF_NOT_FOUND", `No Farcaster account is registered as @${request.account}.`);
    const verifications = await fetchJson<HubVerifications>(fetcher, `${origins.farcaster}/v1/verificationsByFid?fid=${fid}&pageSize=100`);
    if (!verifications.json) return unavailable("Farcaster");
    const wallet = request.wallet.toLowerCase();
    const verified = (verifications.json.messages || []).some((message) => {
      const body = message.data?.verificationAddAddressBody || message.data?.verificationAddEthAddressBody;
      if (!body?.address || message.data?.fid !== fid) return false;
      const protocol = (message.data?.verificationAddAddressBody?.protocol || "PROTOCOL_ETHEREUM").toUpperCase();
      // Only externally owned accounts: a contract wallet's address can belong to someone else on BNB Chain.
      const eoa = !body.verificationType && !body.chainId;
      return protocol === "PROTOCOL_ETHEREUM" && eoa && body.address.toLowerCase() === wallet;
    });
    if (!verified) {
      return fail("WALLET_NOT_VERIFIED", `@${request.account} has not added ${request.wallet} under Verified addresses on Farcaster.`);
    }
    return {
      ok: true,
      stableRawId: String(fid),
      evidence: { url: `https://farcaster.xyz/${request.account}`, author: `@${request.account} (fid ${fid})`, excerpt: `Verified address ${request.wallet}` },
    };
  } catch {
    return unavailable("Farcaster");
  }
}

// ------------------------------------------------------------------ Weibo

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
let weiboVisitor: { cookie: string; expires: number; origin: string } | null = null;

/** Weibo serves public profiles to guests holding its visitor cookies (SUB, SUBP). */
async function weiboCookie(fetcher: FetchLike, origins: Record<OriginKey, string>) {
  if (weiboVisitor && weiboVisitor.expires > Date.now() && weiboVisitor.origin === origins.weiboPassport) return weiboVisitor.cookie;
  const { body } = await fetchText(fetcher, `${origins.weiboPassport}/visitor/genvisitor2`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": BROWSER_UA },
    body: "cb=visitor_gray_callback&tid=&from=weibo",
  });
  const sub = body.match(/"sub":"([^"]+)"/)?.[1];
  const subp = body.match(/"subp":"([^"]+)"/)?.[1];
  if (!sub || !subp) throw new Error("no visitor cookie");
  weiboVisitor = { cookie: `SUB=${sub}; SUBP=${subp}`, expires: Date.now() + 30 * 60_000, origin: origins.weiboPassport };
  return weiboVisitor.cookie;
}

type WeiboProfile = { ok?: number; data?: { user?: { idstr?: string; screen_name?: string; description?: string } } };

async function weiboProfile(fetcher: FetchLike, origins: Record<OriginKey, string>, query: string) {
  const cookie = await weiboCookie(fetcher, origins);
  const result = await fetchJson<WeiboProfile>(fetcher, `${origins.weibo}/ajax/profile/info?${query}`, {
    headers: { cookie, referer: "https://weibo.com/", "User-Agent": BROWSER_UA },
  });
  if (!result.json) weiboVisitor = null;
  return result;
}

async function verifyWeibo(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  try {
    const profile = await weiboProfile(fetcher, origins, `uid=${request.account}`);
    if (!profile.json) return unavailable("Weibo");
    const user = profile.json.data?.user;
    if (!user?.idstr) return fail("PROOF_NOT_FOUND", `No Weibo account has UID ${request.account}.`);
    if (user.idstr !== request.account) return fail("WRONG_ACCOUNT", `Weibo returned UID ${user.idstr}, not ${request.account}.`);
    const bio = user.description || "";
    if (!containsCode(bio, request.code)) return fail("CODE_MISSING", "Your Weibo bio does not contain the code yet.");
    return {
      ok: true,
      stableRawId: user.idstr,
      evidence: { url: `https://weibo.com/u/${user.idstr}`, author: user.screen_name || `UID ${user.idstr}`, excerpt: excerpt(bio) },
    };
  } catch {
    return unavailable("Weibo");
  }
}

// ---------------------------------------------------------------- Bilibili

type BilibiliCard = { code?: number; data?: { card?: { mid?: string | number; name?: string; sign?: string } } };

async function bilibiliCard(fetcher: FetchLike, origins: Record<OriginKey, string>, mid: string) {
  return fetchJson<BilibiliCard>(fetcher, `${origins.bilibili}/x/web-interface/card?mid=${mid}`, {
    headers: { "User-Agent": BROWSER_UA, referer: "https://www.bilibili.com/" },
  });
}

async function verifyBilibili(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  try {
    const result = await bilibiliCard(fetcher, origins, request.account);
    if (!result.json) return unavailable("Bilibili");
    const card = result.json.data?.card;
    if (result.json.code !== 0 || !card?.mid) return fail("PROOF_NOT_FOUND", `No Bilibili account has UID ${request.account}.`);
    if (String(card.mid) !== request.account) return fail("WRONG_ACCOUNT", `Bilibili returned UID ${card.mid}, not ${request.account}.`);
    const bio = card.sign || "";
    if (!containsCode(bio, request.code)) return fail("CODE_MISSING", "Your Bilibili bio does not contain the code yet.");
    return {
      ok: true,
      stableRawId: String(card.mid),
      evidence: { url: `https://space.bilibili.com/${card.mid}`, author: card.name || `UID ${card.mid}`, excerpt: excerpt(bio) },
    };
  } catch {
    return unavailable("Bilibili");
  }
}

// ------------------------------------------------- WeChat Official Accounts

/** Canonical article URL: short /s/<id> links or long /s?__biz=…&mid=…&idx=…&sn=… links. */
export function wechatArticleUrl(url: URL) {
  if (url.hostname.toLowerCase() !== "mp.weixin.qq.com") return null;
  const short = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{10,64})\/?$/);
  if (short) return `/s/${short[1]}`;
  if (url.pathname === "/s") {
    const biz = url.searchParams.get("__biz");
    const mid = url.searchParams.get("mid");
    const idx = url.searchParams.get("idx");
    const sn = url.searchParams.get("sn");
    if (biz && /^[A-Za-z0-9+/=]{8,40}$/.test(biz) && mid && /^\d{1,15}$/.test(mid) && idx && /^\d{1,3}$/.test(idx) && sn && /^[0-9a-f]{32}$/i.test(sn)) {
      return `/s?__biz=${encodeURIComponent(biz)}&mid=${mid}&idx=${idx}&sn=${sn.toLowerCase()}`;
    }
  }
  return null;
}

export function readWeChatArticle(html: string) {
  const account = html.match(/var\s+user_name\s*=\s*"(gh_[0-9a-f]{12})"/i)?.[1]?.toLowerCase() ?? null;
  const name = html.match(/var\s+nickname\s*=\s*htmlDecode\("([^"]*)"\)/)?.[1] ?? html.match(/var\s+nickname\s*=\s*"([^"]*)"/)?.[1] ?? null;
  const title = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)?.[1] ?? html.match(/var\s+msg_title\s*=\s*'([^']*)'/)?.[1] ?? "";
  const start = html.indexOf('id="js_content"');
  let body = "";
  if (start >= 0) {
    const open = html.indexOf(">", start);
    const end = html.indexOf("<script", open);
    body = html.slice(open + 1, end > open ? end : open + 200_000);
  }
  return { account, name: name ? htmlToText(name) : null, title: htmlToText(title), text: htmlToText(body) };
}

async function verifyWeChat(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const url = parseProofUrl(request.proofUrl);
  const path = url ? wechatArticleUrl(url) : null;
  if (!path) return fail("PROOF_URL", "Paste the article link, like https://mp.weixin.qq.com/s/….");
  let page: { status: number; body: string };
  try {
    page = await fetchText(fetcher, `${origins.wechat}${path}`, { headers: { "User-Agent": BROWSER_UA } }, WECHAT_BODY_BYTES);
  } catch {
    return unavailable("WeChat");
  }
  if (page.status >= 500) return unavailable("WeChat");
  const article = readWeChatArticle(page.body);
  if (!article.account) return fail("PROOF_NOT_FOUND", "That article was not found, was deleted, or WeChat asked for a check. Try again or publish again.");
  if (article.account !== request.account) {
    return fail("WRONG_ACCOUNT", `That article is from ${article.name || article.account}, not ${request.account}.`);
  }
  const text = `${article.title}\n${article.text}`;
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The article does not contain your code.");
  return {
    ok: true,
    stableRawId: article.account,
    evidence: { url: `https://mp.weixin.qq.com${path}`, author: article.name || article.account, excerpt: excerpt(article.title || article.text) },
  };
}

// ------------------------------------------------- Xiaohongshu (RedNote)

const XHS_ID = /^[0-9a-f]{24}$/;

/** The first link in what someone pasted: the app's Share button copies a sentence around it. */
function firstLink(text: string | null) {
  if (!text) return null;
  const value = text.trim();
  const match = value.match(/https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/)?.[0]?.replace(/[.,;:!?)\]]+$/, "");
  if (match) return parseProofUrl(match);
  return /^(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\//i.test(value) ? parseProofUrl(`https://${value}`) : null;
}

/** A note id from a note link, or the path of an xhslink.com short link. */
export function xiaohongshuNoteRef(url: URL): { noteId: string } | { short: string } | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (/^(?:www\.)?xiaohongshu\.com$/.test(host)) {
    const id = parts[0] === "explore" && parts.length === 2 ? parts[1] : parts[0] === "discovery" && parts[1] === "item" && parts.length === 3 ? parts[2] : "";
    return XHS_ID.test(id.toLowerCase()) ? { noteId: id.toLowerCase() } : null;
  }
  if (host === "xhslink.com") {
    const path = `/${parts.join("/")}`;
    return /^\/(?:[a-z]\/)?[A-Za-z0-9]{4,24}$/.test(path) ? { short: path } : null;
  }
  return null;
}

export type XiaohongshuNote = { noteId: string; title: string; desc: string; userId: string; nickname: string | null };

/** The note and its author from a note page's server-rendered state. */
export function readXiaohongshuNote(html: string, noteId: string): XiaohongshuNote | "missing" | null {
  // User text on the page is escaped, so it can never open a <script> of its own.
  const marker = "<script>window.__INITIAL_STATE__=";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf("</script>", start);
  if (end < 0) return null;
  let state: { note?: { noteDetailMap?: Record<string, { note?: Record<string, unknown> }> } };
  try {
    // A JavaScript object literal: `undefined` is its only value JSON lacks.
    state = JSON.parse(html.slice(start + marker.length, end).replace(/([:[,])\s*undefined(?=\s*[,}\]])/g, "$1null"));
  } catch {
    return null;
  }
  const note = state?.note?.noteDetailMap?.[noteId]?.note;
  if (!note) return "missing";
  const user = (note.user ?? {}) as { userId?: unknown; nickname?: unknown };
  const userId = typeof user.userId === "string" ? user.userId.toLowerCase() : "";
  if (String(note.noteId ?? "").toLowerCase() !== noteId || !XHS_ID.test(userId)) return "missing";
  return {
    noteId,
    title: typeof note.title === "string" ? note.title : "",
    desc: typeof note.desc === "string" ? note.desc : "",
    userId,
    nickname: typeof user.nickname === "string" && user.nickname ? user.nickname : null,
  };
}

const XHS_NOT_FOUND = "That note was not found, is private, or is still in review. New notes can take a few minutes to become public.";

/** Reads the note a pasted link (note link, xhslink.com short link or share text) points to. */
async function loadXiaohongshuNote(
  input: string | null,
  fetcher: FetchLike,
  origins: Record<OriginKey, string>
): Promise<{ ok: true; note: XiaohongshuNote } | { ok: false; code: ProofFailure; message: string }> {
  const url = firstLink(input);
  const ref = url ? xiaohongshuNoteRef(url) : null;
  if (!ref) return { ok: false, code: "PROOF_URL", message: "Paste the note link, like https://www.xiaohongshu.com/explore/… or an xhslink.com link." };
  let noteId: string;
  if ("short" in ref) {
    let hop: { status: number; location: string | null };
    try {
      hop = await fetchText(fetcher, `${origins.xhslink}${ref.short}`, undefined, MAX_BODY_BYTES, true);
    } catch {
      return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu did not answer. Try again in a minute." };
    }
    if (hop.status >= 500) return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu did not answer. Try again in a minute." };
    let target: URL | null = null;
    try {
      target = hop.location ? new URL(hop.location) : null;
    } catch {
      target = null;
    }
    const resolved = target ? xiaohongshuNoteRef(target) : null;
    if (!resolved || !("noteId" in resolved)) {
      return {
        ok: false,
        code: "PROOF_NOT_FOUND",
        message: "That short link did not lead to a note. Open it in a browser and paste the full xiaohongshu.com/explore/… address instead.",
      };
    }
    noteId = resolved.noteId;
  } else {
    noteId = ref.noteId;
  }

  let page: { status: number; body: string; location: string | null };
  try {
    page = await fetchText(fetcher, `${origins.xiaohongshu}/explore/${noteId}`, undefined, MAX_BODY_BYTES, true);
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu did not answer. Try again in a minute." };
  }
  if (page.status >= 300 && page.status < 400) {
    let path = "";
    try {
      path = new URL(page.location || "", "https://www.xiaohongshu.com").pathname;
    } catch {
      path = "";
    }
    // A missing, private or unreviewed note redirects to /404; anything else is a login or a check.
    if (path.startsWith("/404")) return { ok: false, code: "PROOF_NOT_FOUND", message: XHS_NOT_FOUND };
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu asked for a login or a check. Try again in a few minutes." };
  }
  if (page.status === 404) return { ok: false, code: "PROOF_NOT_FOUND", message: XHS_NOT_FOUND };
  if (page.status !== 200) return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu did not answer. Try again in a minute." };
  const note = readXiaohongshuNote(page.body, noteId);
  if (note === null) return { ok: false, code: "SOURCE_UNAVAILABLE", message: "Xiaohongshu returned a page Fortune could not read. Try again in a few minutes." };
  if (note === "missing") return { ok: false, code: "PROOF_NOT_FOUND", message: XHS_NOT_FOUND };
  return { ok: true, note };
}

async function verifyXiaohongshu(request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>): Promise<ProofOutcome> {
  const loaded = await loadXiaohongshuNote(request.proofUrl, fetcher, origins);
  if (!loaded.ok) return fail(loaded.code, loaded.message);
  const { note } = loaded;
  if (note.userId !== request.account) {
    return fail("WRONG_ACCOUNT", `That note is by ${note.nickname || note.userId}, not the account named in the launch.`);
  }
  const text = `${note.title}\n${note.desc}`;
  if (!containsCode(text, request.code)) return fail("CODE_MISSING", "The note's title and text do not contain your code.");
  return {
    ok: true,
    stableRawId: note.userId,
    evidence: { url: `https://www.xiaohongshu.com/explore/${note.noteId}`, author: note.nickname || note.userId, excerpt: excerpt(note.title || note.desc) },
  };
}

// ------------------------------------------------------ private claim links

async function verifyClaimLink(request: ProofRequest): Promise<ProofOutcome> {
  const secret = claimSecretFromText(request.secret);
  if (!secret) return fail("PROOF_URL", "Open the whole claim link you were sent.");
  if (claimAccountOf(secret) !== request.account) return fail("WRONG_ACCOUNT", "This claim link does not match that recipient.");
  return { ok: true, stableRawId: request.account, evidence: { url: null, author: "Private claim link", excerpt: "The link matches this recipient." } };
}

// --------------------------------------------------------------- resolving

export type ResolvedAccount = { ok: true; account: string; name: string | null } | { ok: false; code: ProofFailure; message: string };

/**
 * Turns a profile link, custom domain or article link into the account id the
 * vault stores, with the display name when the platform shares it.
 */
export async function resolveSocialAccount(
  platform: SocialPlatform,
  input: string,
  options?: { fetcher?: FetchLike; env?: Record<string, string | undefined> }
): Promise<ResolvedAccount> {
  const fetcher = options?.fetcher ?? fetch;
  const origins = proofOrigins(options?.env);
  const raw = input.trim();
  const url = /^https?:\/\//i.test(raw) ? parseProofUrl(raw) : /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw) ? parseProofUrl(`https://${raw}`) : null;
  try {
    if (platform.key === "weibo") {
      let query: string | null = null;
      if (url) {
        if (!/^(?:www\.|m\.)?weibo\.(?:com|cn)$/i.test(url.hostname)) return fail("PROOF_URL", "Paste a weibo.com profile link or the UID.") as ResolvedAccount;
        const parts = url.pathname.split("/").filter(Boolean);
        const value = parts[0] === "u" || parts[0] === "profile" ? parts[1] || "" : parts[0] || "";
        query = /^\d{5,12}$/.test(value) ? `uid=${value}` : /^[A-Za-z0-9_-]{2,30}$/.test(value) ? `custom=${value}` : null;
      } else {
        const value = raw.replace(/^uid[:：\s]*/i, "");
        query = /^\d{5,12}$/.test(value) ? `uid=${value}` : /^[A-Za-z0-9_-]{2,30}$/.test(value) ? `custom=${value}` : null;
      }
      if (!query) return fail("PROOF_URL", "Enter the Weibo UID or profile link.") as ResolvedAccount;
      const profile = await weiboProfile(fetcher, origins, query);
      if (!profile.json) return unavailable("Weibo") as ResolvedAccount;
      const user = profile.json.data?.user;
      if (!user?.idstr) return fail("PROOF_NOT_FOUND", "No Weibo account matches that.") as ResolvedAccount;
      return { ok: true, account: user.idstr, name: user.screen_name || null };
    }
    if (platform.key === "bilibili") {
      let mid = raw.replace(/^uid[:：\s]*/i, "");
      if (url) {
        const parts = url.pathname.split("/").filter(Boolean);
        mid = url.hostname.toLowerCase().startsWith("space.") ? parts[0] || "" : parts[0] === "space" ? parts[1] || "" : "";
      }
      if (!/^[1-9]\d{0,11}$/.test(mid)) return fail("PROOF_URL", "Enter the Bilibili UID or space.bilibili.com link.") as ResolvedAccount;
      const result = await bilibiliCard(fetcher, origins, mid);
      if (!result.json) return unavailable("Bilibili") as ResolvedAccount;
      const card = result.json.data?.card;
      if (result.json.code !== 0 || !card?.mid) return fail("PROOF_NOT_FOUND", "No Bilibili account has that UID.") as ResolvedAccount;
      return { ok: true, account: String(card.mid), name: card.name || null };
    }
    if (platform.key === "wechat") {
      if (/^gh_[0-9a-f]{12}$/i.test(raw)) return { ok: true, account: raw.toLowerCase(), name: null };
      const path = url ? wechatArticleUrl(url) : null;
      if (!path) return fail("PROOF_URL", "Paste a link to any article from the Official Account, or its gh_ ID.") as ResolvedAccount;
      const page = await fetchText(fetcher, `${origins.wechat}${path}`, { headers: { "User-Agent": BROWSER_UA } }, WECHAT_BODY_BYTES);
      const article = readWeChatArticle(page.body);
      if (!article.account) return fail("PROOF_NOT_FOUND", "That article could not be read. Try another article link.") as ResolvedAccount;
      return { ok: true, account: article.account, name: article.name };
    }
    if (platform.key === "xiaohongshu") {
      if (XHS_ID.test(raw.toLowerCase())) return { ok: true, account: raw.toLowerCase(), name: null };
      const link = firstLink(raw);
      const parts = link?.pathname.split("/").filter(Boolean) ?? [];
      if (link && /^(?:www\.)?xiaohongshu\.com$/i.test(link.hostname) && parts[0] === "user" && parts[1] === "profile" && XHS_ID.test((parts[2] || "").toLowerCase())) {
        return { ok: true, account: parts[2].toLowerCase(), name: null };
      }
      const loaded = await loadXiaohongshuNote(raw, fetcher, origins);
      if (!loaded.ok) {
        return loaded.code === "PROOF_URL"
          ? (fail("PROOF_URL", "Paste the Xiaohongshu profile link or a link to one of the account's notes.") as ResolvedAccount)
          : (fail(loaded.code, loaded.message) as ResolvedAccount);
      }
      return { ok: true, account: loaded.note.userId, name: loaded.note.nickname };
    }
    return fail("PROOF_URL", "This platform does not need a lookup.") as ResolvedAccount;
  } catch {
    return unavailable(platform.label) as ResolvedAccount;
  }
}

const VERIFIERS: Record<SocialPlatformKey, (request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>) => Promise<ProofOutcome>> = {
  x: verifyX,
  github: verifyGitHub,
  tiktok: verifyTikTok,
  telegram: verifyTelegram,
  youtube: verifyYouTube,
  farcaster: verifyFarcaster,
  bluesky: verifyBluesky,
  weibo: verifyWeibo,
  bilibili: verifyBilibili,
  wechat: verifyWeChat,
  xiaohongshu: verifyXiaohongshu,
  link: verifyClaimLink,
};

export async function verifySocialProof(
  request: ProofRequest,
  options?: { fetcher?: FetchLike; env?: Record<string, string | undefined> }
): Promise<ProofOutcome> {
  const verifier = VERIFIERS[request.platform.key];
  return verifier(request, options?.fetcher ?? fetch, proofOrigins(options?.env));
}
