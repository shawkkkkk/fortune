import fs from "node:fs";

const ONE = 10n ** 18n;
const BPS = 10_000n;
const UINT120_MAX = (1n << 120n) - 1n;

function isqrt(n) {
  if (n < 0n) throw new Error("negative sqrt");
  if (n < 2n) return n;
  let x0 = 1n << BigInt((n.toString(2).length + 1) >> 1);
  let x1 = (x0 + n / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return x0;
}

function mulDiv(a, b, d) {
  if (d === 0n) throw new Error("division by zero");
  return (a * b) / d;
}

function tokensForUsd(base, slope, sold, usd) {
  const price0 = base + mulDiv(slope, sold, ONE);
  if (slope === 0n) return mulDiv(usd, ONE, price0);

  const radicand = price0 * price0 + 2n * slope * usd;
  const price1 = isqrt(radicand);
  if (price1 <= price0) return 0n;
  return mulDiv(price1 - price0, ONE, slope);
}

function usdForTokens(base, slope, sold, tokenAmount) {
  const nextSold = sold - tokenAmount;
  const currentPrice = base + mulDiv(slope, sold, ONE);
  const nextPrice = base + mulDiv(slope, nextSold, ONE);
  return mulDiv(currentPrice + nextPrice, tokenAmount, 2n * ONE);
}

function graduationState(base, slope, target) {
  if (slope === 0n) {
    const sold = mulDiv(target, ONE, base);
    return { sold, anchor: base };
  }

  const terminal = isqrt(base * base + 2n * slope * target);
  if (terminal <= base) return { sold: 0n, anchor: 0n };
  const sold = mulDiv(terminal - base, ONE, slope);
  const anchor = base + mulDiv(slope, sold, ONE);
  return { sold, anchor };
}

let seed = 0x465254554e45n;
function rand() {
  seed ^= seed << 13n;
  seed ^= seed >> 7n;
  seed ^= seed << 17n;
  seed &= (1n << 64n) - 1n;
  return seed;
}

function range(min, max) {
  return min + (rand() % (max - min + 1n));
}

const failures = [];
const samples = [];
const CASES = 50_000;

function fail(kind, detail) {
  if (failures.length < 100) failures.push({ kind, detail });
}

for (let i = 0; i < CASES; i += 1) {
  // This is intentionally broad and is not a proposed production policy.
  // It stresses arithmetic/economic invariants across plausible-to-extreme
  // launch shapes while the independent review determines approved bounds.
  const base = range(10n ** 8n, 1_000n * ONE);
  const slope = i % 17 === 0 ? 0n : range(1n, 10n ** 15n);
  const target = range(ONE, 10_000_000n * ONE);

  if (base > UINT120_MAX || slope > UINT120_MAX || target > UINT120_MAX) {
    fail("input-range", { i });
    continue;
  }

  const { sold, anchor } = graduationState(base, slope, target);
  if (sold === 0n || anchor === 0n) {
    fail("zero-graduation", { i });
    continue;
  }

  const lpTokens = mulDiv(target, ONE, anchor);
  const minimumSupply =
    mulDiv(sold + lpTokens, BPS + 1_000n, BPS);

  if (minimumSupply <= sold + lpTokens) {
    fail("supply-buffer", { i });
  }

  // Round-trip the entire output of a random USD buy before graduation.
  const buyUsd = range(1n, target);
  const bought = tokensForUsd(base, slope, 0n, buyUsd);
  if (bought > 0n) {
    const sellUsd = usdForTokens(base, slope, bought, bought);
    // Integer sqrt/flooring may only favor the protocol, not manufacture USD.
    if (sellUsd > buyUsd) {
      fail("round-trip-profit", {
        i,
        buyUsd: buyUsd.toString(),
        sellUsd: sellUsd.toString(),
      });
    }
  }

  // At the graduation anchor the LP inventory requirement must fit inside
  // the same 10% supply-buffer rule enforced by FortuneFactory.
  if (sold + lpTokens > minimumSupply) {
    fail("graduation-inventory", { i });
  }

  if (i < 25) {
    samples.push({
      basePriceUsd1e18: base.toString(),
      slopeUsd1e18: slope.toString(),
      graduationUsd1e18: target.toString(),
      soldAtGraduation: sold.toString(),
      anchorPriceUsd1e18: anchor.toString(),
      lpTokensAtGraduation: lpTokens.toString(),
      minimumSupply: minimumSupply.toString(),
    });
  }
}

const report = {
  model: "Fortune linear basket curve",
  generatedAt: new Date().toISOString(),
  cases: CASES,
  failures: failures.length,
  invariants: [
    "linear buy/sell round trip cannot create USD before fees",
    "graduation LP inventory fits the factory supply-buffer calculation",
    "graduation state produces non-zero sold amount and anchor",
  ],
  note:
    "This harness checks arithmetic/economic invariants. It does not establish safe production parameter bounds, oracle policy, liquidity depth, or MEV resistance.",
  samples,
  failureExamples: failures,
};

const output =
  process.env.FORTUNE_ECONOMIC_REPORT ||
  "/tmp/fortune-mainnet-economic-sim.json";
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");

console.log(
  `Fortune economic simulation: ${CASES} cases, ${failures.length} failures`
);
console.log(`Report: ${output}`);

if (failures.length > 0) process.exit(1);
