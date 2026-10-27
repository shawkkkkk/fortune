import test from "node:test";
import assert from "node:assert/strict";
import { launchCatalog } from "../../lib/launch-catalog.ts";

const factory = "0x1111111111111111111111111111111111111111";
test("catalog covers ten distinct presets and never treats a planned engine as executable", () => {
  const list = launchCatalog({ chainId: 97, standardConfigured: true, customFactory: factory, stockFactory: factory });
  assert.equal(new Set(list.map(p => p.id)).size, 10);
  assert.equal(list.find(p => p.id === "standard").state, "builder");
  assert.equal(list.find(p => p.id === "custom-pair").state, "builder");
  assert.equal(list.find(p => p.id === "omnichain").state, "planned");
  assert.equal(list.find(p => p.id === "protected").state, "unconfigured");
  assert.equal(list.find(p => p.id === "social").state, "unconfigured");
});
test("mainnet, arbitrary chains and zero factories cannot enable a beta", () => {
  for (const chainId of [56, 1, 0, NaN, 97]) {
    const list = launchCatalog({ chainId, standardConfigured: false, customFactory: chainId === 97 ? "0x" + "0".repeat(40) : factory, stockFactory: "invalid" });
    assert.ok(list.every(p => p.state !== "builder"));
  }
});
