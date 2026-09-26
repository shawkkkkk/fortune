import { publicMetadataUrl } from "@/lib/creator-metadata";

/**
 * OG images are rendered server-side, so never fetch a creator-controlled web
 * host from the renderer. A syntactically public hostname can still resolve to
 * a private address or change answers between validation and fetch. IPFS URIs
 * are validated and then fetched only through Fortune's fixed gateway.
 */
export function trustedShareArtworkSource(value: string | null) {
  if (!value?.startsWith("ipfs://")) return null;
  try {
    const uri = publicMetadataUrl("Image", value, true);
    return uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : null;
  } catch {
    return null;
  }
}
