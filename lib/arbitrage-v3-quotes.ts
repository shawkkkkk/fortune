import { concat, isAddress, keccak256, parseAbi, toHex, type Address, type Hex, type PublicClient } from "viem";
import type { ArbitrageQuote } from "./arbitrage-policy";

// QuoterV2 tuple layouts follow PancakeSwap's IQuoterV2. Only eth_call is used.
export const ARBITRAGE_V3_ABI = parseAbi([
  "function factory() view returns (address)",
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function decimals() view returns (uint8)",
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

type ContractPin = { address: Address; codeHash: Hex };
type AssetPin = ContractPin & { decimals: number; identity: Hex; profile: "plain-erc20" };
/** Operator-reviewed configuration, never a public request's claimed identity mapping.
 * Code hashes alone do not establish token behavior or bridge redeemability.
 */
export type V3QuoteMarket = {
  chainId: 97 | 84532 | 11155111;
  factory: ContractPin;
  quoter: ContractPin;
  token: AssetPin;
  settlement: AssetPin;
  fee: number;
  confirmations: number;
  maxBlockAgeMs: number;
};
const MAX = (1n << 128n) - 1n;
const QUOTE_GAS_LIMIT = 2_000_000n;
function hash(value: unknown): value is Hex { return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/i.test(value); }
function address(value: unknown): value is Address { return typeof value === "string" && isAddress(value, { strict: false }) && !/^0x0{40}$/i.test(value); }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function positive(value: unknown): value is bigint { return typeof value === "bigint" && value > 0n && value <= MAX; }

export function validateV3QuoteMarket(m: V3QuoteMarket) {
  if (!m || ![97, 84532, 11155111].includes(m.chainId)) throw new Error("Quote adapter requires an allowlisted testnet");
  for (const pin of [m.factory, m.quoter, m.token, m.settlement]) {
    if (!pin || !address(pin.address) || !hash(pin.codeHash)) throw new Error("Reviewed contract address and runtime hash required");
  }
  if (new Set([m.factory, m.quoter, m.token, m.settlement].map(p => p.address.toLowerCase())).size !== 4) throw new Error("Contract roles must be distinct");
  for (const asset of [m.token, m.settlement]) {
    if (!hash(asset.identity) || asset.profile !== "plain-erc20" || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 18) throw new Error("Reviewed plain-token identity and precision required");
  }
  if (same(m.token.identity, m.settlement.identity)) throw new Error("Trading and settlement assets must differ");
  if (!Number.isInteger(m.fee) || m.fee <= 0 || m.fee >= 1_000_000) throw new Error("Invalid V3 fee tier");
  if (!Number.isInteger(m.confirmations) || m.confirmations < 1 || m.confirmations > 256
    || !Number.isInteger(m.maxBlockAgeMs) || m.maxBlockAgeMs < 1 || m.maxBlockAgeMs > 60_000) throw new Error("Invalid block freshness policy");
}

/** Snapshot observation only: no wallet, allowance, router calldata or execution authority.
 * Buy uses exact OUTPUT and sell exact INPUT for the same raw token quantity.
 * Settlement units are the reviewed asset's own units, never a dollar-price estimate.
 */
export async function readV3MarketQuote(
  client: PublicClient, market: V3QuoteMarket, side: "buy" | "sell", tokenUnits: bigint,
  clock: () => number = Date.now,
) {
  // Copy configuration before awaits so concurrent caller mutation cannot change the read.
  const m: V3QuoteMarket = structuredClone(market);
  validateV3QuoteMarket(m);
  if ((side !== "buy" && side !== "sell") || !positive(tokenUnits)) throw new Error("Invalid quote direction or token quantity");
  const startedAt = clock();
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) throw new Error("Invalid observation clock");
  if (await client.getChainId() !== m.chainId) throw new Error("RPC chain differs from market");
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const depth = BigInt(m.confirmations);
  if (head < depth) throw new Error("Insufficient chain history");
  const blockNumber = head - depth;
  const block = await client.getBlock({ blockNumber });
  const timestampMs = Number(block.timestamp) * 1000;
  if (block.number !== blockNumber || !hash(block.hash) || !Number.isSafeInteger(timestampMs)
    || timestampMs > startedAt || startedAt - timestampMs > m.maxBlockAgeMs) throw new Error("Stale, future or missing snapshot block");
  const at = { blockNumber };
  await Promise.all([m.factory, m.quoter, m.token, m.settlement].map(async pin => {
    const code = await client.getCode({ address: pin.address, ...at });
    if (!code || code === "0x" || !same(keccak256(code), pin.codeHash)) throw new Error("Contract runtime differs from reviewed manifest");
  }));
  const read = (target: Address, functionName: "factory" | "token0" | "token1" | "fee" | "liquidity" | "decimals") =>
    client.readContract({ address: target, abi: ARBITRAGE_V3_ABI, functionName, ...at });
  const [quoterFactory, tokenDecimals, settlementDecimals, pool] = await Promise.all([
    read(m.quoter.address, "factory"), read(m.token.address, "decimals"), read(m.settlement.address, "decimals"),
    client.readContract({ address: m.factory.address, abi: ARBITRAGE_V3_ABI, functionName: "getPool", args: [m.token.address, m.settlement.address, m.fee], ...at }),
  ]);
  if (typeof quoterFactory !== "string" || !same(quoterFactory, m.factory.address)) throw new Error("Quoter factory mismatch");
  if (tokenDecimals !== m.token.decimals || settlementDecimals !== m.settlement.decimals) throw new Error("Asset precision mismatch");
  if (!address(pool)) throw new Error("Canonical pool unavailable");
  const [poolCode, poolFactory, token0, token1, fee, liquidity] = await Promise.all([
    client.getCode({ address: pool, ...at }), read(pool, "factory"), read(pool, "token0"), read(pool, "token1"), read(pool, "fee"), read(pool, "liquidity"),
  ]);
  const expectedTokens = [m.token.address, m.settlement.address].map(v => v.toLowerCase()).sort();
  if (!poolCode || poolCode === "0x" || typeof poolFactory !== "string" || !same(poolFactory, m.factory.address)
    || typeof token0 !== "string" || typeof token1 !== "string"
    || !same(token0, expectedTokens[0]) || !same(token1, expectedTokens[1]) || fee !== m.fee
    || typeof liquidity !== "bigint" || liquidity <= 0n) throw new Error("Canonical pool identity or active liquidity invalid");
  const tokenIn = side === "buy" ? m.settlement.address : m.token.address;
  const tokenOut = side === "buy" ? m.token.address : m.settlement.address;
  const common = { tokenIn, tokenOut, fee: m.fee, sqrtPriceLimitX96: 0n };
  const result = side === "buy"
    ? await client.simulateContract({ address: m.quoter.address, abi: ARBITRAGE_V3_ABI, functionName: "quoteExactOutputSingle", args: [{ ...common, amount: tokenUnits }], gas: QUOTE_GAS_LIMIT, ...at })
    : await client.simulateContract({ address: m.quoter.address, abi: ARBITRAGE_V3_ABI, functionName: "quoteExactInputSingle", args: [{ ...common, amountIn: tokenUnits }], gas: QUOTE_GAS_LIMIT, ...at });
  const [quoteAmount, sqrtPriceAfter, ticksCrossed, gasEstimate] = result.result;
  if (!positive(quoteAmount) || !positive(gasEstimate) || sqrtPriceAfter <= 0n) throw new Error("Zero or unbounded quote result");
  const [confirmed, chainId] = await Promise.all([client.getBlock({ blockNumber }), client.getChainId()]);
  const finishedAt = clock();
  if (chainId !== m.chainId || confirmed.number !== blockNumber || confirmed.hash !== block.hash || confirmed.timestamp !== block.timestamp) throw new Error("Snapshot changed during quote");
  if (!Number.isSafeInteger(finishedAt) || finishedAt < startedAt || finishedAt - timestampMs > m.maxBlockAgeMs) throw new Error("Quote expired during observation");
  const quote: ArbitrageQuote = {
    chainId: m.chainId, tokenIdentity: keccak256(concat([m.token.identity, toHex(m.token.decimals, { size: 1 })])), tokenUnits,
    accountingAsset: keccak256(concat([m.settlement.identity, toHex(m.settlement.decimals, { size: 1 })])).slice(2),
    // Block time, not request completion time: an old state must not become fresh.
    quoteAmount, quotedAtMs: timestampMs,
  };
  return {
    quote, side, tokenDecimals: m.token.decimals, settlementDecimals: m.settlement.decimals,
    pool, blockNumber, blockHash: block.hash, observedAtMs: finishedAt,
    gasEstimate, ticksCrossed, sqrtPriceAfter, executionAuthorized: false as const,
  };
}
