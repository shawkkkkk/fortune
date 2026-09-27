// Contract interfaces the trade panels call: the Fortune curve's trading and
// rescue surface, ERC-20s, wrapped BNB and PancakeSwap V3's router and quoter.

export const CURVE_TRADE_ABI = [
  { type: "function", name: "previewBuy", stateMutability: "view", inputs: [{ name: "quoteAsset", type: "address" }, { name: "amountIn", type: "uint256" }], outputs: [
    { name: "quoteSpent", type: "uint256" }, { name: "quoteRefund", type: "uint256" }, { name: "snipeTax", type: "uint256" }, { name: "normalFee", type: "uint256" },
    { name: "netQuote", type: "uint256" }, { name: "usdIn", type: "uint256" }, { name: "tokensOut", type: "uint256" },
  ] },
  { type: "function", name: "previewSell", stateMutability: "view", inputs: [{ name: "quoteAsset", type: "address" }, { name: "tokenAmount", type: "uint256" }], outputs: [
    { name: "grossQuote", type: "uint256" }, { name: "normalFee", type: "uint256" }, { name: "quoteOut", type: "uint256" }, { name: "usdGross", type: "uint256" },
  ] },
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "quoteAsset", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minTokensOut", type: "uint256" }], outputs: [{ name: "tokensOut", type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "quoteAsset", type: "address" }, { name: "tokenAmount", type: "uint256" }, { name: "minQuoteOut", type: "uint256" }], outputs: [{ name: "quoteOut", type: "uint256" }] },
  { type: "function", name: "shieldPurchased", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchTimestamp", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "graduationReadyAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "rescueActive", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "rescueSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rescueRedeemed", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserve", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "activateRescue", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "rescueRedeem", stateMutability: "nonpayable", inputs: [{ name: "tokenAmount", type: "uint256" }, { name: "minQuoteOut", type: "uint256[]" }], outputs: [{ name: "amountsOut", type: "uint256[]" }] },
  { type: "event", name: "Bought", inputs: [
    { name: "buyer", type: "address", indexed: true }, { name: "quoteAsset", type: "address", indexed: true }, { name: "quoteIn", type: "uint256", indexed: false },
    { name: "tokensOut", type: "uint256", indexed: false }, { name: "usdValue", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "BuyPartialFill", inputs: [
    { name: "buyer", type: "address", indexed: true }, { name: "quoteAsset", type: "address", indexed: true }, { name: "requestedQuoteIn", type: "uint256", indexed: false },
    { name: "spentQuoteIn", type: "uint256", indexed: false }, { name: "refundedQuoteIn", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "GraduationReady", inputs: [{ name: "reserveUsd", type: "uint256", indexed: false }] },
  { type: "event", name: "Sold", inputs: [
    { name: "seller", type: "address", indexed: true }, { name: "quoteAsset", type: "address", indexed: true }, { name: "tokensIn", type: "uint256", indexed: false },
    { name: "quoteOut", type: "uint256", indexed: false }, { name: "usdValue", type: "uint256", indexed: false },
  ] },
] as const;

export const ERC20_TRADE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] },
] as const;

export const WRAPPED_NATIVE_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
  { type: "event", name: "Withdrawal", inputs: [{ name: "src", type: "address", indexed: true }, { name: "wad", type: "uint256", indexed: false }] },
] as const;

const EXACT_INPUT_SINGLE = {
  type: "tuple",
  components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ],
} as const;

/** PancakeSwap V3 SwapRouter (v3-periphery): recipient 0 keeps the output in the router for unwrapWETH9. */
export const PANCAKE_V3_ROUTER_ABI = [
  { type: "function", name: "exactInputSingle", stateMutability: "payable", inputs: [{ name: "params", ...EXACT_INPUT_SINGLE }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "unwrapWETH9", stateMutability: "payable", inputs: [{ name: "amountMinimum", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [] },
  { type: "function", name: "multicall", stateMutability: "payable", inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ name: "results", type: "bytes[]" }] },
] as const;

export const PANCAKE_V3_QUOTER_ABI = [
  { type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }], outputs: [
    { name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" },
  ] },
] as const;

export const PANCAKE_V3_POOL_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" },
    { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint32" }, { name: "unlocked", type: "bool" },
  ] },
] as const;
