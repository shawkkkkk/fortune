import { trustedShareArtworkSource } from "@/lib/share-artwork";

export const SHARE_ARTWORK_LIMIT = 1_500_000;
/** Small raster-only artwork; MIME alone must never authorize SVG/HTML decoding. */
export async function readShareArtwork(value: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  const source = trustedShareArtworkSource(value);
  if (!source) return null;
  const controller = new AbortController();
  const started = Date.now();
  let last = started, finished = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let body: ReadableStream<Uint8Array> | null = null;
  const check = () => {
    const now = Date.now();
    if (finished || !Number.isSafeInteger(now) || now < 0 || now < last || now - started >= 3000) throw Error("Artwork read ended");
    last = now;
  };
  // Cancellation is best effort: awaiting it can hang the fallback itself.
  const cancel = () => { try { void (reader ? reader.cancel() : body?.cancel())?.catch(() => {}); } catch {} };
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => { finished = true; resolve(null); controller.abort(); cancel(); }, 3000);
  });
  const work = async () => {
    check();
    const response = await fetcher(source, { signal: controller.signal, redirect: "error" });
    check();
    body = response.body;
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const declared = response.headers.get("content-length");
    if (!response.ok || !["image/png", "image/jpeg"].includes(type) || !response.body
      || (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > SHARE_ARTWORK_LIMIT))) {
      cancel();
      return null;
    }
    reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        check();
        const { done, value: chunk } = await reader!.read();
        check();
        if (done) break;
        length += chunk.byteLength;
        if (length > SHARE_ARTWORK_LIMIT || parts.length >= 4096) { cancel(); return null; }
        parts.push(chunk);
      }
    } finally { reader!.releaseLock(); }
    check();
    const bytes = Buffer.concat(parts, length);
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if ((type === "image/png" && !png) || (type === "image/jpeg" && !jpeg)) return null;
    const result = `data:${type};base64,${bytes.toString("base64")}`;
    check();
    return result;
  };
  try {
    if (!Number.isSafeInteger(started) || started < 0) return null;
    return await Promise.race([work(), deadline]);
  } catch { return null; }
  finally {
    finished = true; clearTimeout(timer!); controller.abort(); cancel();
    try { reader?.releaseLock(); } catch {}
  }
}
