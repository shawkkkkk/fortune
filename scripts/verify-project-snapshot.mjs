// Local production API + real upstream RPC; MCP HTTP-origin rewrite is a fixture.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { PUBLIC_TESTNET } from "../lib/public-testnet.ts";
import { readProjectSnapshot } from "../lib/project-snapshot.ts";
import { createProjectMcp } from "./project-mcp-server.mjs";
const base = new URL(process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.protocol === "http:" && !base.username && !base.password);
const token = PUBLIC_TESTNET.contracts.referenceToken.toLowerCase();
const readSnapshot = t => readProjectSnapshot(t, { fetch: (url, options) => {
  assert.equal(url, `https://fortunepad.fun/api/public/v1/tokens/${token}/project`);
  return fetch(`${base.origin}/api/public/v1/tokens/${token}/project`, options);
} });
const handle = createProjectMcp({ token, readSnapshot });
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, params });
await handle(rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "snapshot-runtime-fixture", version: "1" } }));
await handle({ jsonrpc: "2.0", method: "notifications/initialized" });
const result = await handle(rpc(2, "tools/call", { name: "get_project_snapshot", arguments: {} }));
assert.equal(result.result?.isError, false, "Actual local project API/MCP snapshot read failed");
const snapshot = JSON.parse(result.result.content[0].text);
assert.equal(snapshot.market.provenance.blockHash, snapshot.canon.provenance.blockHash);
assert.equal(snapshot.market.provenance.blockNumber, snapshot.canon.provenance.blockNumber);
assert.equal(snapshot.market.provenance.chainId, 97);
assert.equal(snapshot.market.tradeQuote, null);
if (snapshot.market.phase >= 2) assert.equal(snapshot.market.curveAccounting.referencePriceUsd, null);
const resource = await handle(rpc(3, "resources/read", { uri: `fortune://97/${token}/snapshot` }));
assert.equal(resource.result?.contents.length, 1);
assert.equal((await fetch(`${base.origin}/api/public/v1/tokens/invalid/project`)).status, 400);
mkdirSync(".tmp", { recursive: true });
writeFileSync(".tmp/project-snapshot-runtime.json", JSON.stringify({ kind: "local-api-real-rpc-mcp-transport-fixture", chainId: 97,
  token, blockNumber: snapshot.market.provenance.blockNumber, blockHash: snapshot.market.provenance.blockHash,
  phase: snapshot.market.phase, curvePriceHiddenWhenRetired: true, toolAndResourcePassed: true, writeAuthority: false }, null, 2) + "\n");
console.log("PASS actual local project API / same-block metadata+curve / MCP tool+resource; real upstream RPC, local transport fixture, no write authority");
