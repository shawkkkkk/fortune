import test from "node:test";
import assert from "node:assert/strict";
import { valuePositions } from "../../lib/market-insights.ts";
import { countPhases } from "../../lib/onchain-launches.ts";

const row = (symbol, balance, priceUsd, totalSupply = "1000") => ({ symbol, balance, priceUsd, totalSupply });

test("positions are valued, ranked by value and unpriced ones follow by balance", () => {
  const { positions, totalValueUsd, unpricedPositions } = valuePositions([
    row("LOW", "100", 0.01),
    row("NONE_SMALL", "5", null),
    row("HIGH", "10", 2),
    row("NONE_BIG", "500", null),
  ]);
  assert.deepEqual(positions.map((position) => position.symbol), ["HIGH", "LOW", "NONE_BIG", "NONE_SMALL"]);
  assert.equal(positions[0].valueUsd, 20);
  assert.equal(positions[2].valueUsd, null);
  assert.equal(totalValueUsd, 21);
  assert.equal(unpricedPositions, 2);
});

test("share of supply comes from the balance and is null for an empty supply", () => {
  const { positions } = valuePositions([row("HALF", "500", 1), row("EMPTY", "1", 1, "0")]);
  assert.equal(positions.find((position) => position.symbol === "HALF").share, 0.5);
  assert.equal(positions.find((position) => position.symbol === "EMPTY").share, null);
});

test("portfolio totals are zero with no positions and unknown when nothing is priced", () => {
  assert.equal(valuePositions([]).totalValueUsd, 0);
  const unpriced = valuePositions([row("A", "1", null), row("B", "2", null)]);
  assert.equal(unpriced.totalValueUsd, null);
  assert.equal(unpriced.unpricedPositions, 2);
});

test("creator phases are tallied like launch statuses", () => {
  assert.deepEqual(countPhases([0, 1, 2, 2, 3, 0]), { curve: 2, ready: 1, graduated: 2, rescued: 1 });
  assert.deepEqual(countPhases([]), { curve: 0, ready: 0, graduated: 0, rescued: 0 });
  assert.deepEqual(countPhases([9]), { curve: 1, ready: 0, graduated: 0, rescued: 0 });
});
