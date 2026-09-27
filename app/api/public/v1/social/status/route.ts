import { apiError, apiOk } from "@/lib/public-api";
import { SOCIAL_PLATFORMS } from "@/lib/social-fees";
import { readSocialStatus } from "@/lib/social-fees-server";

export const dynamic = "force-dynamic";

/**
 * Whether social fee routing is live on this network: the vault the custom-pair
 * factory uses, the verifier address the vault trusts, and the address of the
 * key this server signs with (never the key). `ready` means both match.
 */
export async function GET() {
  try {
    const status = await readSocialStatus();
    return apiOk(
      {
        ...status,
        platforms: SOCIAL_PLATFORMS.map(({ id, key, label, labelZh, region, prefix, proof, proofExample, pinsAccountId, resolvable }) => ({
          id,
          key,
          label,
          labelZh: labelZh ?? null,
          region,
          prefix,
          proof,
          proofExample,
          pinsAccountId,
          resolvable,
        })),
      },
      { cacheSeconds: 15, staleSeconds: 60 }
    );
  } catch {
    return apiError("dependency_unavailable", "The social fee vault could not be read from BNB Chain right now.", 503);
  }
}
