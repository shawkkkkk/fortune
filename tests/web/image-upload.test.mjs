import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { uploadMessage } from "../../lib/creator-metadata.ts";
import { authorizeImageUpload, normalizeTokenImage, reserveUpload, handleImageUpload, uploadConfigured } from "../../lib/image-upload.ts";

// Ephemeral signing-only test accounts. No RPC, deployment key or funds.
const account = privateKeyToAccount(generatePrivateKey());
const origin = "https://fortune.example.com";
const digest = "a".repeat(64);
const cid = "bafy" + "a".repeat(55);

test("image normalization fully decodes, strips metadata and returns bounded WebP", async () => {
  const input = await sharp({ create: { width: 32, height: 32, channels: 4, background: "red" } }).png().toBuffer();
  const bytes = await normalizeTokenImage(input, "image/png");
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "webp"); assert.equal(meta.width, 32); assert.equal(meta.exif, undefined);
  await assert.rejects(normalizeTokenImage(input, "image/jpeg"), /valid/);
  await assert.rejects(normalizeTokenImage(new Uint8Array([1, 2, 3]), "image/png"), /valid/);
  await assert.rejects(normalizeTokenImage(new Uint8Array(2 * 1024 * 1024 + 1), "image/png"), /2 MiB/);
  const wide = await sharp({ create: { width: 32, height: 16, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(normalizeTokenImage(wide, "image/png"), /square/);
  await assert.rejects(normalizeTokenImage(input, "image/svg+xml"), /SVG/);
});

test("upload signature is bound to origin, wallet, exact bytes and a five-minute expiry", async () => {
  const now = Date.now();
  const signature = await account.signMessage({ message: uploadMessage(origin, account.address, digest, now) });
  assert.match(await authorizeImageUpload(account.address, digest, now, signature, origin, now), /^[a-f0-9]{64}$/);
  await assert.rejects(authorizeImageUpload(account.address, digest, now, signature, "https://evil.example.com", now), /signature/);
  await assert.rejects(authorizeImageUpload(account.address, "b".repeat(64), now, signature, origin, now), /signature/);
  await assert.rejects(authorizeImageUpload(account.address, digest, now, signature, origin, now + 300_001), /expired/);
  await assert.rejects(authorizeImageUpload(account.address, digest, now, signature, origin, now - 30_001), /expired/);
});

test("distributed upload protection rejects replay, rate limits and provider failures", async () => {
  const response = (result) => async () => Response.json({ result });
  await reserveUpload(account.address, "proof", response("allowed"));
  await assert.rejects(reserveUpload(account.address, "proof", response("replay")), (e) => e.status === 409);
  await assert.rejects(reserveUpload(account.address, "proof", response("limited")), (e) => e.status === 429);
  await assert.rejects(reserveUpload(account.address, "proof", response(undefined)), (e) => e.status === 503);
  await assert.rejects(reserveUpload(account.address, "proof", async () => new Response("", { status: 503 })), (e) => e.status === 503);
});

test("uploads remain disabled unless storage and distributed protection are configured", () => {
  assert.equal(uploadConfigured({}), false);
  assert.equal(uploadConfigured({ FORTUNE_UPLOADS_ENABLED: "true", PINATA_JWT: "fixture" }), false);
  assert.equal(uploadConfigured({ FORTUNE_UPLOADS_ENABLED: "true", PINATA_JWT: "fixture", UPSTASH_REDIS_REST_TOKEN: "fixture", UPSTASH_REDIS_REST_URL: "http://localhost" }), false);
});

test("full upload binds signed file, normalizes, pins and verifies public retrieval without exposing credentials", async () => {
  const keys = ["FORTUNE_UPLOADS_ENABLED", "PINATA_JWT", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { FORTUNE_UPLOADS_ENABLED: "true", PINATA_JWT: "test-placeholder", UPSTASH_REDIS_REST_TOKEN: "test-placeholder", UPSTASH_REDIS_REST_URL: "https://test.upstash.io" });
  try {
    const input = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
    const issuedAt = Date.now();
    const hash = createHash("sha256").update(input).digest("hex");
    const signature = await account.signMessage({ message: uploadMessage(origin, account.address, hash, issuedAt) });
    const form = new FormData(); form.set("file", new File([input], "cat.png", { type: "image/png" }));
    form.set("address", account.address); form.set("issuedAt", String(issuedAt)); form.set("signature", signature);
    let pinned;
    const fetcher = async (url, options) => {
      if (url.includes("upstash.io")) { assert.equal(JSON.parse(options.body)[0], "EVAL"); return Response.json({ result: "allowed" }); }
      if (url.includes("pinFileToIPFS")) { pinned = new Uint8Array(await options.body.get("file").arrayBuffer()); return Response.json({ IpfsHash: cid }); }
      assert.equal(url, `https://gateway.pinata.cloud/ipfs/${cid}`); return new Response(pinned);
    };
    const result = await handleImageUpload(new Request(origin + "/api/uploads/image", { method: "POST", headers: { origin }, body: form }), fetcher);
    assert.equal(result.uri, `ipfs://${cid}`); assert.equal(result.contentType, "image/webp");
    assert.equal(JSON.stringify(result).includes("test-placeholder"), false);
    await assert.rejects(handleImageUpload(new Request(origin + "/api/uploads/image", { method: "POST", headers: { origin: "https://other.example.com" }, body: form }), fetcher), (e) => e.status === 403);
    await assert.rejects(handleImageUpload(new Request(origin + "/api/uploads/image", { method: "POST", headers: { origin }, body: form }), async (url, options) => url.includes("gateway.pinata.cloud") ? new Response("wrong bytes") : fetcher(url, options)), /did not match/);
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
