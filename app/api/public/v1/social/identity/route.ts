import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { apiError, apiOk } from "@/lib/public-api";
import { canonicalAccount, identityIdOf } from "@/lib/social-fees";
import { customPairClient } from "@/lib/custom-pairs-read";
import { parseWallet, readIdentity, readIdentityDetail, readWalletIdentities, socialVaultAddress } from "@/lib/social-fees-server";

export const dynamic = "force-dynamic";

/**
 * One social account (`platform` + `account`) or every account a wallet is
 * bound to (`wallet`): binding state, balances waiting in the vault, and the
 * launches that name it with fees not yet collected.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const walletParam = url.searchParams.get("wallet");
  const platformParam = url.searchParams.get("platform");
  const accountParam = url.searchParams.get("account");

  let vault;
  try {
    vault = await socialVaultAddress();
  } catch {
    return apiError("dependency_unavailable", "The social fee vault could not be read from BNB Chain right now.", 503);
  }
  if (!vault) return apiError("protocol_not_configured", "Social fee routing is not enabled on this network.", 503);

  try {
    // Binding delays run on chain time; clients count down from it.
    const chainTime = Number((await customPairClient().getBlock({ blockTag: "latest" })).timestamp);
    if (walletParam !== null) {
      const wallet = parseWallet(walletParam);
      if (!wallet) return apiError("invalid_request", "The wallet must be a 0x address.", 400);
      const identities = await readWalletIdentities(vault, wallet);
      const withDetail = await Promise.all(identities.map(async (identity) => ({ identity, ...(await readIdentityDetail(vault, identity)) })));
      return apiOk({ chainId: FORTUNE_NETWORK.chainId, chainTime, vault, wallet, identities: withDetail }, { cacheSeconds: 0 });
    }

    const parsed = canonicalAccount(platformParam || "", accountParam || "");
    if (!parsed.ok) return apiError("invalid_request", parsed.reason, 400);
    const identityId = identityIdOf(parsed.platform.id, parsed.account);
    const identity = await readIdentity(vault, identityId, { platform: parsed.platform.id, account: parsed.account });
    const detail = identity.exists ? await readIdentityDetail(vault, identity) : { balances: [], curves: [], curvesTruncated: false };
    return apiOk({ chainId: FORTUNE_NETWORK.chainId, chainTime, vault, identity, ...detail }, { cacheSeconds: 0 });
  } catch {
    return apiError("dependency_unavailable", "The social fee vault could not be read from BNB Chain right now.", 503);
  }
}
