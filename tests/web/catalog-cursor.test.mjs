import test from "node:test";
import assert from "node:assert/strict";
import { encodeCatalogCursor, decodeCatalogCursor } from "../../lib/catalog-cursor.ts";
import { readNetworkConfigured } from "../../lib/read-network.ts";

test("pagination carries an exact block and rejects malformed or unbounded cursors", () => {
  assert.deepEqual(decodeCatalogCursor(encodeCatalogCursor(25, 76543210n)), { offset: 25, blockNumber: 76543210n });
  assert.deepEqual(decodeCatalogCursor(null), { offset: 0, blockNumber: undefined });
  for (const cursor of ["not-json", "a".repeat(201), encodeCatalogCursor(10_001, 1n), encodeCatalogCursor(-1, 1n), encodeCatalogCursor(0, -1n)]) {
    assert.throws(() => decodeCatalogCursor(cursor), /Invalid/);
  }
});

test("read-only paused deployment access requires valid BSC factory and registry addresses", () => {
  const a = "0x" + "11".repeat(20);
  const b = "0x" + "22".repeat(20);
  assert.equal(readNetworkConfigured(56, a, b), true);
  assert.equal(readNetworkConfigured(97, a, b), true);
  assert.equal(readNetworkConfigured(1, a, b), false);
  assert.equal(readNetworkConfigured(56, "", b), false);
  assert.equal(readNetworkConfigured(56, a, "0x" + "00".repeat(20)), false);
});
