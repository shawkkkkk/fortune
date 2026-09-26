import test from "node:test";
import assert from "node:assert/strict";
import { supplySlices } from "../../lib/market-insights.ts";
import { formatShare } from "../../lib/market-format.ts";
import { trustedShareArtworkSource } from "../../lib/share-artwork.ts";
import { parseWatchlist, toggleInList, WATCHLIST_LIMIT } from "../../lib/watchlist.ts";

const E18 = 10n ** 18n;

test("supply slices add up to total supply and give everyone else the remainder", () => {
  const total = 1_000_000_000n * E18;
  const breakdown = supplySlices(total, {
    curve: 600_000_000n * E18, pools: 200_000_000n * E18, creator: 20_000_000n * E18, vaults: 0n, burned: 5_000_000n * E18,
  });
  const by = Object.fromEntries(breakdown.slices.map((slice) => [slice.key, slice]));
  assert.equal(breakdown.total, 1_000_000_000);
  assert.equal(by.holders.amount, 175_000_000);
  assert.equal(by.curve.share, 0.6);
  assert.equal(by.creator.share, 0.02);
  assert.ok(Math.abs(breakdown.slices.reduce((sum, slice) => sum + slice.share, 0) - 1) < 1e-9);
});

test("supply slices never report negative holders and reject an empty supply", () => {
  const over = supplySlices(100n, { curve: 80n, pools: 30n, creator: 0n, vaults: 0n, burned: 0n });
  assert.equal(over.slices.find((slice) => slice.key === "holders").amount, 0);
  assert.equal(supplySlices(0n, { curve: 0n, pools: 0n, creator: 0n, vaults: 0n, burned: 0n }), null);
});

test("shares format compactly", () => {
  assert.equal(formatShare(0), "0%");
  assert.equal(formatShare(0.5), "50%");
  assert.equal(formatShare(0.125), "12.5%");
  assert.equal(formatShare(1), "100%");
  assert.equal(formatShare(0.0025), "0.25%");
  assert.equal(formatShare(0.02), "2%");
  assert.equal(formatShare(0.0004), "<0.1%");
});

test("the watchlist keeps distinct lowercase addresses, newest first, capped", () => {
  const a = "0x" + "a".repeat(40);
  const b = "0x" + "B".repeat(40);
  assert.deepEqual(parseWatchlist(JSON.stringify([a, b, a.toUpperCase().replace("0X", "0x"), "not-an-address", 7])), [a, b.toLowerCase()]);
  assert.deepEqual(parseWatchlist("{broken"), []);
  assert.deepEqual(parseWatchlist(null), []);
  assert.deepEqual(toggleInList([a], b), [b.toLowerCase(), a]);
  assert.deepEqual(toggleInList([a, b.toLowerCase()], a.toUpperCase().replace("0X", "0x")), [b.toLowerCase()]);
  const full = Array.from({ length: WATCHLIST_LIMIT }, (_, i) => "0x" + i.toString(16).padStart(40, "0"));
  const next = toggleInList(full, b);
  assert.equal(next.length, WATCHLIST_LIMIT);
  assert.equal(next[0], b.toLowerCase());
  assert.ok(!next.includes(full[WATCHLIST_LIMIT - 1]), "the oldest entry drops");
});

test("share-card artwork only uses the fixed IPFS gateway", () => {
  assert.equal(trustedShareArtworkSource("https://images.example.com/token.png"), null);
  assert.equal(trustedShareArtworkSource("ipfs://not-a-cid/token.png"), null);
  assert.equal(
    trustedShareArtworkSource("ipfs://QmYwAPJzv5CZsnAzt8auVZRnGi2C9A8a4xM6qS2d5f9WJ8/token.png"),
    "https://ipfs.io/ipfs/QmYwAPJzv5CZsnAzt8auVZRnGi2C9A8a4xM6qS2d5f9WJ8/token.png",
  );
});
