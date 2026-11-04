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
import { inspectLiquidityCustodyDepositReceipt } from "../../lib/liquidity-custody-deposit-receipt.ts";
import { inspectLiquidityCustodyReleaseReceipt } from "../../lib/liquidity-custody-release-receipt.ts";
import { inspectLiquidityCustody } from "../../lib/managed-liquidity-custody.ts";
import { inspectLiquidityPosition } from "../../lib/managed-liquidity-position.ts";

const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const POSITIONS = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const GOV = "0x0000000000000000000000000000000000001111";
const TREASURY = "0x0000000000000000000000000000000000003333";
const E18 = 10n ** 18n, Q96 = 1n << 96n;
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../out/${file}/${name}.json`, import.meta.url), "utf8"));
let node, forkBlock, stage = "initialization";
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
  forkBlock = await rpc.getBlockNumber({ cacheTime: 0 });
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
  stage = "custody contract deployment";
  const custody = await deploy(custodyArtifact, [GOV, "0x0000000000000000000000000000000000002222", TREASURY, {
    manager: custodyPin(policy.manager), factory: custodyPin(policy.factory), pool: custodyPin(policy.pool),
    token0: custodyPin(policy.token0), token1: custodyPin(policy.token1), positionId: tokenId, fee: 500,
    tickLower: -887270, tickUpper: 887270, expectedLiquidity: BigInt(first.liquidityUnits),
  }]);
  stage = "custody NFT approval";
  await write(GOV, POSITIONS, parseAbi(["function approve(address,uint256)"]), "approve", [custody, tokenId]);
  stage = "custody opening";
  await write(GOV, custody, custodyArtifact.abi, "setPaused", [false]);
  stage = "custody NFT deposit";
  const depositedReceipt = await write(GOV, custody, custodyArtifact.abi, "deposit");
  stage = "custody held flag";
  assert.equal(await read(custody, custodyArtifact.abi, "held"), true);
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  stage = "former-owner rejection";
  await assert.rejects(inspectLiquidityPosition(readers, policy));
  stage = "held-position observation";
  const held = await inspectLiquidityPosition(readers, {...policy, owner: custody});
  assert.equal(held.owner, custody.toLowerCase()); assert.equal(held.liquidityUnits, first.liquidityUnits);
  stage = "custody runtime pin";
  const custodyReadPolicy = {...policy, custody: await pin(custody), governor: GOV,
    guardian: "0x0000000000000000000000000000000000002222", treasury: TREASURY,
    tickLower: -887270, tickUpper: 887270, expectedLiquidity: first.liquidityUnits};
  delete custodyReadPolicy.owner;
  stage = "held custody policy observation";
  const heldState = await inspectLiquidityCustody(readers, custodyReadPolicy);
  stage = "held custody output assertions";
  assert.equal(heldState.held, true); assert.equal(heldState.paused, false);
  assert.equal(heldState.position.liquidityUnits, first.liquidityUnits);
  assert.equal(heldState.currentAuthorization, null); assert.equal(heldState.executionAuthorized, false);
  stage = "foreign-treasury rejection";
  await assert.rejects(inspectLiquidityCustody(readers, {...custodyReadPolicy, treasury: GOV}));
  stage = "paused fixed-treasury release";
  await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury", [], false);
  stage = "custody pausing";
  await write(GOV, custody, custodyArtifact.abi, "setPaused", [true]);
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  stage = "paused custody observation";
  assert.equal((await inspectLiquidityCustody(readers, custodyReadPolicy)).paused, true);
  stage = "fixed-treasury release";
  const releasedReceipt = await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury");
  stage = "released custody flags";
  assert.equal(await read(custody, custodyArtifact.abi, "released"), true);
  assert.equal(await read(custody, custodyArtifact.abi, "held"), false);
  await write(GOV, custody, custodyArtifact.abi, "releaseToTreasury", [], false);
  await rpc.request({method: "anvil_mine", params: ["0x14"]});
  stage = "former-owner rejection";
  await assert.rejects(inspectLiquidityPosition(readers, policy));
  stage = "released-custody rejection";
  await assert.rejects(inspectLiquidityCustody(readers, custodyReadPolicy));
  stage = "treasury-position observation";
  const transferred = await inspectLiquidityPosition(readers, {...policy, owner: TREASURY});
  assert.equal(transferred.owner, TREASURY.toLowerCase());
  assert.equal(transferred.liquidityUnits, first.liquidityUnits);
  // BEGIN historical direct release receipt integration.
  stage = "historical release receipt wall alignment";
  const receiptTime = Number((await rpc.getBlock({blockNumber:releasedReceipt.blockNumber})).timestamp)*1000;
  let last = Date.now(); const deadline = last+60000;
  assert.ok(Number.isSafeInteger(receiptTime) && receiptTime-last<=60000);
  while(last<receiptTime){await new Promise(r=>setTimeout(r,Math.min(1000,receiptTime-last)));const now=Date.now();assert.ok(Number.isSafeInteger(now)&&now>=last&&now<=deadline);last=now;}
  const state = async()=>({head:await rpc.getBlockNumber({cacheTime:0}),nonces:await Promise.all(["latest","pending"].map(blockTag=>rpc.getTransactionCount({address:GOV,blockTag}))),owner:await read(POSITIONS,parseAbi(["function ownerOf(uint256) view returns(address)"]),"ownerOf",[tokenId]),held:await read(custody,custodyArtifact.abi,"held"),released:await read(custody,custodyArtifact.abi,"released")});
  const before = await state(),releaseInput={policy:custodyReadPolicy,transactionHash:releasedReceipt.transactionHash};
  stage = "actual direct release receipt observation";
  const releasedObservation=await inspectLiquidityCustodyReleaseReceipt(readers,releaseInput);
  assert.equal(releasedObservation.position.owner,TREASURY.toLowerCase());assert.equal(releasedObservation.position.liquidityUnits,first.liquidityUnits);assert.equal(releasedObservation.released,true);assert.equal(releasedObservation.currentAuthorization,null);assert.equal(releasedObservation.executionAuthorized,false);
  const replay=await inspectLiquidityCustodyReleaseReceipt(readers,releaseInput);assert.equal(replay.evidenceId,releasedObservation.evidenceId);assert.equal(replay.receiptConsistencyDigest,releasedObservation.receiptConsistencyDigest);
  await assert.rejects(inspectLiquidityCustodyReleaseReceipt(readers,{...releaseInput,policy:{...custodyReadPolicy,treasury:GOV}}));
  assert.deepEqual(await state(),before);
  // END historical direct release receipt integration.
  // BEGIN historical direct deposit receipt integration.
  // Release's existing wall alignment also covers the earlier deposit block.
  // Current state is terminal; the new reader must still use DEPOSIT height.
  {
    stage = "historical deposit receipt state snapshot";
    const state = async()=>({head:await rpc.getBlockNumber({cacheTime:0}),nonces:await Promise.all(["latest","pending"].map(blockTag=>rpc.getTransactionCount({address:GOV,blockTag}))),owner:await read(POSITIONS,parseAbi(["function ownerOf(uint256) view returns(address)"]),"ownerOf",[tokenId]),held:await read(custody,custodyArtifact.abi,"held"),released:await read(custody,custodyArtifact.abi,"released")});
    const before = await state(),depositInput={policy:custodyReadPolicy,transactionHash:depositedReceipt.transactionHash};
    assert.equal(before.released,true);assert.equal(before.held,false);
    stage = "actual direct deposit receipt observation";
    const depositedObservation=await inspectLiquidityCustodyDepositReceipt(readers,depositInput);
    assert.equal(depositedObservation.position.owner,custody.toLowerCase());assert.equal(depositedObservation.position.liquidityUnits,first.liquidityUnits);assert.equal(depositedObservation.held,true);assert.equal(depositedObservation.released,false);assert.equal(depositedObservation.currentAuthorization,null);assert.equal(depositedObservation.executionAuthorized,false);
    const replay=await inspectLiquidityCustodyDepositReceipt(readers,depositInput);assert.equal(replay.evidenceId,depositedObservation.evidenceId);assert.equal(replay.receiptConsistencyDigest,depositedObservation.receiptConsistencyDigest);
    await assert.rejects(inspectLiquidityCustodyDepositReceipt(readers,{...depositInput,policy:{...custodyReadPolicy,governor:TREASURY}}));
    await assert.rejects(inspectLiquidityCustodyDepositReceipt(readers,releaseInput));
    await assert.rejects(inspectLiquidityCustodyReleaseReceipt(readers,depositInput));
    assert.deepEqual(await state(),before);
  }
  // END historical direct deposit receipt integration.
  // BEGIN custody receipt operator integration.
  stage = "actual custody receipt operator integration";
  {
    const beforeCli=await state(),policyPath=join(folder,"custody-receipt.json");
    const runCli=async(kind,input)=>{
      writeFileSync(policyPath,JSON.stringify(input),{mode:0o600});
      const child=spawn(process.execPath,["--import","./scripts/register-ts.mjs","--import","./tests/fixtures/liquidity-custody-http.mjs","scripts/inspect-liquidity-custody-receipt.mjs",kind,policyPath],{env:{...process.env,FORTUNE_LP_CUSTODY_RECEIPT_READ_ENABLED:"true",FORTUNE_LP_READ_RPC_URL:"https://lp-custody-one.invalid",FORTUNE_LP_SECONDARY_RPC_URL:"https://lp-custody-two.invalid",FORTUNE_TEST_LP_CUSTODY_RPC:url},stdio:["ignore","pipe","pipe"]});
      let out="",err="";child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);
      const timer=setTimeout(()=>child.kill("SIGKILL"),40000);
      try{const [status]=await once(child,"exit");return{status,out,err};}finally{clearTimeout(timer);}
    };
    const ids=[];
    for(const [kind,receipt,inspect]of [["deposit",depositedReceipt,inspectLiquidityCustodyDepositReceipt],["release",releasedReceipt,inspectLiquidityCustodyReleaseReceipt]]){
      const input={policy:custodyReadPolicy,transactionHash:receipt.transactionHash},direct=await inspect(readers,input),cli=await runCli(kind,input);
      assert.equal(cli.status,0,cli.err);const output=JSON.parse(cli.out);assert.equal(output.kind,kind);assert.equal(output.currentAuthorization,null);assert.equal(output.executionAuthorized,false);assert.equal(output.fullManagedLiquidityReadiness,false);
      const {observedAtMs:directTime,...expected}=direct,{observedAtMs:cliTime,...actual}=output.observation;assert.deepEqual(actual,expected);assert.ok(Number.isSafeInteger(directTime)&&Number.isSafeInteger(cliTime));ids.push(direct.evidenceId);
    }
    const replay=await runCli("deposit",{policy:custodyReadPolicy,transactionHash:depositedReceipt.transactionHash});assert.equal(replay.status,0,replay.err);assert.equal(JSON.parse(replay.out).observation.evidenceId,ids[0]);
    const wrong=await runCli("release",{policy:custodyReadPolicy,transactionHash:depositedReceipt.transactionHash});assert.equal(wrong.status,1);assert.equal(wrong.out,"");assert.match(wrong.err,/Liquidity custody receipt unavailable/);
    assert.deepEqual(await state(),beforeCli);
  }
  // END custody receipt operator integration.
  const result = { sourceForkBlock: forkBlock.toString(), positionObserved: true, custodyDepositObserved: true,
    actualDepositReceiptCliMatched: true, actualReleaseReceiptCliMatched: true, receiptCliReplayStable: true, wrongReceiptCliRouteRejected: true, receiptCliReadsPreservedState: true,
    actualDepositReceiptObserved: true, depositReceiptReplayStable: true, wrongDepositGovernorRejected: true, depositReceiptReadsPreservedState: true, depositReleaseRoutesSeparated: true,
    actualReleaseReceiptObserved: true, releaseReceiptReplayStable: true, wrongReleaseTreasuryRejected: true, releaseReceiptReadsPreservedState: true,
    actualCustodyPolicyReaderMatched: true, pausedCustodyReaderMatched: true, releasedCustodyReaderRejected: true, wrongCustodyTreasuryRejected: true, formerGovernorRejectedAfterDeposit: true,
    activeReleaseRejected: true, fixedTreasuryReleaseObserved: true, duplicateReleaseRejected: true, fullManagedLiquidityReadiness: false, transferredOwnerRejected: true,
    reviewedNewOwnerObserved: true, liquidityUnchanged: true, readClientsUseOneLocalFixture: true,
    generatedAccounts: 0, privateKeysUsed: false, publicBroadcasts: false, executionAuthorized: false, deployedToPublicNetwork: false };
  mkdirSync(resolve(".tmp"), {recursive: true});
  writeFileSync(resolve(".tmp/lp-position-runtime.json"), JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result,null,2));
} catch {
  // Fixed local labels and a bounded public height only; never print exceptions or RPC data.
  const sourceBlock = typeof forkBlock === "bigint" && forkBlock > 0n && forkBlock < (1n << 64n) ? forkBlock.toString() : "unknown";
  console.error(`Local LP observation verification failed at ${stage}; source fork block ${sourceBlock}; no public transaction was submitted.`);
  process.exitCode=1;
}
finally {
  if(node && node.exitCode===null){node.kill("SIGTERM");const force=setTimeout(()=>node.kill("SIGKILL"),3000);await once(node,"exit").catch(()=>{});clearTimeout(force);}
  rmSync(folder,{recursive:true,force:true});
}
