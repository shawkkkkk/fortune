import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { SOCIAL_PLATFORMS } from "../../lib/social-fees.ts";
import { verifySocialProof } from "../../lib/social-verify.ts";

const code = "fortune-0123456789abcdef01234567";
const request = { platform: SOCIAL_PLATFORMS.find(p => p.key === "github"), account: "octocat", code,
  wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", proofUrl: "https://gist.github.com/octocat/aa5a315d61ae9438b18d" };
const gist = JSON.stringify({ owner: { login: "octocat", id: 42 }, description: code });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

test("social proof attempt deadline rejects a hung fetch and fences its late body, preserving one retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release, calls = 0, bodies = 0, result, signal;
  const pending = verifySocialProof(request, { env: {}, fetcher: async (_url, init) => {
    calls++; if (calls === 2) return new Response(gist);
    signal = init.signal; return new Promise(r => release = r);
  } }).then(x => result = x);
  try {
    t.mock.timers.tick(7999); await flush(); assert.equal(result, undefined);
    t.mock.timers.tick(1); await flush(); assert.equal(signal.aborted, true);
    t.mock.timers.tick(300); await flush(); assert.equal(calls, 2); assert.equal(result?.ok, true);
  } finally { release({ get body() { bodies++; throw Error("late body"); } }); await flush(); }
  await pending; assert.equal(bodies, 0);
});

test("social proof fences a late stream and never waits for hung cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release, reads = 0, cancels = 0, calls = 0, result;
  const reader = { read() { reads++; return new Promise(r => release = r); }, cancel() { cancels++; return new Promise(() => {}); }, releaseLock() {} };
  const pending = verifySocialProof(request, { env: {}, fetcher: async () => ++calls === 1
    ? { ok: true, status: 200, body: { getReader: () => reader } } : new Response("", { status: 503 }) }).then(x => result = x);
  await flush(); assert.equal(reads, 1);
  try {
    t.mock.timers.tick(8000); await flush(); t.mock.timers.tick(300); await flush();
    assert.equal(result?.code, "SOURCE_UNAVAILABLE"); assert.equal(calls, 2);
  } finally { release({ done: false, value: new TextEncoder().encode(gist) }); await flush(); }
  await pending; assert.equal(reads, 1); assert.ok(cancels > 0);
});

test("error response cancellation cannot hold social verification open", async () => {
  let cancels = 0;
  const pending = verifySocialProof(request, { env: {}, fetcher: async () => ({ ok: false, status: 404,
    body: { cancel() { cancels++; return new Promise(() => {}); } } }) });
  const result = await Promise.race([pending, new Promise(r => { const timer = setTimeout(() => r("hung"), 100); timer.unref(); })]);
  assert.equal(result.code, "PROOF_NOT_FOUND"); assert.equal(cancels, 1);
});

test("social proof rejects a clock rollback before consuming response evidence", async t => {
  let clock = 100000, calls = 0;
  t.mock.method(Date, "now", () => clock);
  const result = await verifySocialProof(request, { env: {}, fetcher: async () => {
    calls++; clock -= 1; return new Response(gist);
  } });
  assert.equal(result.code, "SOURCE_UNAVAILABLE"); assert.equal(calls, 2);
});

test("social proof real eight-second attempt timer survives noncooperating fetch", { timeout: 12000 }, async () => {
  let release, calls = 0, bodies = 0;
  const started = performance.now();
  const result = await verifySocialProof(request, { env: {}, fetcher: async () => ++calls === 1
    ? new Promise(r => release = r) : new Response("", { status: 503 }) });
  assert.ok(performance.now() - started >= 7900); assert.equal(result.code, "SOURCE_UNAVAILABLE");
  release({ get body() { bodies++; throw Error("late"); } }); await flush(); assert.equal(bodies, 0);
});

test("actual HTTP gist body reaches the existing social ownership projection", async () => {
  const server = createServer((req, res) => {
    assert.equal(req.url, "/github/gists/aa5a315d61ae9438b18d");
    res.writeHead(200, { "content-type": "application/json" }); res.end(gist);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const result = await verifySocialProof(request, { env: { FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN: `http://127.0.0.1:${server.address().port}` } });
    assert.equal(result.ok, true); assert.equal(result.stableRawId, "42"); assert.equal(result.evidence.excerpt, code);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
