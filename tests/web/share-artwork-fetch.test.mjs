import test from "node:test";
import assert from "node:assert/strict";
import { readShareArtwork, SHARE_ARTWORK_LIMIT } from "../../lib/share-artwork-fetch.ts";
const uri = "ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiRAom3ZYKhYbG7XdCLnGx/art.png";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const jpeg = Uint8Array.from([255, 216, 255, 224, 1]);

test("share artwork fetch preserves fixed gateway, deadline and redirect refusal for raster content", async () => {
  for (const [type, bytes] of [["image/png", png], ["image/jpeg", jpeg]]) {
    const data = await readShareArtwork(uri, async (url, init) => {
      assert.equal(url, "https://ipfs.io/ipfs/" + uri.slice(7));
      assert.equal(init.redirect, "error"); assert.ok(init.signal);
      return new Response(bytes, { headers: { "content-type": type } });
    });
    assert.equal(data, `data:${type};base64,${Buffer.from(bytes).toString("base64")}`);
  }
});
test("SVG/HTML spoofed as PNG or JPEG and mismatched raster MIME are rejected", async () => {
  for (const type of ["image/png", "image/jpeg"]) for (const body of ["<svg><text>untrusted</text></svg>", "<!doctype html><body>untrusted</body>", ""]) {
    assert.equal(await readShareArtwork(uri, async () => new Response(body, { headers: { "content-type": type } })), null);
  }
  assert.equal(await readShareArtwork(uri, async () => new Response(jpeg, { headers: { "content-type": "image/png" } })), null);
});
test("advertised oversize and unsupported bodies are cancelled before reading", async () => {
  for (const headers of [{ "content-type": "image/svg+xml" }, { "content-type": "image/png", "content-length": String(SHARE_ARTWORK_LIMIT + 1) }, { "content-type": "image/png", "content-length": "bad" }]) {
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers });
    assert.equal(await readShareArtwork(uri, async () => response), null); assert.equal(cancelled, true);
  }
});
test("unadvertised or lying streams stop and cancel as soon as the byte budget is exceeded", async () => {
  for (const declared of [undefined, "1"]) {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(SHARE_ARTWORK_LIMIT + 1)); }, cancel() { cancelled = true; } }), {
      headers: { "content-type": "image/png", ...(declared ? { "content-length": declared } : {}) },
    });
    assert.equal(await readShareArtwork(uri, async () => response), null); assert.equal(cancelled, true);
  }
});
test("untrusted origins never fetch; failed status, redirect errors and stream errors use the fallback", async () => {
  for (const input of [null, "https://example.com/evil.png", "ipfs://invalid"]) assert.equal(await readShareArtwork(input, async () => { throw new Error("must not fetch"); }), null);
  assert.equal(await readShareArtwork(uri, async () => new Response(png, { status: 404, headers: { "content-type": "image/png" } })), null);
  assert.equal(await readShareArtwork(uri, async () => { throw new Error("redirect refused"); }), null);
  assert.equal(await readShareArtwork(uri, async () => new Response(new ReadableStream({ start(c) { c.error(new Error("stream failed")); } }), { headers: { "content-type": "image/png" } })), null);
});
test("empty-chunk floods cannot build an unbounded chunk list", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(0)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "image/png" } });
  assert.equal(await readShareArtwork(uri, async () => response), null); assert.equal(cancelled, true);
});
