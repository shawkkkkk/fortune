import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(new URL("./run-forge.mjs", import.meta.url));
test("pinned Forge is available and its failures propagate to CI", () => {
  const version = spawnSync(process.execPath, [runner, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /Version: 1\.7\.1/);
  const invalid = spawnSync(process.execPath, [runner, "--definitely-invalid-command"], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unexpected argument/);
});
