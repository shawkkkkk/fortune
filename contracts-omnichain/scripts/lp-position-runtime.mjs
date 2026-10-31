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
import { inspectLiquidityPosition } from "../../lib/managed-liquidity-position.ts";

const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const POSITIONS = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const GOV = "0x0000000000000000000000000000000000001111";
const TREASURY = "0x0000000000000000000000000000000000003333";
const E18 = 10n ** 18n, Q96 = 1n << 96n;
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`, import.meta.url), "utf8"));
let node, stage = "initialization";
const folder = mkdtempSync(join(tmpdir(), "fortune-strategy-runtime-"));
// A failed repeat must not leave an old passing artifact available to CI.
rmSync(resolve(".tmp/lp-position-runtime.json"), { force: true });
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
  for (const who of [GOV]) {
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
  stage = "position observation";
  const nftAbi = parseAbi(["function tokenOfOwnerByIndex(address,uint256) view returns(uint256)", "function transferFrom(address,address,uint256)"]);
  const tokenId = await read(POSITIONS, nftAbi, "tokenOfOwnerByIndex", [GOV, 0n]);
  const policy = { chainId: 97, manager: await pin(POSITIONS), factory: await pin(FACTORY), pool: await pin(pool),
    token0: await pin(token0), token1: await pin(token1), owner: GOV, fee: 500, positionId: tokenId.toString() };
  const readers = [createPublicClient({transport: transport()}), createPublicClient({transport: transport()})];
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  const first = await inspectLiquidityPosition(readers, policy);
  assert.ok(BigInt(first.liquidityUnits) > 0n); assert.equal(first.claimableFees, null);
  assert.equal(first.owner, GOV.toLowerCase()); assert.equal(first.executionAuthorized, false);
  stage = "actual pinned position custody";
  const custodyArtifact = artifact("FortuneTestnetPositionCustody.sol", "FortuneTestnetPositionCustody");
  const custodyPin = p => ({ target: p.address, codeHash: p.codeHash });
  const custody = await deploy(custodyArtifact, [GOV, "0x0000000000000000000000000000000000002222", TREASURY, {
    manager: custodyPin(policy.manager), factory: custodyPin(policy.factory), pool: custodyPin(policy.pool),
    token0: custodyPin(policy.token0), token1: custodyPin(policy.token1), positionId: tokenId, fee: 500,
    tickLower: -887270, tickUpper: 887270, expectedLiquidity: BigInt(first.liquidityUnits),
  }]);
  await write(GOV, POSITIONS, parseAbi(["function approve(address,uint256)"]), "approve", [custody, tokenId]);
  await write(GOV, custody, custodyArtifact.abi, "setPaused", [false]);
  await write(GOV, custody, custodyArtifact.abi, "deposit");
  assert.equal(await read(custody, custodyArtifact.abi, "held"), true);
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  await assert.rejects(inspectLiquidityPosition(readers, policy));
  const held = await inspectLiquidityPosition(readers, {...policy, owner: custody});
  assert.equal(held.owner, custody.toLowerCase()); assert.equal(held.liquidityUnits, first.liquidityUnits);
  stage = "paused fixed-treasury release";
  await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury", [], false);
  await write(GOV, custody, custodyArtifact.abi, "setPaused", [true]);
  await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury");
  assert.equal(await read(custody, custodyArtifact.abi, "released"), true);
  assert.equal(await read(custody, custodyArtifact.abi, "held"), false);
  await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury", [], false);
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  await assert.rejects(inspectLiquidityPosition(readers, policy));
  const transferred = await inspectLiquidityPosition(readers, {...policy, owner: TREASURY});
  assert.equal(transferred.owner, TREASURY.toLowerCase());
  assert.equal(transferred.liquidityUnits, first.liquidityUnits);
  const result = { sourceForkBlock: forkBlock.toString(), positionObserved: true, custodyDepositObserved: true, formerGovernorRejectedAfterDeposit: true,
    activeReleaseRejected: true, fixedTreasuryReleaseObserved: true, duplicateReleaseRejected: true, fullManagedLiquidityReadiness: false, transferredOwnerRejected: true,
    reviewedNewOwnerObserved: true, liquidityUnchanged: true, readClientsUseOneLocalFixture: true,
    generatedAccounts: 0, privateKeysUsed: false, publicBroadcasts: false, executionAuthorized: false, deployedToPublicNetwork: false };
  mkdirSync(resolve(".tmp"), {recursive: true});
  writeFileSync(resolve(".tmp/lp-position-runtime.json"), JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result,null,2));
} catch { console.error(`Local LP observation verification failed at ${stage}; no public transaction was submitted.`); process.exitCode=1; }
finally {
  if(node && node.exitCode===null){node.kill("SIGTERM");const force=setTimeout(()=>node.kill("SIGKILL"),3000);await once(node,"exit").catch(()=>{});clearTimeout(force);}
  rmSync(folder,{recursive:true,force:true});
}
