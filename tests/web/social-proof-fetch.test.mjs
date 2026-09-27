import test from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_PLATFORMS } from "../../lib/social-fees.ts";
import { verifySocialProof } from "../../lib/social-verify.ts";

const code = "fortune-0123456789abcdef01234567";
const request = {
  platform: SOCIAL_PLATFORMS.find((p) => p.key === "github"),
  account: "octocat",
  code,
  wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  proofUrl: "https://gist.github.com/octocat/aa5a315d61ae9438b18d",
};
const gist = JSON.stringify({ owner: { login: "octocat", id: 42 }, description: code });

test("proof fetches forbid redirects and cannot accept redirect or error bodies", async () => {
  for (const status of [302, 404, 429, 500]) {
    const calls = [];
    const outcome = await verifySocialProof(request, {
      env: {},
      fetcher: async (url, init) => {
        calls.push(url);
        assert.equal(init.redirect, "error");
        return new Response(gist, { status, headers: { location: "http://127.0.0.1/proof" } });
      },
    });
    assert.equal(outcome.ok, false, `status ${status}`);
    assert.ok(calls.every((url) => url.startsWith("https://api.github.com/gists/")));
  }
});

test("oversized proof streams are cancelled before their valid-looking tail is consumed", async () => {
  let cancelled = 0;
  let consumedTail = false;
  let attempts = 0;
  const outcome = await verifySocialProof(request, {
    env: {},
    fetcher: async () => {
      attempts++;
      let chunk = 0;
      return new Response(new ReadableStream({
        pull(controller) {
          if (chunk++ < 2) controller.enqueue(new Uint8Array(600_000).fill(32));
          else {
            consumedTail = true;
            controller.enqueue(new TextEncoder().encode(gist));
            controller.close();
          }
        },
        cancel() { cancelled++; },
      }, { highWaterMark: 0 }));
    },
  });
  assert.equal(outcome.code, "SOURCE_UNAVAILABLE");
  assert.equal(attempts, 2);
  assert.equal(cancelled, attempts);
  assert.equal(consumedTail, false);
});

test("streamed UTF-8 proof text survives split multibyte characters", async () => {
  const encoded = new TextEncoder().encode(JSON.stringify({ owner: { login: "octocat", id: 42 }, description: `猫 ${code}` }));
  let offset = 0;
  const outcome = await verifySocialProof(request, {
    env: {},
    fetcher: async () => new Response(new ReadableStream({
      pull(controller) {
        if (offset === encoded.length) controller.close();
        else controller.enqueue(encoded.slice(offset, ++offset));
      },
    })),
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stableRawId, "42");
  assert.equal(outcome.evidence.excerpt, `猫 ${code}`);
});
