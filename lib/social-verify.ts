import type { Address } from "viem";
import type { SocialPlatform, SocialPlatformKey } from "@/lib/social-fees";

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

/** One retry for a network error or a 5xx: platform edges drop the odd request. */
async function fetchText(fetcher: FetchLike, url: string, init?: RequestInit) {
  try {
    const first = await fetchOnce(fetcher, url, init);
    if (first.status < 500) return first;
  } catch {
    // retried below
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return fetchOnce(fetcher, url, init);
}

async function fetchOnce(fetcher: FetchLike, url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url, {
      ...init,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "fortunepad-social-verifier/1.0 (+https://fortunepad.fun)", ...(init?.headers || {}) },
    });
    const body = (await response.text()).slice(0, MAX_BODY_BYTES);
    return { status: response.status, body };
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

const VERIFIERS: Record<SocialPlatformKey, (request: ProofRequest, fetcher: FetchLike, origins: Record<OriginKey, string>) => Promise<ProofOutcome>> = {
  x: verifyX,
  github: verifyGitHub,
  tiktok: verifyTikTok,
  telegram: verifyTelegram,
  youtube: verifyYouTube,
  farcaster: verifyFarcaster,
  bluesky: verifyBluesky,
};

export async function verifySocialProof(
  request: ProofRequest,
  options?: { fetcher?: FetchLike; env?: Record<string, string | undefined> }
): Promise<ProofOutcome> {
  const verifier = VERIFIERS[request.platform.key];
  return verifier(request, options?.fetcher ?? fetch, proofOrigins(options?.env));
}
