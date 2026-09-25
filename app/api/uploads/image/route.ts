import { handleImageUpload, UploadError, uploadConfigured } from "@/lib/image-upload";
import { MAX_IMAGE_BYTES, IMAGE_TYPES } from "@/lib/creator-metadata";
import { apiOk, apiError } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
export function GET() {
  return apiOk({ enabled: uploadConfigured(), maxBytes: MAX_IMAGE_BYTES, types: IMAGE_TYPES,
    requiresWalletSignature: true, storage: "IPFS pinning", squareOnly: true });
}
export async function POST(request: Request) {
  try { return apiOk(await handleImageUpload(request)); }
  catch (error) {
    if (error instanceof UploadError) return apiError(error.status === 429 ? "rate_limited" : error.status === 503 ? "dependency_unavailable" : error.status === 403 ? "forbidden" : "invalid_request", error.message, error.status);
    // Never expose provider response bodies, tokens or raw network errors.
    return apiError("dependency_unavailable", "Image upload is unavailable. Your launch has not been submitted.", 503);
  }
}
