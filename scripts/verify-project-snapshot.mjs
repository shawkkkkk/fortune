// Local production API + real upstream RPC; MCP HTTP-origin rewrite is a fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { PUBLIC_TESTNET } from "../lib/public-testnet.ts";
import { readProjectSnapshot } from "../lib/project-snapshot.ts";
import { createProjectMcp } from "./project-mcp-server.mjs";
import { inspectProjectDataExport } from "../lib/project-export-inspector.ts";
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
const download = await fetch(`${base.origin}/api/public/v1/tokens/${token}/project/export`, { signal: AbortSignal.timeout(30000) });
assert.equal(download.status, 200);
assert.equal(download.headers.get('cache-control'), 'no-store');
assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
assert.equal(download.headers.get('content-disposition'), `attachment; filename="fortune-project-${token}.json"`);
const exported = await download.json();
assert.equal(exported.sha256, createHash('sha256').update(exported.payloadUtf8, 'utf8').digest('hex'));
const exportedPayload = JSON.parse(exported.payloadUtf8);
assert.equal(exportedPayload.market.provenance.token, token);
assert.equal(exportedPayload.market.provenance.chainId, 97);
assert.equal(exportedPayload.market.tradeQuote, null);
assert.equal(exportedPayload.treasuryBalance, null);
assert.equal(Object.hasOwn(exportedPayload, 'canon'), false);
assert.equal(exported.sourceAuthenticated, false);
assert.equal(exported.executionAuthorized, false);
const inspected = inspectProjectDataExport(exported, token);
assert.deepEqual(inspected.market, exportedPayload.market);
assert.equal(inspected.checksumMatches, true);
assert.equal(inspected.storedApiTimestamp, exportedPayload.apiTimestamp);
for (const key of ['sourceAuthenticated','independentRpcVerified','finalityVerified','currentCanonicalityVerified','executionAuthorized','fullApiReadiness']) assert.equal(inspected[key], false);
assert.equal(inspected.currentAuthorization, null);
console.log('PASS actual downloaded project export through typed inspector; checksum is not authentication or current authority');
// Separate reads may legitimately observe different blocks; do not claim equality.
assert.equal((await fetch(`${base.origin}/api/public/v1/tokens/invalid/project/export`, { signal: AbortSignal.timeout(30000) })).status, 400);
assert.equal((await fetch(`${base.origin}/api/public/v1/tokens/0x1111111111111111111111111111111111111111/project/export`, { signal: AbortSignal.timeout(30000) })).status, 404);
console.log('PASS actual project JSON attachment / SHA-256 / exact typed values / public provenance / unknowns / error statuses; digest is not source authentication');
mkdirSync(".tmp", { recursive: true });
writeFileSync(".tmp/project-snapshot-runtime.json", JSON.stringify({ kind: "local-api-real-rpc-mcp-transport-fixture", chainId: 97,
  token, blockNumber: snapshot.market.provenance.blockNumber, blockHash: snapshot.market.provenance.blockHash,
  exportBlockNumber: exportedPayload.market.provenance.blockNumber, exportBlockHash: exportedPayload.market.provenance.blockHash, exportSha256: exported.sha256, exportPassed: true, exportInspectorPassed: true, sourceAuthenticated: false,
  phase: snapshot.market.phase, curvePriceHiddenWhenRetired: true, toolAndResourcePassed: true, writeAuthority: false }, null, 2) + "\n");
console.log("PASS actual local project API / same-block metadata+curve / MCP tool+resource; real upstream RPC, local transport fixture, no write authority");
