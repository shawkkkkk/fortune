/** Testnet research accounting only. No quotes are authenticated and no trades are authorized here. */
const MAX = (1n << 128n) - 1n;
const TESTNETS = new Set([97, 84532, 11155111]);
const BPS = 10_000n;
function amount(n: bigint) { if (typeof n !== "bigint" || n < 0n || n > MAX) throw new Error("Invalid accounting amount"); return n; }
function bps(n: number) { if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new Error("Invalid basis points"); return BigInt(n); }

export type ArbitrageQuote = {
  chainId: number;
  tokenIdentity: string;
  tokenUnits: bigint;
  accountingAsset: string;
  quoteAmount: bigint;
  quotedAtMs: number;
};
export type ArbitrageCosts = { gas: bigint; bridge: bigint; rebalance: bigint; other: bigint };
function costs(c: ArbitrageCosts) { return amount(c.gas) + amount(c.bridge) + amount(c.rebalance) + amount(c.other); }

export function evaluateArbitrage(input: {
  buy: ArbitrageQuote; sell: ArbitrageQuote; costs: ArbitrageCosts;
  nowMs: number; maxQuoteAgeMs: number; slippageBps: number; minProfit: bigint;
  mode: "prefunded" | "bridge-first"; sourceCash: bigint; destinationInventory: bigint;
}) {
  const { buy, sell } = input;
  if (!TESTNETS.has(buy.chainId) || !TESTNETS.has(sell.chainId) || buy.chainId === sell.chainId) throw new Error("Distinct supported testnets required");
  if (!/^0x[0-9a-fA-F]{64}$/.test(buy.tokenIdentity) || buy.tokenIdentity.toLowerCase() !== sell.tokenIdentity.toLowerCase()) throw new Error("Canonical token identities differ");
  if (!buy.accountingAsset || buy.accountingAsset.length > 64 || buy.accountingAsset !== sell.accountingAsset) throw new Error("Use one exact accounting denomination");
  if (amount(buy.tokenUnits) === 0n || buy.tokenUnits !== sell.tokenUnits || amount(buy.quoteAmount) === 0n || amount(sell.quoteAmount) === 0n) throw new Error("Quotes must cover the same nonzero token amount");
  if (![input.nowMs, input.maxQuoteAgeMs, buy.quotedAtMs, sell.quotedAtMs].every(Number.isSafeInteger)
    || input.nowMs < 0 || input.maxQuoteAgeMs <= 0 || input.maxQuoteAgeMs > 60_000
    || buy.quotedAtMs < 0 || sell.quotedAtMs < 0) throw new Error("Invalid quote clock");
  if (input.mode !== "prefunded" && input.mode !== "bridge-first") throw new Error("Unknown execution model");
  const slip = bps(input.slippageBps);
  const buyCeiling = (buy.quoteAmount * (BPS + slip) + BPS - 1n) / BPS;
  const sellFloor = sell.quoteAmount * (BPS - slip) / BPS;
  const totalCosts = costs(input.costs);
  const net = sellFloor - buyCeiling - totalCosts;
  const reasons: string[] = [];
  if ([buy.quotedAtMs, sell.quotedAtMs].some(t => t > input.nowMs || input.nowMs - t > input.maxQuoteAgeMs)) reasons.push("STALE_OR_FUTURE_QUOTE");
  if (amount(input.sourceCash) < buyCeiling + totalCosts) reasons.push("SOURCE_CASH_INSUFFICIENT");
  if (amount(input.destinationInventory) < buy.tokenUnits) reasons.push("DESTINATION_INVENTORY_INSUFFICIENT");
  if (net <= 0n || net < amount(input.minProfit)) reasons.push("NET_SPREAD_TOO_SMALL");
  if (input.mode === "bridge-first") reasons.push("FUTURE_DESTINATION_PRICE_NOT_LOCKED");
  return { candidate: reasons.length === 0, executionAuthorized: false as const, buyCeiling, sellFloor, totalCosts, modeledNet: net, reasons };
}

export type ProfitLedger = {
  policy: { accountingAsset: string; buybackBps: number };
  processedCycles: readonly string[];
  processedReceipts: readonly string[];
  lossCarry: bigint;
  buybackBudget: bigint;
  retainedProfit: bigint;
};
export function emptyProfitLedger(accountingAsset: string, buybackBps: number): ProfitLedger {
  if (typeof accountingAsset !== "string" || !/^[A-Za-z0-9:_-]{1,64}$/.test(accountingAsset)) throw new Error("Invalid accounting denomination");
  bps(buybackBps);
  return { policy: { accountingAsset, buybackBps }, processedCycles: [], processedReceipts: [], lossCarry: 0n, buybackBudget: 0n, retainedProfit: 0n };
}
export type ReconciledCycle = {
  id: string;
  accountingAsset: string;
  receiptIds: readonly string[];
  reconciled: boolean;
  inventoryDelta: bigint;
  proceeds: bigint;
  purchaseCost: bigint;
  costs: ArbitrageCosts;
};

/** Caller must authenticate receipts and persist the returned ledger atomically.
 * This pure reducer cannot attest chain state, custody or ledger durability.
 * Allocating a buyback budget is NOT a successful buyback or burn.
 */
export function allocateRealizedProfit(ledger: ProfitLedger, cycle: ReconciledCycle): ProfitLedger {
  const share = bps(ledger.policy.buybackBps);
  if (typeof ledger.policy.accountingAsset !== "string" || !/^[A-Za-z0-9:_-]{1,64}$/.test(ledger.policy.accountingAsset) || cycle.accountingAsset !== ledger.policy.accountingAsset) throw new Error("Settlement denomination differs from policy");
  amount(ledger.lossCarry); amount(ledger.buybackBudget); amount(ledger.retainedProfit);
  if (cycle.reconciled !== true || cycle.inventoryDelta !== 0n || !/^[A-Za-z0-9_-]{1,80}$/.test(cycle.id)) throw new Error("Cycle must be reconciled with no unmatched inventory");
  if (ledger.processedCycles.includes(cycle.id)) throw new Error("Cycle already processed");
  if (cycle.receiptIds.length < 1 || cycle.receiptIds.length > 32 || new Set(cycle.receiptIds).size !== cycle.receiptIds.length
    || cycle.receiptIds.some(r => !/^(97|84532|11155111):0x[0-9a-f]{64}:[0-9]{1,8}$/.test(r) || ledger.processedReceipts.includes(r))) throw new Error("Invalid or reused receipt identity");
  const net = amount(cycle.proceeds) - amount(cycle.purchaseCost) - costs(cycle.costs);
  const recovered = net > 0n ? (net < ledger.lossCarry ? net : ledger.lossCarry) : 0n;
  const distributable = net > 0n ? net - recovered : 0n;
  const buyback = distributable * share / BPS;
  const next = {
    policy: { ...ledger.policy },
    processedCycles: [...ledger.processedCycles, cycle.id],
    processedReceipts: [...ledger.processedReceipts, ...cycle.receiptIds],
    lossCarry: net < 0n ? ledger.lossCarry - net : ledger.lossCarry - recovered,
    buybackBudget: ledger.buybackBudget + buyback,
    retainedProfit: ledger.retainedProfit + distributable - buyback,
  };
  amount(next.lossCarry); amount(next.buybackBudget); amount(next.retainedProfit);
  return next;
}
