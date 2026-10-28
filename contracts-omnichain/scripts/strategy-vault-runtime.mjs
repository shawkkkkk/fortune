// End-to-end local fork only. Zero generated accounts, VM impersonation, no keys or public broadcasts.
import assert from "node:assert/strict";
import { revalidateFillBatch } from "../../scripts/revalidate-arbitrage-fills.mjs";
import { runtimeFailureKind } from "./runtime-failure.mjs";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { fillMarketHash, readVerifiedFill } from "../../lib/arbitrage-receipts.ts";
import { ArbitrageFillJournal } from "../../scripts/arbitrage-fill-journal.mjs";
import { ReceiptObservationQueue, observeNextReceipt } from "../../scripts/arbitrage-observer-queue.mjs";
import { StrategyNativeGasBudget } from "../../scripts/strategy-native-gas-budget.mjs";
import { reconcileBudgetedReceipt } from "../../scripts/reconcile-budgeted-receipt.mjs";

const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const POSITIONS = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const GOV = "0x0000000000000000000000000000000000001111";
const GUARDIAN = "0x0000000000000000000000000000000000002222";
const TREASURY = "0x0000000000000000000000000000000000003333";
const AGENT = "0x0000000000000000000000000000000000004444";
const E18 = 10n ** 18n, Q96 = 1n << 96n;
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`, import.meta.url), "utf8"));
let node, journal, queue, book, fixtureBlock, stage = "initialization";
const folder = mkdtempSync(join(tmpdir(), "fortune-strategy-runtime-"));
// A failed repeat must not leave an old passing artifact available to CI.
rmSync(resolve(".tmp/strategy-runtime.json"), { force: true });
try {
  const binary = process.env.FORTUNE_ANVIL_BIN;
  if (!binary) throw Error("Pinned Anvil binary required");
  const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0); assert.match(version.stdout, /Version: 1\.7\.1/);
  const fork = new URL(process.env.FORTUNE_STRATEGY_FORK_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org");
  // This fixture only accepts credential-free public read URLs; never put credentials in process arguments.
  assert.ok(fork.protocol === "https:" && !fork.username && !fork.password && !fork.search && !fork.hash && fork.pathname === "/");
  stage = "read-only fork chain identity";
  // Do not let --chain-id mask an accidentally supplied mainnet/wrong-network fork source.
  const source = createPublicClient({ transport: http(fork.href, { timeout: 15_000, retryCount: 0 }) });
  assert.equal(await source.getChainId(), 97, "fork source must itself be BSC Testnet");
  const lease = createServer(); lease.listen(0, "127.0.0.1"); await once(lease, "listening");
  const port = lease.address().port; await new Promise(r => lease.close(r));
  const args = ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "97", "--accounts", "0", "--quiet", "--fork-url", fork.href];
  if (process.env.FORTUNE_STRATEGY_FORK_BLOCK) { assert.match(process.env.FORTUNE_STRATEGY_FORK_BLOCK, /^[1-9][0-9]*$/); args.push("--fork-block-number", process.env.FORTUNE_STRATEGY_FORK_BLOCK); }
  stage = "local fork startup";
  node = spawn(binary, args, { stdio: "ignore" }); let startError = false; node.on("error", () => { startError = true; });
  const url = `http://127.0.0.1:${port}`;
  const transport = () => http(url, { timeout: 8_000, retryCount: 0 });
  const rpc = createPublicClient({ transport: transport(), chain: bscTestnet });
  let ready = false;
  const startupDeadline = Date.now() + 60_000;
  while (Date.now() < startupDeadline) {
    try { if (await rpc.getChainId() === 97) { ready = true; break; } } catch {}
    if (startError || node.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready);
  const forkBlock = await rpc.getBlockNumber({ cacheTime: 0 }); fixtureBlock = forkBlock.toString();
  assert.deepEqual(await rpc.request({ method: "eth_accounts" }), [], "Anvil generated no wallet accounts or keys");
  stage = "local VM account provisioning";
  for (const who of [GOV, AGENT, GUARDIAN]) {
    await rpc.request({ method: "anvil_impersonateAccount", params: [who] });
    await rpc.request({ method: "anvil_setBalance", params: [who, toHex(10_000n * E18)] });
  }
  // Every writable client is constructed with the fresh loopback URL, never the fork source URL.
  const wallet = who => createWalletClient({ account: who, chain: bscTestnet, transport: transport() });
  const receipt = hash => rpc.waitForTransactionReceipt({ hash, pollingInterval: 25, timeout: 30_000 });
  const deploy = async (item, params = []) => {
    stage = "local contract deployment";
    const r = await receipt(await wallet(GOV).deployContract({ abi: item.abi, bytecode: item.bytecode.object, args: params, gas: 10_000_000n }));
    assert.equal(r.status, "success"); assert.ok(r.contractAddress); return r.contractAddress;
  };
  const write = async (who, address, abi, functionName, params = [], succeeds = true) => {
    stage = "local contract call: " + functionName;
    const r = await receipt(await wallet(who).writeContract({ address, abi, functionName, args: params, gas: 10_000_000n }));
    assert.equal(r.status, succeeds ? "success" : "reverted"); return r;
  };
  const read = (address, abi, functionName, params = []) => rpc.readContract({ address, abi, functionName, args: params });
  const pin = async address => ({ address, codeHash: keccak256(await rpc.getCode({ address })) });
  stage = "synthetic assets and real venue pool";
  const asset = artifact("FortuneTestnetStrategyVault.t.sol", "StrategyAssetMock");
  const vaultArtifact = artifact("FortuneTestnetStrategyVault.sol", "FortuneTestnetStrategyVault");
  const positions = artifact("FortuneTestnetStrategyVaultFork.t.sol", "IStrategyPositionManager").abi;
  const a = await deploy(asset), b = await deploy(asset);
  for (const token of [a, b]) {
    await write(GOV, token, asset.abi, "mint", [GOV, 30_000n * E18]);
    await write(GOV, token, asset.abi, "approve", [POSITIONS, 10_000n * E18]);
  }
  const [token0, token1] = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
  await write(GOV, POSITIONS, positions, "createAndInitializePoolIfNecessary", [token0, token1, 500, Q96]);
  const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns(address)"]);
  const pool = await read(FACTORY, factoryAbi, "getPool", [a, b, 500]);
  await write(GOV, POSITIONS, positions, "mint", [{ token0, token1, fee: 500, tickLower: -887270, tickUpper: 887270,
    amount0Desired: 10_000n * E18, amount1Desired: 10_000n * E18, amount0Min: 9900n * E18, amount1Min: 9900n * E18,
    recipient: GOV, deadline: (await rpc.getBlock()).timestamp + 120n }]);
  stage = "vault configuration";
  const rp = await pin(ROUTER), fp = await pin(FACTORY), pp = await pin(pool), ap = await pin(a), bp = await pin(b);
  const vault = await deploy(vaultArtifact, [GOV, GUARDIAN, TREASURY,
    { router: ROUTER, factory: FACTORY, pool, routerHash: rp.codeHash, factoryHash: fp.codeHash, poolHash: pp.codeHash, fee: 500 },
    { ...ap, token: a, maxPerTrade: 100n * E18, maxPerWindow: 1000n * E18, reserveFloor: 100n * E18 },
    { ...bp, token: b, maxPerTrade: 100n * E18, maxPerWindow: 1000n * E18, reserveFloor: 100n * E18 }]);
  for (const token of [a, b]) await write(GOV, token, asset.abi, "mint", [vault, 1000n * E18]);
  await write(GOV, vault, vaultArtifact.abi, "setOperator", [AGENT]);
  await write(GOV, vault, vaultArtifact.abi, "setPricingFloor", [Q96 * 99n / 100n, Q96 * 99n / 100n, (await rpc.getBlock()).timestamp + 3600n]);
  await write(GOV, vault, vaultArtifact.abi, "unpause");
  const order = async (tokenIn, amountIn, minAmountOut = 0n) => ({ tokenIn, amountIn, minAmountOut, deadline: (await rpc.getBlock()).timestamp + 60n,
    epoch: await read(vault, vaultArtifact.abi, "authorizationEpoch"), nonce: await read(vault, vaultArtifact.abi, "nextNonce") });
  stage = "bounded swap transactions";
  const beforeSwaps = await rpc.request({ method: "evm_snapshot" });
  const first = await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(a, 10n * E18)]);
  const second = await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(b, 5n * E18)]);
  assert.equal(await read(a, asset.abi, "allowance", [vault, ROUTER]), 0n); assert.equal(await read(b, asset.abi, "allowance", [vault, ROUTER]), 0n);
  await rpc.request({ method: "anvil_mine", params: ["0x14"] });
  const market = { chainId: 97, wallet: vault, router: rp, factory: fp, pool: pp,
    token: { ...ap, decimals: 18 }, settlement: { ...bp, decimals: 18 }, fee: 500, confirmations: 20, eventKind: "pancake-v3",
    vault: { codeHash: (await pin(vault)).codeHash, operator: AGENT } };
  const readers = [createPublicClient({ transport: transport() }), createPublicClient({ transport: transport() })];
  stage = "receipt verification and durable journal";
  journal = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market);
  queue = new ReceiptObservationQueue(join(folder, "jobs.sqlite"), market);
  // Fixture-only accounting limits, not signer limits or a proposed production policy.
  const gasPolicy = { chainId: 97, fundingScope: "strategy-native-gas", payer: AGENT,
    marketHashes: [fillMarketHash(market)], perTransactionWei: E18.toString(), rollingDayWei: (2n * E18).toString() };
  const bookPath = join(folder, "gas.sqlite");
  book = new StrategyNativeGasBudget(bookPath, gasPolicy);
  const charges = () => {
    const db = new DatabaseSync(bookPath, { readOnly: true });
    try { return db.prepare("SELECT tx,cost,charged_at,evidence FROM gas_entries ORDER BY tx").all(); }
    finally { db.close(); }
  };
  for (const r of [first, second]) assert.equal(book.reserve(r.transactionHash, E18.toString()).inserted, true);
  assert.equal(book.status().reservedWei, (2n * E18).toString());
  let heldRpcCalls = 0, journalCommitsWhileHeld = 0;
  // Forward every real client action unchanged; inspect the committed SQLite hold
  // before that action can reach Anvil. This is still one local fixture, not two providers.
  const heldReaders = readers.map(client => new Proxy(client, { get(target, key) {
    const action = Reflect.get(target, key);
    if (typeof action !== "function") return action;
    return (...args) => {
      const status = book.status();
      assert.equal(status.pendingRechecks, 1); assert.equal(status.blocked, true);
      const persisted = new StrategyNativeGasBudget(bookPath, gasPolicy, Date.now, { readOnly: true });
      try { assert.equal(persisted.status().pendingRechecks, 1); assert.equal(persisted.status().blocked, true); }
      finally { persisted.close(); }
      assert.throws(() => book.reserve("0x" + "ab".repeat(32), "1"));
      heldRpcCalls++;
      return action(...args);
    };
  } }));
  const heldJournal = { marketHash: journal.marketHash,
    record(fill) {
      const result = journal.record(fill);
      const reopened = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market, { readOnly: true });
      try { assert.ok(reopened.list().some(row => row.fill.receiptId === fill.receiptId && row.state === "observed")); }
      finally { reopened.close(); }
      assert.equal(book.status().pendingRechecks, 1); assert.equal(book.status().blocked, true);
      journalCommitsWhileHeld++;
      return result;
    },
    quarantineKnown(tx) { return journal.quarantineKnown(tx); }
  };
  for (const r of [first, second]) {
    const verified = await readVerifiedFill(readers, market, r.transactionHash);
    assert.equal(verified.nativeGasCost, (r.gasUsed * r.effectiveGasPrice).toString());
    stage = "budget hold, local RPC receipt and journal-before-charge";
    assert.equal((await reconcileBudgetedReceipt(book, heldJournal, heldReaders, market, r.transactionHash)).state, "reconciled-observation");
    assert.equal(book.status().pendingRechecks, 0); assert.equal(book.status().blocked, false);
    assert.equal(verified.gasPayer, AGENT.toLowerCase()); assert.equal(queue.enqueue(r.transactionHash).inserted, true);
    assert.equal((await observeNextReceipt(queue, journal, readers)).state, "done");
    assert.equal(journal.record(await readVerifiedFill(readers, market, r.transactionHash)).inserted, false);
  }
  journal.close(); journal = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market); assert.equal(journal.list().length, 2);
  queue.close(); queue = new ReceiptObservationQueue(join(folder, "jobs.sqlite"), market);
  assert.deepEqual(queue.stats(), { pending: 0, leased: 0, done: 2, exhausted: 0 });
  assert.equal(queue.enqueue(first.transactionHash).inserted, false);
  assert.equal((await observeNextReceipt(queue, journal, readers)).state, "idle");
  stage = "durable native gas accounting and replay";
  const exactSwapGasWei = (first.gasUsed * first.effectiveGasPrice + second.gasUsed * second.effectiveGasPrice).toString();
  assert.equal(book.status().reservedWei, "0"); assert.equal(book.status().chargedRollingDayWei, exactSwapGasWei);
  assert.equal(book.status().retainedEntries, 2);
  const chargedBeforeReplay = charges();
  book.close(); book = new StrategyNativeGasBudget(bookPath, gasPolicy);
  assert.equal(book.status().chargedRollingDayWei, exactSwapGasWei);
  assert.equal((await reconcileBudgetedReceipt(book, heldJournal, heldReaders, market, first.transactionHash)).state, "reconciled-observation");
  assert.deepEqual(charges(), chargedBeforeReplay, "Replay cannot duplicate gas or reset its charge time/evidence");
  assert.equal(journalCommitsWhileHeld, 3); assert.ok(heldRpcCalls > 0);
  stage = "failed fill rollback and revocation";
  const beforeA = await read(a, asset.abi, "balanceOf", [vault]), beforeB = await read(b, asset.abi, "balanceOf", [vault]);
  await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(a, 10n * E18, 100n * E18)], false);
  assert.equal(await read(a, asset.abi, "balanceOf", [vault]), beforeA); assert.equal(await read(b, asset.abi, "balanceOf", [vault]), beforeB);
  assert.equal(await read(vault, vaultArtifact.abi, "nextNonce"), 2n);
  await write(GUARDIAN, vault, vaultArtifact.abi, "revokeOperator");
  await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(a, E18)], false);
  await write(GOV, vault, vaultArtifact.abi, "withdrawToTreasury", [a, 100n * E18]); assert.equal(await read(a, asset.abi, "balanceOf", [TREASURY]), 100n * E18);
  stage = "aged receipt revalidation";
  // Wall time ages the actual journal; do not edit persisted evidence to force a pass.
  await new Promise(r => setTimeout(r, 1100));
  const refreshed = await revalidateFillBatch(journal, readers, { maxAgeMs: 1000 });
  assert.equal(refreshed.selected, 2); assert.equal(refreshed.refreshed, 2); assert.equal(refreshed.healthy, true);
  stage = "local chain rollback and persistent quarantine";
  assert.equal(await rpc.request({ method: "evm_revert", params: [beforeSwaps] }), true);
  await new Promise(r => setTimeout(r, 1100));
  const invalidated = await revalidateFillBatch(journal, readers, { maxAgeMs: 1000 });
  assert.equal(invalidated.selected, 2); assert.equal(invalidated.failed, 2);
  assert.equal(invalidated.quarantined, 2); assert.equal(invalidated.healthy, false);
  journal.close(); journal = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market);
  assert.deepEqual(journal.status(), { observed: 0, quarantined: 2 });
  // Scheduling completion cannot overwrite invalidated evidence or requeue done hashes.
  assert.deepEqual(queue.stats(), { pending: 0, leased: 0, done: 2, exhausted: 0 });
  for (const r of [first, second]) assert.equal(queue.enqueue(r.transactionHash).inserted, false);
  assert.equal((await observeNextReceipt(queue, journal, readers)).state, "idle");
  const stillQuarantined = await revalidateFillBatch(journal, readers, { maxAgeMs: 1000 });
  assert.equal(stillQuarantined.selected, 0); assert.equal(stillQuarantined.healthy, false);
  stage = "budgeted recheck after actual local history rollback";
  for (const r of [first, second]) {
    assert.equal((await reconcileBudgetedReceipt(book, journal, readers, market, r.transactionHash)).state, "quarantined");
  }
  const frozen = book.status();
  assert.equal(frozen.pendingRechecks, 2); assert.equal(frozen.blocked, true); assert.equal(frozen.healthy, false);
  assert.equal(frozen.reservedWei, (2n * E18).toString()); assert.equal(frozen.remainingWei, "0");
  book.close(); book = new StrategyNativeGasBudget(bookPath, gasPolicy);
  assert.deepEqual(book.status(), frozen, "Restart cannot clear rollback holds or freeze");
  assert.throws(() => book.reserve("0x" + "ab".repeat(32), "1"));
  assert.throws(() => book.beginRecheck(first.transactionHash, market));
  journal.close(); journal = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market);
  assert.deepEqual(journal.status(), { observed: 0, quarantined: 2 });
  assert.equal((await observeNextReceipt(queue, journal, readers)).state, "idle");
  const result = { agedReceiptsRefreshed: refreshed.refreshed, rollbackReceiptsQuarantined: invalidated.quarantined,
    quarantineSurvivesReopen: true, completedQueueNotFreshnessAuthority: true, sourceForkBlock: forkBlock.toString(), chainId: 97, successfulSwaps: 2, journalRows: 2, durableObservationJobs: 2, observerQueueReopened: true, noRunnableDuplicateJobs: true, receiptVerification: "passed",
    minedBadFillRollback: "passed", revocation: "passed", treasuryRecovery: "passed", nativeGasReconciled: true,
    budgetedReceiptReconciliation: { reconciledSwapReceipts: 2, exactSwapGasWei, heldRpcCalls,
      journalCommitsWhileHeld, replayPreservedChargeTimeAndEvidence: true, reopenedAfterCharge: true,
      rollbackFrozenEntries: 2, rollbackPendingHolds: frozen.pendingRechecks, rollbackReservedWei: frozen.reservedWei,
      freezeSurvivesReopen: true, fixtureOnlyPolicy: true, nonSwapGasAccounted: false, executionAuthorized: false },
    readClientsUseOneLocalFixture: true, generatedAccounts: 0, privateKeysUsed: false, publicBroadcasts: false, deployedToPublicNetwork: false, profitAllocated: false };
  const report = resolve(".tmp/strategy-runtime.json"); mkdirSync(resolve(".tmp"), { recursive: true }); writeFileSync(report, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(JSON.stringify({ verification: "failed", stage, kind: runtimeFailureKind(error), sourceForkBlock: fixtureBlock, publicBroadcasts: false })); process.exitCode = 1; }
finally {
  try { try { queue?.close(); } finally { try { journal?.close(); } finally { book?.close(); } } }
  finally {
    if (node && node.exitCode === null) {
      node.kill("SIGTERM");
      const force = setTimeout(() => node.kill("SIGKILL"), 3_000);
      await once(node, "exit").catch(() => {}); clearTimeout(force);
    }
    rmSync(folder, { recursive: true, force: true });
  }
}
