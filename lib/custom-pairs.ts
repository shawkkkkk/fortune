import { getAddress, isAddress, type Address } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// Custom pairs beta: launches paired with any BEP-20, including transfer-tax
// tokens. The contracts in contracts-custom-pairs/ are UNAUDITED, so the site
// never enables them on BNB Smart Chain mainnet, whatever the environment says.

const configuredFactory = (process.env.NEXT_PUBLIC_FORTUNE_CUSTOM_PAIR_FACTORY_ADDRESS || "").trim();
const configuredTestTokens = (process.env.NEXT_PUBLIC_FORTUNE_CUSTOM_PAIR_TEST_TOKENS || "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => isAddress(value))
  .map((value) => getAddress(value));

export const CUSTOM_PAIRS = {
  chainId: FORTUNE_NETWORK.chainId,
  factory: isAddress(configuredFactory) ? (getAddress(configuredFactory) as Address) : null,
  /** Faucet tokens deployed with the beta (tSTONK with a 5% transfer tax, tSHARE without). */
  testTokens: configuredTestTokens as Address[],
  enabled: isAddress(configuredFactory) && FORTUNE_NETWORK.chainId === 97,
} as const;

/** Mirrors FortuneCustomPairCurve / FortuneCustomPairFactory constants. */
export const CUSTOM_PAIR_RULES = {
  bps: 10_000,
  virtualReserveDivisor: 3n,
  /** Price at graduation divided by the opening price: (1 + 3)^2. */
  priceMultiple: 16,
  soldAtTargetBps: 7_500,
  poolShareBps: 1_875,
  burnedShareBps: 625,
  snipeTaxStartBps: 9_900,
  snipeTaxSeconds: 5,
  earlyWalletCapBps: 200,
  earlyWalletCapSeconds: 15,
  rescueDelaySeconds: 7 * 24 * 60 * 60,
  maxCreatorFeeBps: 100,
  maxProtocolFeeBps: 100,
  minSupply: 1_000_000n * 10n ** 18n,
  maxSupply: 1_000_000_000_000n * 10n ** 18n,
  minTarget: 1_000n,
  maxTarget: 2n ** 100n,
  maxPairDecimals: 36,
} as const;

export const CUSTOM_PAIR_PHASES = ["CurveActive", "GraduationReady", "Graduated", "Rescued"] as const;
export type CustomPairPhase = (typeof CUSTOM_PAIR_PHASES)[number];

export function customPhase(value: number | bigint): CustomPairPhase {
  return CUSTOM_PAIR_PHASES[Number(value)] ?? "CurveActive";
}

/** Same decay as the curve: 9900 >> (elapsed * 14 / 5), zero from five seconds. */
export function shieldBpsAt(elapsedSeconds: number) {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  if (elapsed >= CUSTOM_PAIR_RULES.snipeTaxSeconds) return 0;
  const shift = Math.floor((elapsed * 14) / CUSTOM_PAIR_RULES.snipeTaxSeconds);
  return shift >= 14 ? 0 : CUSTOM_PAIR_RULES.snipeTaxStartBps >> shift;
}

/** The curve's buy split for what it received: shield first, then each fee on the rest. */
export function splitBuy(received: bigint, shieldBps: number, protocolFeeBps: number, creatorFeeBps: number) {
  const bps = BigInt(CUSTOM_PAIR_RULES.bps);
  const shield = (received * BigInt(shieldBps)) / bps;
  const afterShield = received - shield;
  const protocolFee = (afterShield * BigInt(protocolFeeBps)) / bps;
  const creatorFee = (afterShield * BigInt(creatorFeeBps)) / bps;
  return { shield, protocolFee, creatorFee, net: afterShield - protocolFee - creatorFee };
}

/** sold(R + net) - sold(R) for a curve with supply S and virtual reserve a0, rounded down. */
export function tokensForNet(supply: bigint, virtualReserve: bigint, reserve: bigint, net: bigint) {
  if (net <= 0n) return 0n;
  const d = virtualReserve + reserve;
  return (supply * virtualReserve * net) / (d * (d + net));
}

/** Pair tokens released by selling `tokens` back: t * D^2 / (S * a0 + t * D), rounded down. */
export function pairForTokens(supply: bigint, virtualReserve: bigint, reserve: bigint, tokens: bigint) {
  if (tokens <= 0n) return 0n;
  const d = virtualReserve + reserve;
  return (tokens * d * d) / (supply * virtualReserve + tokens * d);
}

/** Mirrors FortuneCustomPairCurve.previewBuy for what the curve receives, including the final-buy clamp. */
export function previewCurveBuy(input: {
  supply: bigint;
  virtualReserve: bigint;
  reserve: bigint;
  target: bigint;
  received: bigint;
  shieldBps: number;
  protocolFeeBps: number;
  creatorFeeBps: number;
}) {
  const bps = BigInt(CUSTOM_PAIR_RULES.bps);
  let used = input.received;
  let split = splitBuy(used, input.shieldBps, input.protocolFeeBps, input.creatorFeeBps);
  const remaining = input.target > input.reserve ? input.target - input.reserve : 0n;
  if (split.net > remaining) {
    const denominator = (bps - BigInt(input.shieldBps)) * (bps - BigInt(input.protocolFeeBps + input.creatorFeeBps));
    const needed = remaining === 0n ? 0n : (remaining * bps * bps + denominator - 1n) / denominator;
    if (needed < used) {
      used = needed;
      split = splitBuy(used, input.shieldBps, input.protocolFeeBps, input.creatorFeeBps);
    }
  }
  return {
    used,
    refund: input.received - used,
    ...split,
    tokens: tokensForNet(input.supply, input.virtualReserve, input.reserve, split.net),
    completesCurve: input.reserve + split.net >= input.target,
  };
}

/** Pair base units per whole launch token, scaled by 1e18, at reserve R. */
export function spotPriceX18(supply: bigint, virtualReserve: bigint, reserve: bigint) {
  const d = virtualReserve + reserve;
  return (d * d * 10n ** 36n) / (supply * virtualReserve);
}

/** Tokens a creator's first buy returns inside the launch transaction (Launch Shield at 99%). */
export function firstBuyTokens(input: {
  supply: bigint;
  target: bigint;
  received: bigint;
  protocolFeeBps: number;
  creatorFeeBps: number;
}) {
  const virtualReserve = input.target / CUSTOM_PAIR_RULES.virtualReserveDivisor;
  const split = splitBuy(input.received, CUSTOM_PAIR_RULES.snipeTaxStartBps, input.protocolFeeBps, input.creatorFeeBps);
  const net = split.net > input.target ? input.target : split.net;
  return { ...split, tokens: tokensForNet(input.supply, virtualReserve, 0n, net) };
}

/** Amount that arrives after a measured transfer tax, rounded down. */
export function afterTax(amount: bigint, taxBps: number) {
  return amount - (amount * BigInt(Math.max(0, Math.min(10_000, taxBps)))) / 10_000n;
}
