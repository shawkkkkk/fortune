import { encodeAbiParameters, getAddress, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";

// Social fee routing (custom-pairs beta): a launch can split its creator fee
// between wallets and social accounts. Accounts claim on Fortune after proving
// they control the account. Client-safe: no secrets and no network access.

/** Mirrors FortuneSocialFeeVault constants. */
export const SOCIAL_FEE_RULES = {
  bps: 10_000,
  maxShares: 10,
  minShareBps: 100,
  walletPlatform: 0,
  maxPlatform: 32,
  maxAccountLength: 64,
  firstBindDelaySeconds: 60 * 60,
  rebindDelaySeconds: 3 * 24 * 60 * 60,
} as const;

export type SocialPlatformKey = "x" | "github" | "tiktok" | "telegram" | "youtube" | "farcaster" | "bluesky";

export type SocialPlatform = {
  /** Permanent onchain id. Never renumber. */
  id: number;
  key: SocialPlatformKey;
  label: string;
  /** How the handle is written on the platform, for display. */
  prefix: string;
  pattern: RegExp;
  placeholder: string;
  /** Where the challenge goes. */
  proof: string;
  /** Example of the link the verifier accepts, or null when no link is needed. */
  proofExample: string | null;
  /** Whether the verifier pins the platform's permanent account id. */
  pinsAccountId: boolean;
  profileUrl: (account: string) => string;
};

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: 1,
    key: "x",
    label: "X",
    prefix: "@",
    pattern: /^[a-z0-9_]{1,15}$/,
    placeholder: "handle",
    proof: "Post the code from the account, then paste the post link.",
    proofExample: "https://x.com/handle/status/1234567890",
    pinsAccountId: true,
    profileUrl: (account) => `https://x.com/${account}`,
  },
  {
    id: 2,
    key: "github",
    label: "GitHub",
    prefix: "",
    pattern: /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/,
    placeholder: "username",
    proof: "Create a public gist containing the code, then paste the gist link.",
    proofExample: "https://gist.github.com/username/0123456789abcdef0123",
    pinsAccountId: true,
    profileUrl: (account) => `https://github.com/${account}`,
  },
  {
    id: 3,
    key: "tiktok",
    label: "TikTok",
    prefix: "@",
    pattern: /^[a-z0-9_.]{2,24}$/,
    placeholder: "handle",
    proof: "Put the code in a public video caption, then paste the video link.",
    proofExample: "https://www.tiktok.com/@handle/video/1234567890",
    pinsAccountId: false,
    profileUrl: (account) => `https://www.tiktok.com/@${account}`,
  },
  {
    id: 4,
    key: "telegram",
    label: "Telegram channel",
    prefix: "@",
    pattern: /^[a-z][a-z0-9_]{3,31}$/,
    placeholder: "channel",
    proof: "Publish the code as a post in the public channel, then paste the post link.",
    proofExample: "https://t.me/channel/123",
    pinsAccountId: false,
    profileUrl: (account) => `https://t.me/${account}`,
  },
  {
    id: 5,
    key: "youtube",
    label: "YouTube",
    prefix: "@",
    pattern: /^[a-z0-9_.-]{3,30}$/,
    placeholder: "handle",
    proof: "Put the code in the title of a public or unlisted video, then paste the video link.",
    proofExample: "https://www.youtube.com/watch?v=abcdefghijk",
    pinsAccountId: false,
    profileUrl: (account) => `https://www.youtube.com/@${account}`,
  },
  {
    id: 6,
    key: "farcaster",
    label: "Farcaster",
    prefix: "@",
    pattern: /^(?:[a-z0-9][a-z0-9-]{0,15}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)$/,
    placeholder: "username",
    proof: "Add this wallet under Verified addresses in your Farcaster app. No post needed.",
    proofExample: null,
    pinsAccountId: true,
    profileUrl: (account) => `https://farcaster.xyz/${account}`,
  },
  {
    id: 7,
    key: "bluesky",
    label: "Bluesky",
    prefix: "@",
    pattern: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/,
    placeholder: "handle.bsky.social",
    proof: "Post the code from the account, then paste the post link.",
    proofExample: "https://bsky.app/profile/handle.bsky.social/post/3k2abc",
    pinsAccountId: true,
    profileUrl: (account) => `https://bsky.app/profile/${account}`,
  },
];

export function socialPlatform(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const key = String(value).trim().toLowerCase();
  return SOCIAL_PLATFORMS.find((platform) => String(platform.id) === key || platform.key === key) ?? null;
}

/** Same rule as FortuneSocialFeeVault.isCanonicalAccount. */
export function isVaultCanonical(account: string) {
  return account.length > 0 && account.length <= SOCIAL_FEE_RULES.maxAccountLength && /^[a-z0-9_.-]+$/.test(account);
}

const PROFILE_HOSTS: Record<SocialPlatformKey, RegExp> = {
  x: /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/,
  github: /^(?:www\.)?github\.com$/,
  tiktok: /^(?:www\.|m\.)?tiktok\.com$/,
  telegram: /^(?:www\.)?(?:t\.me|telegram\.me)$/,
  youtube: /^(?:www\.|m\.)?youtube\.com$/,
  farcaster: /^(?:www\.)?(?:warpcast\.com|farcaster\.xyz)$/,
  bluesky: /^(?:www\.)?bsky\.app$/,
};

/**
 * Turns what people paste (a handle, "@handle" or a profile link) into the
 * canonical account the vault stores: lowercase, no "@", no URL.
 */
export function canonicalAccount(platformValue: number | string, raw: string):
  | { ok: true; platform: SocialPlatform; account: string }
  | { ok: false; reason: string } {
  const platform = socialPlatform(platformValue);
  if (!platform) return { ok: false, reason: "Choose a supported platform." };
  let value = raw.trim();
  if (!value) return { ok: false, reason: `Enter the ${platform.label} ${platform.placeholder}.` };

  if (/^https?:\/\//i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { ok: false, reason: "That link could not be read." };
    }
    if (!PROFILE_HOSTS[platform.key].test(url.hostname.toLowerCase())) {
      return { ok: false, reason: `Paste a ${platform.label} profile link or just the ${platform.placeholder}.` };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform.key === "bluesky") value = parts[0] === "profile" ? parts[1] || "" : "";
    else if (platform.key === "telegram" && parts[0] === "s") value = parts[1] || "";
    else value = parts[0] || "";
  }

  value = value.replace(/^@/, "").toLowerCase();
  if (!platform.pattern.test(value) || !isVaultCanonical(value)) {
    return { ok: false, reason: `That is not a valid ${platform.label} ${platform.placeholder}.` };
  }
  return { ok: true, platform, account: value };
}

/** keccak256(abi.encode(uint8 platform, string account)), as FortuneSocialFeeVault.identityIdOf. */
export function identityIdOf(platformId: number, account: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "string" }], [platformId, account]));
}

/** keccak256(abi.encode(uint8(0), wallet)), as FortuneSocialFeeVault.walletIdentityOf. */
export function walletIdentityOf(wallet: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "address" }], [0, getAddress(wallet)]));
}

/** bytes32 the vault pins for a platform's permanent account id. */
export function stableIdHash(platform: SocialPlatformKey, rawId: string): Hex {
  return keccak256(toBytes(`${platform}:${rawId}`));
}

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

/**
 * The code an account posts to prove it wants fees paid to `wallet`. It commits
 * to the chain, the vault, the account, the wallet and the vault's current nonce
 * for the account, so a post cannot be reused for another wallet or replayed
 * after the account has bound once. 96 bits: infeasible to match with another wallet.
 */
export function challengeCode(input: { chainId: number; vault: Address; identityId: Hex; wallet: Address; nonce: bigint | number }) {
  const digest = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "address" }, { type: "uint64" }],
      [
        "fortune-social-bind-v1",
        BigInt(input.chainId),
        getAddress(input.vault),
        input.identityId,
        getAddress(input.wallet),
        BigInt(input.nonce),
      ]
    )
  );
  return `fortune-${digest.slice(2, 26)}`;
}

export function challengePost(platform: SocialPlatform, code: string) {
  const where = platform.key === "x" ? "@fortunepad" : "fortunepad.fun";
  return `Verifying this account to claim creator fees on ${where}: ${code}`;
}

/** EIP-712 binding the verifier signs and FortuneSocialFeeVault.bind checks. */
export function bindingTypedData(input: {
  chainId: number;
  vault: Address;
  identityId: Hex;
  wallet: Address;
  stableId: Hex;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: { name: "FortuneSocialFeeVault", version: "1", chainId: input.chainId, verifyingContract: getAddress(input.vault) },
    types: {
      Binding: [
        { name: "identityId", type: "bytes32" },
        { name: "wallet", type: "address" },
        { name: "stableId", type: "bytes32" },
        { name: "nonce", type: "uint64" },
        { name: "deadline", type: "uint64" },
      ],
    },
    primaryType: "Binding" as const,
    message: {
      identityId: input.identityId,
      wallet: getAddress(input.wallet),
      stableId: input.stableId,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}

export type FeeShareInput = { kind: "wallet"; wallet: string; percent: string } | { kind: "social"; platform: number; account: string; percent: string };

export type FeeShareStruct = { platform: number; account: string; wallet: Address; shareBps: number };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Validates the launch form's fee split with the same rules as
 * FortuneSocialFeeVault.checkShares and returns the structs to submit. A single
 * row paying the creator's own wallet returns no shares: that is a plain launch.
 */
export function buildFeeShares(rows: FeeShareInput[], creator: Address | null):
  | { ok: true; shares: FeeShareStruct[] }
  | { ok: false; reason: string; row?: number } {
  if (!rows.length) return { ok: true, shares: [] };
  if (rows.length > SOCIAL_FEE_RULES.maxShares) return { ok: false, reason: `Up to ${SOCIAL_FEE_RULES.maxShares} recipients.` };
  const shares: FeeShareStruct[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const [index, row] of rows.entries()) {
    const bps = Math.round(Number(row.percent) * 100);
    if (!Number.isFinite(bps) || String(row.percent).trim() === "") return { ok: false, reason: "Enter a share for every recipient.", row: index };
    if (Math.abs(Number(row.percent) * 100 - bps) > 1e-6) return { ok: false, reason: "Shares can have at most two decimals.", row: index };
    if (bps < SOCIAL_FEE_RULES.minShareBps) return { ok: false, reason: "Each recipient needs at least 1%.", row: index };
    total += bps;
    if (row.kind === "wallet") {
      if (!isAddress(row.wallet.trim())) return { ok: false, reason: "Enter a valid 0x wallet address.", row: index };
      const wallet = getAddress(row.wallet.trim());
      const key = `wallet:${wallet.toLowerCase()}`;
      if (seen.has(key)) return { ok: false, reason: "That wallet is already listed.", row: index };
      seen.add(key);
      shares.push({ platform: 0, account: "", wallet, shareBps: bps });
    } else {
      const parsed = canonicalAccount(row.platform, row.account);
      if (!parsed.ok) return { ok: false, reason: parsed.reason, row: index };
      const key = `${parsed.platform.id}:${parsed.account}`;
      if (seen.has(key)) return { ok: false, reason: "That account is already listed.", row: index };
      seen.add(key);
      shares.push({ platform: parsed.platform.id, account: parsed.account, wallet: ZERO_ADDRESS, shareBps: bps });
    }
  }
  if (total !== SOCIAL_FEE_RULES.bps) return { ok: false, reason: `Shares add up to ${(total / 100).toFixed(2).replace(/\.?0+$/, "")}%, not 100%.` };
  if (shares.length === 1 && shares[0].platform === 0 && creator && shares[0].wallet.toLowerCase() === creator.toLowerCase()) {
    return { ok: true, shares: [] };
  }
  return { ok: true, shares };
}

export function formatShareBps(bps: number) {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function describeAccount(platformId: number, account: string) {
  const platform = socialPlatform(platformId);
  if (!platform) return account;
  return `${platform.prefix}${account}`;
}

const NO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type SocialIdentity = {
  identityId: Hex;
  exists: boolean;
  platform: number;
  platformKey: string;
  account: string;
  wallet: Address | null;
  pendingWallet: Address | null;
  pendingAt: number | null;
  stableId: Hex;
  nonce: string;
  curveCount: number;
  tokenCount: number;
};

export type IdentityTuple = {
  identityId: Hex;
  exists: boolean;
  platform: number;
  account: string;
  wallet: Address;
  pendingWallet: Address;
  pendingAt: bigint;
  stableId: Hex;
  nonce: bigint;
  curveCount: bigint;
  tokenCount: bigint;
};

export function toIdentity(raw: IdentityTuple, fallback?: { platform: number; account: string }): SocialIdentity {
  const platform = raw.exists ? Number(raw.platform) : fallback?.platform ?? Number(raw.platform);
  return {
    identityId: raw.identityId,
    exists: raw.exists,
    platform,
    platformKey: platform === 0 ? "wallet" : socialPlatform(platform)?.key ?? `platform-${platform}`,
    account: raw.exists ? raw.account : fallback?.account ?? "",
    wallet: raw.wallet !== NO_ADDRESS ? raw.wallet : null,
    pendingWallet: raw.pendingWallet !== NO_ADDRESS ? raw.pendingWallet : null,
    pendingAt: raw.pendingWallet !== NO_ADDRESS ? Number(raw.pendingAt) : null,
    stableId: raw.stableId,
    nonce: raw.nonce.toString(),
    curveCount: Number(raw.curveCount),
    tokenCount: Number(raw.tokenCount),
  };
}

export type SocialBalance = { token: Address; symbol: string; decimals: number; owed: string; claimable: string };

export type SocialCurveShare = {
  curve: Address;
  launchToken: Address;
  name: string;
  symbol: string;
  pairToken: Address;
  pairSymbol: string;
  pairDecimals: number;
  shareBps: number;
  phase: string;
  /** This identity's share of creator fees still sitting in the curve. */
  uncollected: string;
};

/** One identity as /api/public/v1/social/identity returns it. */
export type SocialIdentityDetail = { identity: SocialIdentity; balances: SocialBalance[]; curves: SocialCurveShare[]; curvesTruncated: boolean };
