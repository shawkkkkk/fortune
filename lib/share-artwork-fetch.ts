import { trustedShareArtworkSource } from "@/lib/share-artwork";

export const SHARE_ARTWORK_LIMIT = 1_500_000;
/** Small raster-only artwork; MIME alone must never authorize SVG/HTML decoding. */
export async function readShareArtwork(value: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  const source = trustedShareArtworkSource(value);
  if (!source) return null;
  try {
    const response = await fetcher(source, { signal: AbortSignal.timeout(3_000), redirect: "error" });
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const declared = response.headers.get("content-length");
    if (!response.ok || !["image/png", "image/jpeg"].includes(type) || !response.body
      || (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > SHARE_ARTWORK_LIMIT))) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.byteLength;
        if (length > SHARE_ARTWORK_LIMIT || parts.length >= 4096) { await reader.cancel(); return null; }
        parts.push(chunk);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(parts, length);
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if ((type === "image/png" && !png) || (type === "image/jpeg" && !jpeg)) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch { return null; }
}
