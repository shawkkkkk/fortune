import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { prepareStandardVanity } from "../lib/standard-vanity.ts";

const root = new URL("../", import.meta.url);
const contracts = fileURLToPath(new URL("contracts/", root));
const fixture = fileURLToPath(new URL("tests/fixtures/StandardVanityDifferential.sol", root));
const temporary = fileURLToPath(new URL("contracts/test/StandardVanityDifferential.t.sol", root));
const artifact = new URL("contracts/out/FortuneToken.sol/FortuneToken.json", root);
function creationCode() {
  const code = JSON.parse(readFileSync(artifact, "utf8")).bytecode.object;
  assert.match(code, /^0x(?:[0-9a-fA-F]{2})+$/);
  return code;
}
const types = parseAbiParameters(
  "(uint256 chainId,address factory,address registry,address automationRegistry,address metadataRegistry,address tokenDeployer," +
  "address vaultDeployer,address feeRouterDeployer,address curveDeployer,address automationExecutor,address graduationAdapter), " +
  "(string name,string symbol,uint256 totalSupply,address[] quoteAssets,uint16[] weightsBps,address primaryQuote," +
  "uint256 basePriceUsd1e18,uint256 slopeUsd1e18,uint256 graduationUsd1e18,bool adaptiveGraduation,uint16[6] feeBps," +
  "address treasury,bool metadataEditable,string description,string imageURI,string website,string xProfile,string telegram," +
  "string github,string youtube,string debox), address, uint256, bytes32, bytes32, address, bytes32, bytes32",
);

// Require the existing, successful Standard build before the isolated test.
const before = creationCode();
copyFileSync(fixture, temporary, constants.COPYFILE_EXCL);
let output;
try {
  output = execFileSync("forge", [
    "test", "--match-contract", "^StandardVanityDifferential$",
    "--match-test", "^testCompiledStandardVanityDifferential$", "-vv",
  ], { cwd: contracts, encoding: "utf8", timeout: 180_000, maxBuffer: 1024 * 1024 });
} finally {
  unlinkSync(temporary);
}
assert.equal(creationCode(), before, "test fixture must not change the Standard token creation artifact");
for (const label of ["FIRST", "NEXT", "OTHER"]) {
  const found = [...output.matchAll(new RegExp(`^\\s*VANITY_${label}: (0x[0-9a-fA-F]+)\\s*$`, "gm"))];
  assert.equal(found.length, 1, `one compiled vector required: ${label}`);
  const [context, params, creator, launchNonce, manifestHash, salt, predicted, codeHash, initCodeHash] =
    decodeAbiParameters(types, found[0][1]);
  assert.equal(context.chainId, 97n);
  assert.equal(launchNonce, label === "NEXT" ? 1n : 0n);
  assert.equal(keccak256(before), codeHash, "artifact must match actual compiled creation code");
  const result = prepareStandardVanity({
    context: { ...context, chainId: 97 }, params, creator, launchNonce,
    tokenCreationCode: before, expectedCreationCodeHash: codeHash,
  });
  assert.equal(result.initCodeHash, initCodeHash);
  assert.equal(result.manifestHash, manifestHash);
  assert.equal(result.vanitySalt, salt);
  assert.equal(result.predictedToken.toLowerCase(), predicted.toLowerCase());
  assert.equal(result.executionAuthorized, false);
}
console.log("Standard vanity differential: three compiled vectors and both local EVM collision cases passed.");
