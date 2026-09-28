import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { apiError, apiOk } from "@/lib/public-api";
import {
  SOCIAL_FEE_RULES,
  ZERO_BYTES32,
  bindingRefusal,
  bindingTypedData,
  canonicalAccount,
  challengeCode,
  identityIdOf,
  stableIdHash,
} from "@/lib/social-fees";
import { customPairClient } from "@/lib/custom-pairs-read";
import { attestorAccount, parseWallet, readIdentity, readSocialStatus } from "@/lib/social-fees-server";
import { verifySocialProof } from "@/lib/social-verify";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 12;
const attempts = new Map<string, { count: number; resetAt: number }>();

/** Best effort, per server instance: every attempt fetches from a platform. */
function rateLimited(client: string) {
  const now = Date.now();
  if (attempts.size > 5_000) {
    for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  }
  const entry = attempts.get(client);
  if (!entry || entry.resetAt <= now) {
    attempts.set(client, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > PER_CLIENT;
}

/**
 * Checks a public proof that an account wants its fees paid to `wallet`, then
 * signs the EIP-712 binding FortuneSocialFeeVault.bind accepts. The signature
 * only works when that wallet submits it, for this account, before its deadline.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("invalid_request", "Send a JSON body with platform, account, wallet and proofUrl.", 400);
  }
  const platformValue = typeof body.platform === "number" || typeof body.platform === "string" ? body.platform : "";
  const parsed = canonicalAccount(platformValue, typeof body.account === "string" ? body.account : "");
  if (!parsed.ok) return apiError("invalid_request", parsed.reason, 400);
  const wallet = parseWallet(typeof body.wallet === "string" ? body.wallet : null);
  if (!wallet) return apiError("invalid_request", "Connect the wallet that should receive the fees.", 400);
  const proofUrl = typeof body.proofUrl === "string" && body.proofUrl.trim() ? body.proofUrl.trim().slice(0, 500) : null;
  if (parsed.platform.proofExample && !proofUrl) return apiError("invalid_request", "Paste the link to your proof post.", 400);
  const secret = typeof body.secret === "string" ? body.secret.trim().slice(0, 100) : null;
  if (parsed.platform.key === "link" && !secret) return apiError("invalid_request", "Open the whole claim link you were sent.", 400);

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(client)) return apiError("rate_limited", "Too many verification attempts. Try again in a few minutes.", 429);

  let status;
  try {
    status = await readSocialStatus();
  } catch {
    return apiError("dependency_unavailable", "The social fee vault could not be read from BNB Chain right now.", 503);
  }
  if (!status.enabled || !status.vault) return apiError("protocol_not_configured", "Social fee routing is not enabled on this network.", 503);
  if (status.bindingsPaused) return apiError("protocol_not_configured", "New verifications are paused right now.", 503);
  const signer = attestorAccount();
  if (!signer || !status.ready) return apiError("protocol_not_configured", "Account verification is not configured on this deployment yet.", 503);

  const identityId = identityIdOf(parsed.platform.id, parsed.account);
  let identity;
  try {
    identity = await readIdentity(status.vault, identityId, { platform: parsed.platform.id, account: parsed.account });
  } catch {
    return apiError("dependency_unavailable", "The social fee vault could not be read from BNB Chain right now.", 503);
  }
  const refusal = bindingRefusal(parsed.platform.key, identity, wallet);
  if (refusal) return apiError("conflict", refusal.message, 409, refusal.reason ? { reason: refusal.reason } : undefined);

  const nonce = BigInt(identity.nonce);
  const code = challengeCode({ chainId: FORTUNE_NETWORK.chainId, vault: status.vault, identityId, wallet, nonce });
  const outcome = await verifySocialProof({ platform: parsed.platform, account: parsed.account, code, wallet, proofUrl, secret });
  if (!outcome.ok) {
    const unavailable = outcome.code === "SOURCE_UNAVAILABLE";
    return apiError(unavailable ? "dependency_unavailable" : "preflight_failed", outcome.message, unavailable ? 503 : 422, { reason: outcome.code, code });
  }

  const pinned = identity.stableId.toLowerCase() !== ZERO_BYTES32;
  if (pinned && !outcome.stableRawId) {
    return apiError("dependency_unavailable", `${parsed.platform.label} did not return the account's permanent id. Try again in a minute.`, 503);
  }
  const stableId = outcome.stableRawId ? stableIdHash(parsed.platform.key, outcome.stableRawId) : ZERO_BYTES32;
  if (pinned && identity.stableId.toLowerCase() !== stableId.toLowerCase()) {
    return apiError(
      "conflict",
      "This handle now belongs to a different account than the one that first verified it, so its fees stay with the original account.",
      409
    );
  }

  // The vault checks the deadline against chain time, which can run ahead of this server's clock.
  let now = Math.floor(Date.now() / 1000);
  try {
    now = Math.max(now, Number((await customPairClient().getBlock({ blockTag: "latest" })).timestamp));
  } catch {
    // Server time is close enough on a healthy chain.
  }
  const deadline = BigInt(now + 30 * 60);
  const signature = await signer.signTypedData(
    bindingTypedData({ chainId: FORTUNE_NETWORK.chainId, vault: status.vault, identityId, wallet, stableId, nonce, deadline })
  );

  return apiOk(
    {
      chainId: FORTUNE_NETWORK.chainId,
      vault: status.vault,
      identityId,
      platform: parsed.platform.id,
      platformKey: parsed.platform.key,
      account: parsed.account,
      wallet,
      stableId,
      nonce: nonce.toString(),
      deadline: Number(deadline),
      signature,
      effectiveAfterSeconds: identity.wallet ? SOCIAL_FEE_RULES.rebindDelaySeconds : SOCIAL_FEE_RULES.firstBindDelaySeconds,
      evidence: outcome.evidence,
    },
    { cacheSeconds: 0 }
  );
}
