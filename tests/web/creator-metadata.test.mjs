import test from "node:test";
import assert from "node:assert/strict";
import { byteLength, emptyMetadata, validateCreatorMetadata, publicMetadataUrl, parseMetadataDocument, metadataFetchUrl, readLimitedBytes } from "../../lib/creator-metadata.ts";
import { makeLaunchDraft, restoreLaunchDraft, launchDraftKey } from "../../lib/launch-draft.ts";
import { pairEligibility, STANDARD_MAINNET_QUOTE } from "../../lib/pair-policy.ts";

const identity = { ...emptyMetadata, name: "Fortune 猫", symbol: "Lucky", description: "Our community", imageURI: "https://example.com/cat.png" };
const factory = "0x1111111111111111111111111111111111111111";
const fields = { ...identity, totalSupply: "1000000000", basePrice: "0.001", slope: "0", graduationTarget: "1", creatorPurchase: "0", treasury: "", metadataURI: "", selectedAsset: factory };

test("metadata validates Solidity UTF-8 byte limits and preserves ticker case", () => {
  assert.equal(validateCreatorMetadata(identity).symbol, "Lucky");
  assert.equal(byteLength("猫"), 3);
  assert.throws(() => validateCreatorMetadata({ ...identity, name: "猫".repeat(22) }), /64 UTF-8/);
  assert.throws(() => validateCreatorMetadata({ ...identity, description: "😀".repeat(1025) }), /4096 UTF-8/);
  assert.throws(() => validateCreatorMetadata({ ...identity, imageURI: "" }), /public image/);
  assert.throws(() => validateCreatorMetadata({ ...identity, description: "bad\0text" }), /control/);
});

test("public metadata URLs reject scripts, credentials, local targets and malformed IPFS", () => {
  for (const uri of ["javascript:alert(1)", "data:image/png;base64,AAA", "blob:https://example.com/1", "https://x:y@example.com/a", "https://localhost./a", "http://127.1/a", "http://0x7f000001/a", "https://[::1]/a", "https://foo.internal/a", "https://example.com:444/a", "ipfs://garbage", "ipfs://bafy" + "a".repeat(55) + "/../secret"]) {
    assert.throws(() => publicMetadataUrl("Image", uri, true), undefined, uri);
  }
  assert.equal(publicMetadataUrl("Image", "ipfs://bafy" + "a".repeat(55), true), "ipfs://bafy" + "a".repeat(55));
  assert.equal(publicMetadataUrl("Website", "https://example.com/path?q=1"), "https://example.com/path?q=1");
});

test("metadata import recognizes common fields but never imports fee or supply instructions", () => {
  const result = parseMetadataDocument({ name: "Cat", symbol: "CaT", image: identity.imageURI, description: "Hi", external_url: "https://example.com", extensions: { twitter: "https://x.com/fortunepad", telegram: "https://t.me/fortune" }, totalSupply: "1", feeBps: [9000], metadataEditable: true });
  assert.equal(result.symbol, "CaT"); assert.equal(result.website, "https://example.com");
  assert.equal(result.xProfile, "https://x.com/fortunepad");
  assert.equal(Object.hasOwn(result, "feeBps"), false);
  assert.throws(() => parseMetadataDocument({ ...result, description: {} }), /text/);
  assert.throws(() => parseMetadataDocument([]), /JSON object/);
  assert.throws(() => metadataFetchUrl("http://example.com/meta.json"), /HTTPS/);
});

test("stream reader enforces actual size even without content-length", async () => {
  assert.equal(new TextDecoder().decode(await readLimitedBytes(new Response("abc"), 3)), "abc");
  await assert.rejects(readLimitedBytes(new Response("abcd"), 3), /size/);
  await assert.rejects(readLimitedBytes(new Response("a", { headers: { "content-length": "999" } }), 3), /size/);
});

test("draft saves incomplete fields without wallet or transaction authority", () => {
  const draft = makeLaunchDraft({ ...fields, name: "", receipt: "bad", account: factory, reviewed: true, mode: "tax" }, 97, factory);
  const restored = restoreLaunchDraft(JSON.stringify(draft), 97, factory);
  assert.equal(restored.fields.name, "");
  for (const key of ["receipt", "account", "reviewed", "mode"]) assert.equal(Object.hasOwn(restored.fields, key), false);
  assert.equal(restoreLaunchDraft(JSON.stringify(draft), 56, factory), null);
  assert.equal(restoreLaunchDraft(JSON.stringify(draft), 97, STANDARD_MAINNET_QUOTE), null);
  assert.notEqual(launchDraftKey(97, factory), launchDraftKey(56, factory));
});

test("draft restore rejects corruption, unsupported versions, oversized content and ephemeral image URIs", () => {
  const draft = makeLaunchDraft(fields, 97, factory);
  assert.equal(restoreLaunchDraft("{oops", 97, factory), null);
  for (const bad of [{ ...draft, version: 2 }, { ...draft, fields: { ...fields, imageURI: "blob:foo" } }, { ...draft, fields: { ...fields, description: "x".repeat(4097) } }, { ...draft, fields: { ...fields, selectedAsset: [factory] } }]) {
    assert.equal(restoreLaunchDraft(JSON.stringify(bad), 97, factory), null);
  }
});

test("pair eligibility never promotes discovery or expands the frozen WBNB release", () => {
  const asset = { address: factory, active: true, healthy: true, quoteEnabled: true, graduationEnabled: true };
  assert.equal(pairEligibility(undefined, 97).eligible, false);
  assert.equal(pairEligibility(asset, 97).eligible, true);
  assert.deepEqual(pairEligibility(asset, 56).reasons, ["STANDARD_MAINNET_WBNB_ONLY"]);
  assert.equal(pairEligibility({ ...asset, address: STANDARD_MAINNET_QUOTE }, 56).eligible, true);
  for (const key of ["active", "healthy", "quoteEnabled", "graduationEnabled"]) assert.equal(pairEligibility({ ...asset, [key]: false }, 97).eligible, false);
  assert.equal(pairEligibility(asset, 1).eligible, false);
});
