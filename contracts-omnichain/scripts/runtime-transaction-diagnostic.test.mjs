import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createPublicClient, http } from "viem";
import { inspectLocalDeploymentFailure } from "./runtime-transaction-diagnostic.mjs";

const hash = "0x" + "ab".repeat(32), sender = "0x" + "11".repeat(20);
const tx = { hash, from: sender, to: null, nonce: "0x1", gas: "0x186a0", gasPrice: "0x1", blockNumber: null };
const block = { number: "0x3", gasLimit: "0x1c9c380", timestamp: "0x123", baseFeePerGas: "0x0" };
const fixture = (transform = (method, value) => value) => ({
  calls: [], request({ method, params }, options) {
    this.calls.push({ method, params, options });
    const value = method === "eth_getTransactionByHash" ? tx : method === "eth_getBlockByNumber" ? block
      : method === "eth_getTransactionCount" ? "0x0" : { pending: "0x0", queued: "0x1" };
    return transform(method, value);
  },
});

test("only five explicit reads; strict byte binding and whitelisted output", async () => {
  const rpc = fixture((method, value) => typeof value === "object" ? { ...value, private: "secret-provider-payload", input: "private-calldata", url: "https://private.invalid" } : value);
  const result = await inspectLocalDeploymentFailure(rpc, hash, sender);
  assert.equal(rpc.calls.length, 5);
  assert.deepEqual(rpc.calls.map(x => x.method), ["eth_getTransactionByHash", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_getTransactionCount", "txpool_status"]);
  for (const call of rpc.calls) assert.deepEqual(call.options, { retryCount: 0 });
  assert.equal(result.transaction.status, "pending"); assert.equal(result.transaction.nonce, "0x1");
  assert.equal(result.latestBlock.baseFeePerGas, "0x0"); assert.equal(result.transactionPool.queued, "0x1");
  assert.equal(result.failureCauseEstablished, false); assert.equal(result.publicBroadcasts, false);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|calldata|https|abab|1111/);
});

test("missing/mined deployments, absent legacy base fee and independent read failures", async () => {
  const missing = await inspectLocalDeploymentFailure(fixture((m, v) => m === "eth_getTransactionByHash" ? null : m === "txpool_status" ? Promise.reject(Error("private URL secret")) : v), hash, sender);
  assert.equal(missing.transaction.status, "not-found"); assert.deepEqual(missing.transactionPool, { status: "unavailable" });
  const mined = await inspectLocalDeploymentFailure(fixture((m, v) => m === "eth_getTransactionByHash" ? { ...v, blockNumber: "0x4" }
    : m === "eth_getBlockByNumber" ? { ...v, baseFeePerGas: undefined } : v), hash, sender);
  assert.equal(mined.transaction.status, "mined"); assert.equal(mined.transaction.blockNumber, "0x4"); assert.equal(mined.latestBlock.baseFeePerGas, null);
  assert.doesNotMatch(JSON.stringify(missing), /private|secret|URL/);
});

test("foreign identities, nondeployment targets and malformed/oversized quantities are discarded", async () => {
  for (const patch of [{ hash: "0x" + "cd".repeat(32) }, { from: "0x" + "22".repeat(20) }, { to: sender },
    { nonce: "0x00" }, { gas: "0x" + "1".repeat(65) }, { blockNumber: undefined }, { maxFeePerGas: -1 }, { gasPrice: "0xA" }]) {
    const r = await inspectLocalDeploymentFailure(fixture((m, v) => m === "eth_getTransactionByHash" ? { ...v, ...patch } : v), hash, sender);
    assert.deepEqual(r.transaction, { status: "invalid" });
  }
  const bad = await inspectLocalDeploymentFailure(fixture(() => ({ status: "pretend", injected: "secret" })), hash, sender);
  assert.deepEqual(bad.latestBlock, { status: "invalid" }); assert.deepEqual(bad.transactionPool, { status: "invalid" });
});

test("invalid input binds no reads", async () => {
  const rpc = fixture();
  await assert.rejects(inspectLocalDeploymentFailure(rpc, "0x1", sender));
  await assert.rejects(inspectLocalDeploymentFailure(rpc, hash, "0x1"));
  assert.equal(rpc.calls.length, 0);
});

test("real three-second global deadline; late completion cannot mutate returned output", async () => {
  let release;
  const rpc = fixture((method, value) => method === "eth_getTransactionByHash" ? new Promise(resolve => { release = () => resolve(value); }) : value);
  const start = performance.now(), result = await inspectLocalDeploymentFailure(rpc, hash, sender);
  assert.ok(performance.now() - start >= 2_900); assert.ok(performance.now() - start < 5_000);
  assert.equal(result.transaction.status, "deadline"); assert.equal(result.latestBlock.status, "observed");
  const before = JSON.stringify(result); release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(result), before); assert.equal(rpc.calls.length, 5);
});

test("actual zero-account Anvil: observe pending without mining, then separately mined deployment", async () => {
  const binary = process.env.FORTUNE_ANVIL_BIN;
  assert.ok(binary, "Pinned local Anvil is required for this dedicated test; no success fallback");
  const lease = createServer(); lease.listen(0, "127.0.0.1"); await once(lease, "listening");
  const port = lease.address().port; await new Promise(resolve => lease.close(resolve));
  const node = spawn(binary, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "97", "--accounts", "0", "--quiet"], { stdio: "ignore" });
  let startError = false; node.on("error", () => { startError = true; });
  const rpc = createPublicClient({ transport: http(`http://127.0.0.1:${port}`, { timeout: 1000, retryCount: 0 }) });
  try {
    const deadline = Date.now() + 10_000; let ready = false;
    while (Date.now() < deadline && !startError && node.exitCode === null) {
      try { if (await rpc.getChainId() === 97) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready); assert.deepEqual(await rpc.request({ method: "eth_accounts" }), []);
    await rpc.request({ method: "anvil_impersonateAccount", params: [sender] });
    await rpc.request({ method: "anvil_setBalance", params: [sender, "0x56bc75e2d63100000"] });
    await rpc.request({ method: "evm_setAutomine", params: [false] });
    const sent = await rpc.request({ method: "eth_sendTransaction", params: [{ from: sender, data: "0x60006000f3", gas: "0x186a0" }] });
    const before = await rpc.getBlockNumber({ cacheTime: 0 });
    const pending = await inspectLocalDeploymentFailure(rpc, sent, sender);
    assert.equal(pending.transaction.status, "pending"); assert.equal(pending.latestNonce.value, "0x0"); assert.equal(pending.pendingNonce.value, "0x1");
    assert.equal(await rpc.getBlockNumber({ cacheTime: 0 }), before); await assert.rejects(rpc.getTransactionReceipt({ hash: sent }));
    // Explicit test-only mining happens AFTER the read-only diagnostic returned.
    await rpc.request({ method: "evm_mine" });
    const receipt = await rpc.getTransactionReceipt({ hash: sent }); assert.equal(receipt.status, "success"); assert.ok(receipt.contractAddress);
    const mined = await inspectLocalDeploymentFailure(rpc, sent, sender); assert.equal(mined.transaction.status, "mined"); assert.equal(mined.latestNonce.value, "0x1");
    assert.equal(mined.failureCauseEstablished, false);
    assert.deepEqual(await rpc.request({ method: "eth_accounts" }), [sender]); // VM impersonation, not generated keys.
    await rpc.request({ method: "anvil_stopImpersonatingAccount", params: [sender] });
    assert.deepEqual(await rpc.request({ method: "eth_accounts" }), []);
  } finally {
    if (node.exitCode === null) {
      node.kill("SIGTERM"); const force = setTimeout(() => node.kill("SIGKILL"), 3000);
      await once(node, "exit").catch(() => {}); clearTimeout(force);
    }
  }
});
