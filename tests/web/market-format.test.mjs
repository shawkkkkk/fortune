import test from "node:test";
import assert from "node:assert/strict";

import { formatAmount, formatPrice, formatShare, formatUnitPrice } from "../../lib/market-format.ts";

test("formatPrice keeps existing rendering for valid prices", () => {
  assert.equal(formatPrice(null), "—");
  assert.equal(formatPrice(undefined), "—");
  assert.equal(formatPrice(NaN), "—");
  assert.equal(formatPrice(0), "$0");
  assert.equal(formatPrice(1.23456), "$1.2346");
  assert.equal(formatPrice(1234.5678), "$1,235");
  assert.equal(formatPrice(0.1), "$0.1");
  assert.equal(formatPrice(0.0001), "$0.0001");
  assert.equal(formatPrice(0.00001234), "$0.0₄1234");
  assert.equal(formatPrice(0.00000012345), "$0.0₆1234");
  assert.equal(formatPrice(0.00000001), "$0.0₇1");
});

test("formatPrice never renders a negative price as $0..", () => {
  assert.equal(formatPrice(-5), "−$5");
  assert.equal(formatPrice(-0.5), "−$0.5");
  assert.equal(formatPrice(-0.00001234), "−$0.0₄1234");
  assert.equal(formatPrice(-1234.5678), "−$1,235");
});

test("formatUnitPrice drops the currency sign but keeps a negative sign", () => {
  assert.equal(formatUnitPrice(0.00001234), "0.0₄1234");
  assert.equal(formatUnitPrice(-0.00001234), "−0.0₄1234");
  assert.equal(formatUnitPrice(1.5), "1.5");
  assert.equal(formatUnitPrice(-1.5), "−1.5");
  assert.equal(formatUnitPrice(null), "—");
});

test("formatShare keeps the sign", () => {
  assert.equal(formatShare(0), "0%");
  assert.equal(formatShare(0.5), "50%");
  assert.equal(formatShare(0.125), "12.5%");
  assert.equal(formatShare(0.0025), "0.25%");
  assert.equal(formatShare(0.0005), "<0.1%");
  assert.equal(formatShare(-0.5), "−50%");
  assert.equal(formatShare(-0.0005), "−<0.1%");
});

test("formatAmount does not round a sub-micro amount to 0", () => {
  assert.equal(formatAmount(0.0000001), "0.0000001");
  assert.equal(formatAmount(0.00000012345), "0.0000001235");
  assert.equal(formatAmount(-0.0000001), "-0.0000001");
});

test("formatAmount keeps existing rendering for ordinary amounts", () => {
  assert.equal(formatAmount(null), "—");
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(0.123456), "0.123456");
  assert.equal(formatAmount(0.0000012), "0.000001");
  assert.equal(formatAmount(1.234), "1.23");
  assert.equal(formatAmount(99999), "99,999");
  assert.equal(formatAmount(100000), "100K");
});
