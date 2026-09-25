import { createHash } from "node:crypto";
import sharp from "sharp";
import { isAddress, verifyMessage, type Hex } from "viem";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, isIpfsCid, readLimitedBytes, uploadMessage } from "@/lib/creator-metadata";

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function uploadConfigured(env = process.env) {
  return env.FORTUNE_UPLOADS_ENABLED === "true" && Boolean(env.PINATA_JWT && env.UPSTASH_REDIS_REST_TOKEN &&
    /^https:\/\/[a-zA-Z0-9-]+\.upstash\.io\/?$/.test(env.UPSTASH_REDIS_REST_URL || ""));
}

export async function normalizeTokenImage(bytes: Uint8Array, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new UploadError("Choose an image up to 2 MiB.");
  if (!IMAGE_TYPES.includes(declaredType as (typeof IMAGE_TYPES)[number])) throw new UploadError("Choose PNG, JPEG or WebP. SVG and animated images are not accepted.");
  try {
    const input = sharp(bytes, { limitInputPixels: 16_777_216, failOn: "warning" });
    const meta = await input.metadata();
    const expected = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[declaredType];
    if (meta.format !== expected || !meta.width || !meta.height || meta.width !== meta.height || (meta.pages || 1) !== 1) {
      throw new Error("format or dimensions");
    }
    // Fully decode and re-encode, strip EXIF/embedded payloads, and cap pixels.
    return await input.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { throw new UploadError("Image must be a valid, non-animated square PNG, JPEG or WebP, no larger than 4096 × 4096."); }
}

const quotaScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'replay' end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= 10 then return 'limited' end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 250 then return 'limited' end
redis.call('SET', KEYS[1], '1', 'EX', 600)
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 3600)
redis.call('INCR', KEYS[3]); redis.call('EXPIRE', KEYS[3], 86400)
return 'allowed'`;

export async function reserveUpload(address: string, proof: string, fetcher = fetch, now = Date.now()) {
  const response = await fetcher(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", quotaScript, "3", `fortune:upload:proof:${proof}`,
      `fortune:upload:wallet:${address.toLowerCase()}:${Math.floor(now / 3_600_000)}`,
      `fortune:upload:daily:${Math.floor(now / 86_400_000)}`]),
  });
  if (!response.ok) throw new UploadError("Upload protection is unavailable. Try later.", 503);
  const body = await response.json();
  if (body.result === "replay") throw new UploadError("This upload authorization was already used. Sign a new upload request.", 409);
  if (body.result === "limited") throw new UploadError("Image upload limit reached. Try later or use your own public image URI.", 429);
  if (body.result !== "allowed" || body.error) throw new UploadError("Upload protection is unavailable. Try later.", 503);
}

export async function authorizeImageUpload(address: string, digest: string, issuedAt: number, signature: string, origin: string, now = Date.now()) {
  if (!isAddress(address) || !/^[a-f0-9]{64}$/.test(digest) || !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
      !Number.isSafeInteger(issuedAt) || issuedAt > now + 30_000 || now - issuedAt > 300_000) {
    throw new UploadError("Invalid or expired upload authorization.", 403);
  }
  const message = uploadMessage(origin, address, digest, issuedAt);
  const valid = await verifyMessage({ address, message, signature: signature as Hex }).catch(() => false);
  if (!valid) throw new UploadError("Wallet signature does not authorize this image upload.", 403);
  return createHash("sha256").update(message).digest("hex");
}

export async function handleImageUpload(request: Request, fetcher = fetch) {
  if (!uploadConfigured()) throw new UploadError("Image hosting is not connected yet. Use a public image URL or IPFS URI.", 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) throw new UploadError("Upload requests must come from this Fortune site.", 403);
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new UploadError("Upload must use multipart form data.");
  let form: FormData;
  try {
    const bytes = await readLimitedBytes(request, MAX_IMAGE_BYTES + 8192);
    form = await new Response(bytes, { headers: { "content-type": type } }).formData();
  } catch { throw new UploadError("Upload is malformed or exceeds the 2 MiB file limit."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new UploadError("Choose an image file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const address = String(form.get("address") || "");
  const issuedAt = Number(form.get("issuedAt"));
  const proof = await authorizeImageUpload(address, digest, issuedAt, String(form.get("signature") || ""), origin);
  // A distributed atomic quota/replay reservation is mandatory, including on
  // testnet. There is no anonymous upload or in-memory production fallback.
  await reserveUpload(address, proof, fetcher);
  const normalized = await normalizeTokenImage(bytes, file.type);
  const payload = new FormData();
  payload.set("file", new Blob([new Uint8Array(normalized)], { type: "image/webp" }), "fortune-token.webp");
  payload.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const response = await fetcher("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }, body: payload,
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new UploadError("Image storage could not complete the upload. No launch was submitted.", 503);
  const body = JSON.parse(new TextDecoder().decode(await readLimitedBytes(response, 8192)));
  if (typeof body.IpfsHash !== "string" || !isIpfsCid(body.IpfsHash)) throw new UploadError("Image storage returned an invalid content address.", 503);
  const retrieval = await fetcher(`https://gateway.pinata.cloud/ipfs/${body.IpfsHash}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!retrieval.ok) throw new UploadError("The image was pinned but public retrieval is not ready. Retry later; no launch was submitted.", 503);
  const retrieved = await readLimitedBytes(retrieval, MAX_IMAGE_BYTES);
  if (createHash("sha256").update(retrieved).digest("hex") !== createHash("sha256").update(normalized).digest("hex")) {
    throw new UploadError("Public image retrieval did not match the uploaded content. No launch was submitted.", 503);
  }
  return { uri: `ipfs://${body.IpfsHash}`, contentType: "image/webp", bytes: normalized.length,
    sha256: createHash("sha256").update(normalized).digest("hex") };
}
