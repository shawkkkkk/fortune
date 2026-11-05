import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  concatHex, createPublicClient, decodeFunctionData, encodeAbiParameters, encodeFunctionResult, getAddress, getCreate2Address,
  http, keccak256, numberToHex, parseAbi, parseAbiParameters, toFunctionSelector,
} from "viem";
import { observeStandardVanity, prepareStandardVanity } from "../../lib/standard-vanity.ts";

const address = (n) => getAddress(numberToHex(n, { size: 20 }));
const bytes32 = (n) => numberToHex(n, { size: 32 });
const factoryCode = "0x6000", deployerCode = "0x6001";
const blockNumber = 123n, blockHash = bytes32(777);
const fixture = {
  context: {
    chainId: 97, factory: address(1), registry: address(2), automationRegistry: address(3),
    metadataRegistry: address(4), tokenDeployer: address(5), vaultDeployer: address(6),
    feeRouterDeployer: address(7), curveDeployer: address(8), automationExecutor: address(9),
    graduationAdapter: address(10),
  },
  creator: address(11), launchNonce: 8n,
  params: {
    name: "Lucky Cat", symbol: "LUCK", totalSupply: 10n ** 27n, quoteAssets: [address(12), address(13)],
    weightsBps: [7500, 2500], primaryQuote: address(13), basePriceUsd1e18: 17n,
    slopeUsd1e18: 19n, graduationUsd1e18: 200n, adaptiveGraduation: true,
    feeBps: [10, 20, 30, 40, 50, 60], treasury: address(14), metadataEditable: false,
    description: "Fixture 🎏", imageURI: "ipfs://art", website: "https://example.invalid",
    xProfile: "x", telegram: "t", github: "g", youtube: "y", debox: "d",
  },
  tokenCreationCode: "0x60006000f3",
  expectedCreationCodeHash: keccak256("0x60006000f3"),
  blockNumber, blockHash, factoryRuntimeHash: keccak256(factoryCode), deployerRuntimeHash: keccak256(deployerCode),
};
const previewAbi = parseAbi([
  "struct Launch { string name; string symbol; uint256 totalSupply; address[] quoteAssets; uint16[] weightsBps; address primaryQuote; uint256 basePriceUsd1e18; uint256 slopeUsd1e18; uint256 graduationUsd1e18; bool adaptiveGraduation; uint16[6] feeBps; address treasury; bool metadataEditable; string description; string imageURI; string website; string xProfile; string telegram; string github; string youtube; string debox; }",
  "function previewPreparedVanity(address creator, Launch launch) view returns (bytes32, address, bytes32, uint256)",
  "function tokenDeployer() view returns (address)",
  "function creatorLaunchNonce(address creator) view returns (uint256)",
  "function predict(address factory, string name, string symbol, uint256 supply, bytes32 manifest, bytes32 salt) view returns (address)",
]);
const p = fixture.params;
const expectedManifest = keccak256(encodeAbiParameters(parseAbiParameters(
  "uint256,address,address,address,address,address,address,address,address,address,address,address,uint256,string,string,uint256,address[],uint16[],address,uint256,uint256,uint256,bool,uint16[6],address,bool,string,string,string,string,string,string,string,string",
), [
  97n, ...Array.from({ length: 11 }, (_, i) => address(i + 1)), 8n,
  "Lucky Cat", "LUCK", 10n ** 27n, [address(12), address(13)], [7500, 2500], address(13),
  17n, 19n, 200n, true, [10, 20, 30, 40, 50, 60], address(14), false,
  "Fixture 🎏", "ipfs://art", "https://example.invalid", "x", "t", "g", "y", "d",
]));
const constructorArgs = encodeAbiParameters(parseAbiParameters("address,string,string,uint256,bytes32"), [
  address(1), "Lucky Cat", "LUCK", 10n ** 27n, expectedManifest,
]);

test("offline CREATE2 candidate uses the first frozen suffix with the token deployer and exact constructor bytes", () => {
  const result = prepareStandardVanity(fixture);
  const init = concatHex([fixture.tokenCreationCode, constructorArgs]);
  assert.equal(result.manifestHash, expectedManifest);
  assert.equal(result.initCodeHash, keccak256(init));
  assert.ok(result.searchIndex > 0 && result.searchIndex < 4096);
  for (let i = 0; i <= result.searchIndex; i++) {
    const salt = keccak256(concatHex([fixture.creator, expectedManifest, bytes32(i)]));
    const token = getCreate2Address({ from: fixture.context.tokenDeployer, salt, bytecode: init });
    if (i < result.searchIndex) assert.ok(!token.toLowerCase().endsWith("fe"));
    else {
      assert.equal(result.vanitySalt, salt);
      assert.equal(result.predictedToken, token);
      assert.ok(token.toLowerCase().endsWith("fe"));
      assert.notEqual(token, getCreate2Address({ from: fixture.context.factory, salt, bytecode: init }));
    }
  }
  for (const changed of [
    { ...fixture, creator: address(15) }, { ...fixture, launchNonce: 9n },
    { ...fixture, context: { ...fixture.context, graduationAdapter: address(16) } },
    { ...fixture, params: { ...p, description: "Fixture" } },
  ]) {
    assert.notEqual(prepareStandardVanity(changed).manifestHash, expectedManifest);
  }
  assert.equal(result.addressOccupied, null);
  assert.equal(result.factoryAgreement, null);
  assert.equal(result.currentAuthorization, null);
  assert.equal(result.executionAuthorized, false);
});

test("malformed bytecode, pins, fields and chain fail before RPC", async () => {
  let calls = 0;
  const client = { getChainId: async () => { calls++; return 97; } };
  for (const changed of [
    { ...fixture, expectedCreationCodeHash: bytes32(11) },
    { ...fixture, tokenCreationCode: "0x6" },
    { ...fixture, context: { ...fixture.context, chainId: 56 } },
    { ...fixture, launchNonce: -1n },
    { ...fixture, params: { ...p, name: "x".repeat(65) } },
    { ...fixture, params: { ...p, description: "\ud800" } },
    { ...fixture, params: { ...p, feeBps: Array(6) } },
    { ...fixture, params: { ...p, metadataEditable: 0 } },
    { ...fixture, blockHash: bytes32(0) },
  ]) await assert.rejects(observeStandardVanity(changed, client));
  assert.equal(calls, 0);
});

async function runRpc(mode) {
  const candidate = prepareStandardVanity(fixture), calls = [];
  let headers = 0;
  const server = createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { id, method, params } = JSON.parse(body);
      calls.push(method);
      if (mode === "provider-error" && method === "eth_call") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: "private fixture detail" } }));
        return;
      }
      let result;
      if (method === "eth_chainId") result = "0x61";
      else if (method === "eth_getBlockByNumber") {
        assert.deepEqual(params, [numberToHex(blockNumber), false]);
        headers++;
        result = { number: numberToHex(blockNumber), hash: blockHash, timestamp: headers === 2 && mode === "header" ? "0x44" : "0x42", transactions: [] };
      } else if (method === "eth_getCode") {
        assert.equal(params[1], numberToHex(blockNumber));
        const target = params[0].toLowerCase();
        if (target === fixture.context.factory.toLowerCase()) result = mode === "runtime" ? "0x6002" : factoryCode;
        else if (target === fixture.context.tokenDeployer.toLowerCase()) result = deployerCode;
        else {
          assert.equal(target, candidate.predictedToken.toLowerCase());
          result = mode === "code" ? "0x00" : "0x";
        }
      } else if (method === "eth_getTransactionCount") {
        assert.deepEqual(params.map((x) => x.toLowerCase()), [candidate.predictedToken.toLowerCase(), numberToHex(blockNumber)]);
        result = mode === "nonce-only" ? "0x01" : "0x0";
      } else if (method === "eth_call") {
        const [{ to, data }, block] = params;
        assert.equal(block, numberToHex(blockNumber));
        const { functionName, args } = decodeFunctionData({ abi: previewAbi, data });
        const at = functionName === "predict" ? fixture.context.tokenDeployer : fixture.context.factory;
        assert.equal(to.toLowerCase(), at.toLowerCase());
        let output;
        if (functionName === "tokenDeployer") output = mode === "deployer" ? address(16) : fixture.context.tokenDeployer;
        else if (functionName === "creatorLaunchNonce") {
          assert.deepEqual(args, [fixture.creator]);
          output = mode === "nonce" ? fixture.launchNonce + 1n : fixture.launchNonce;
        } else if (functionName === "previewPreparedVanity") {
          assert.deepEqual(args, [fixture.creator, p]);
          output = [candidate.vanitySalt, candidate.predictedToken, mode === "preview" ? bytes32(99) : expectedManifest, fixture.launchNonce];
        } else {
          assert.equal(functionName, "predict");
          assert.equal(data.slice(0, 10), toFunctionSelector("predict(address,string,string,uint256,bytes32,bytes32)"));
          assert.deepEqual(args, [fixture.context.factory, p.name, p.symbol, p.totalSupply, expectedManifest, candidate.vanitySalt]);
          output = mode === "predict" ? address(17) : candidate.predictedToken;
        }
        result = encodeFunctionResult({ abi: previewAbi, functionName, result: output });
      } else assert.fail(`Unexpected method ${method}`);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (error) {
      response.statusCode = 500;
      response.end("fixture assertion failed");
      server.fixtureError = error;
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = createPublicClient({ transport: http(`http://127.0.0.1:${server.address().port}`, { retryCount: 0, timeout: 2000 }) });
    if (["free", "code", "nonce-only"].includes(mode)) {
      const result = await observeStandardVanity(fixture, client);
      assert.equal(result.factoryAgreement, true);
      assert.equal(result.addressOccupied, mode !== "free");
      assert.equal(result.deploymentGuaranteed, false);
      assert.equal(result.finalityVerified, false);
      assert.equal(result.executionAuthorized, false);
      assert.equal(result.blockHash, blockHash);
    } else {
      await assert.rejects(observeStandardVanity(fixture, client), new RegExp({
        runtime: "runtime pin", deployer: "deployer mismatch", nonce: "creator nonce",
        preview: "factory preview", predict: "deployer prediction", header: "final header", "provider-error": "^Error: Standard vanity RPC read failed$",
      }[mode]));
      if (mode !== "header") assert.ok(!calls.includes("eth_getTransactionCount"));
    }
    if (server.fixtureError) throw server.fixtureError;
    assert.ok(calls.every((method) => !/send|sign/i.test(method)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const mode of ["free", "code", "nonce-only", "runtime", "deployer", "nonce", "preview", "predict", "header", "provider-error"])
  test(`pinned HTTP observation: ${mode}`, () => runRpc(mode));
