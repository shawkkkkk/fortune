import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3217";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3217"], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", data => { log += data; });
server.stderr.on("data", data => { log += data; });
const results = [];
const get = async path => {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30_000) });
  const body = await response.json();
  assert.equal(response.status, 200, path + ": " + JSON.stringify(body));
  return body;
};

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Server exited: " + log);
    try { ready = (await fetch(base + "/api/health")).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "Production server startup timed out.");
  const readinessResponse = await fetch(base + "/api/ready", { signal: AbortSignal.timeout(30_000) });
  writeFileSync("/tmp/fortune-runtime-readiness.json", JSON.stringify(await readinessResponse.json(), null, 2) + "\n");
  const smoke = spawn(process.execPath, ["scripts/release-smoke.mjs"], { stdio: "inherit", env: { ...process.env, FORTUNE_BASE_URL: base, FORTUNE_REQUIRE_ONCHAIN: "true", FORTUNE_REQUIRE_READY: "true" } });
  const [code] = await once(smoke, "exit");
  assert.equal(code, 0, "Production smoke failed.");
  results.push("health, readiness, release, metadata, canonical, sitemap and onchain smoke");

  const first = await get("/api/public/v1/launches?limit=2");
  const tokens = new Set(first.data.items.map(x => x.token.toLowerCase()));
  let cursor = first.data.page.nextCursor;
  while (cursor) {
    const next = await get("/api/public/v1/launches?limit=2&cursor=" + encodeURIComponent(cursor));
    assert.equal(next.meta.blockNumber, first.meta.blockNumber);
    assert.equal(next.meta.blockHash, first.meta.blockHash);
    for (const token of next.data.items) {
      assert(!tokens.has(token.token.toLowerCase()), "Duplicate market in pagination.");
      tokens.add(token.token.toLowerCase());
    }
    cursor = next.data.page.nextCursor;
  }
  assert.equal(tokens.size, first.data.totalOnchain);
  results.push("all " + tokens.size + " factory launches paginated at one block without duplicates");

  if (tokens.size) {
    const token = [...tokens].at(-1);
    const detail = await get("/api/public/v1/tokens/" + token);
    assert.equal(detail.data.token.toLowerCase(), token);
    const page = await fetch(base + "/token/" + token, { signal: AbortSignal.timeout(30_000) });
    assert.equal(page.status, 200);
    assert((await page.text()).includes(detail.data.name));
    results.push("oldest token address resolves through API and rendered token page");
  }
  const badCursor = await fetch(base + "/api/public/v1/launches?cursor=invalid");
  assert.equal(badCursor.status, 400);
  const badHash = await fetch(base + "/api/public/v1/transactions/invalid");
  assert.equal(badHash.status, 400);
  results.push("malformed transaction hashes and cursors return 400");
  writeFileSync("/tmp/fortune-release-runtime-evidence.json", JSON.stringify({ checkedAt: new Date().toISOString(), chainId: first.data.chainId, blockNumber: first.meta.blockNumber, blockHash: first.meta.blockHash, results }, null, 2) + "\n");
  console.log("PASS " + results.join("\nPASS "));
} finally {
  writeFileSync("/tmp/fortune-release-runtime-server.log", log);
  server.kill("SIGTERM");
}
