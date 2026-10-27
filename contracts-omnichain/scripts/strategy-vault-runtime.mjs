// End-to-end local fork only. Zero generated accounts, VM impersonation, no keys or public broadcasts.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { readVerifiedFill } from "../../lib/arbitrage-receipts.ts";
import { ArbitrageFillJournal } from "../../scripts/arbitrage-fill-journal.mjs";

const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const POSITIONS = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const GOV = "0x0000000000000000000000000000000000001111";
const GUARDIAN = "0x0000000000000000000000000000000000002222";
const TREASURY = "0x0000000000000000000000000000000000003333";
const AGENT = "0x0000000000000000000000000000000000004444";
const E18 = 10n ** 18n, Q96 = 1n << 96n;
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`, import.meta.url), "utf8"));
let node, journal, stage = "initialization";
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
  const forkBlock = await rpc.getBlockNumber({ cacheTime: 0 });
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
    const r = await receipt(await wallet(GOV).deployContract({ abi: item.abi, bytecode: item.bytecode.object, args: params, gas: 10_000_000n }));
    assert.equal(r.status, "success"); assert.ok(r.contractAddress); return r.contractAddress;
  };
  const write = async (who, address, abi, functionName, params = [], succeeds = true) => {
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
  for (const r of [first, second]) {
    const verified = await readVerifiedFill(readers, market, r.transactionHash);
    assert.equal(verified.nativeGasCost, (r.gasUsed * r.effectiveGasPrice).toString());
    assert.equal(verified.gasPayer, AGENT.toLowerCase()); assert.equal(journal.record(verified).inserted, true);
    assert.equal(journal.record(await readVerifiedFill(readers, market, r.transactionHash)).inserted, false);
  }
  journal.close(); journal = new ArbitrageFillJournal(join(folder, "fills.sqlite"), market); assert.equal(journal.list().length, 2);
  stage = "failed fill rollback and revocation";
  const beforeA = await read(a, asset.abi, "balanceOf", [vault]), beforeB = await read(b, asset.abi, "balanceOf", [vault]);
  await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(a, 10n * E18, 100n * E18)], false);
  assert.equal(await read(a, asset.abi, "balanceOf", [vault]), beforeA); assert.equal(await read(b, asset.abi, "balanceOf", [vault]), beforeB);
  assert.equal(await read(vault, vaultArtifact.abi, "nextNonce"), 2n);
  await write(GUARDIAN, vault, vaultArtifact.abi, "revokeOperator");
  await write(AGENT, vault, vaultArtifact.abi, "executeSwap", [await order(a, E18)], false);
  await write(GOV, vault, vaultArtifact.abi, "withdrawToTreasury", [a, 100n * E18]); assert.equal(await read(a, asset.abi, "balanceOf", [TREASURY]), 100n * E18);
  const result = { sourceForkBlock: forkBlock.toString(), chainId: 97, successfulSwaps: 2, journalRows: 2, receiptVerification: "passed",
    minedBadFillRollback: "passed", revocation: "passed", treasuryRecovery: "passed", nativeGasReconciled: true,
    readClientsUseOneLocalFixture: true, generatedAccounts: 0, privateKeysUsed: false, publicBroadcasts: false, deployedToPublicNetwork: false, profitAllocated: false };
  const report = resolve(".tmp/strategy-runtime.json"); mkdirSync(resolve(".tmp"), { recursive: true }); writeFileSync(report, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch { console.error(`Local strategy runtime verification failed at ${stage}; no public transaction was submitted.`); process.exitCode = 1; }
finally {
  try { journal?.close(); }
  finally {
    if (node && node.exitCode === null) {
      node.kill("SIGTERM");
      const force = setTimeout(() => node.kill("SIGKILL"), 3_000);
      await once(node, "exit").catch(() => {}); clearTimeout(force);
    }
    rmSync(folder, { recursive: true, force: true });
  }
}
