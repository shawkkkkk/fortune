import type { PublicClient } from "viem";
import { evaluateArbitrage, type ArbitrageCosts } from "@/lib/arbitrage-policy";
import { readV3MarketQuote, validateV3QuoteMarket, type V3QuoteMarket } from "@/lib/arbitrage-v3-quotes";

export type V3RouteObservationPolicy = {
  buyMarket: V3QuoteMarket; sellMarket: V3QuoteMarket; tokenUnits: bigint;
  costs: ArbitrageCosts; maxQuoteAgeMs: number; slippageBps: number; minProfit: bigint;
  mode: "prefunded" | "bridge-first"; sourceCash: bigint; destinationInventory: bigint;
};
const MAX = (1n << 128n) - 1n;
const amount = (v: unknown) => typeof v === "bigint" && v >= 0n && v <= MAX;

/** Explicit library observation only. Supplied costs/capital are not authenticated balances. */
export async function observeV3Arbitrage(
  clients: readonly [PublicClient, PublicClient], input: V3RouteObservationPolicy, clock: () => number = Date.now,
) {
  const p: V3RouteObservationPolicy = structuredClone(input);
  validateV3QuoteMarket(p?.buyMarket); validateV3QuoteMarket(p?.sellMarket);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (p.buyMarket.chainId === p.sellMarket.chainId || p.buyMarket.confirmations < 20 || p.sellMarket.confirmations < 20
    || !same(p.buyMarket.token.identity, p.sellMarket.token.identity) || p.buyMarket.token.decimals !== p.sellMarket.token.decimals
    || !same(p.buyMarket.settlement.identity, p.sellMarket.settlement.identity) || p.buyMarket.settlement.decimals !== p.sellMarket.settlement.decimals)
    throw Error("Distinct confirmed markets with matching identity and precision required");
  if (!amount(p.tokenUnits) || p.tokenUnits === 0n || !amount(p.minProfit) || !amount(p.sourceCash) || !amount(p.destinationInventory)
    || !p.costs || Object.keys(p.costs).sort().join() !== "bridge,gas,other,rebalance" || !Object.values(p.costs).every(amount)
    || !Number.isSafeInteger(p.maxQuoteAgeMs) || p.maxQuoteAgeMs < 1 || p.maxQuoteAgeMs > 60000
    || !Number.isInteger(p.slippageBps) || p.slippageBps < 0 || p.slippageBps > 10000
    || !["prefunded", "bridge-first"].includes(p.mode)) throw Error("Invalid route observation policy");
  const methods = new Set(["getChainId", "getBlockNumber", "getBlock", "getCode", "readContract", "simulateContract"]);
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]
    || Array.from(clients).some(c => !c || typeof c !== "object" || [...methods].some(k => typeof Reflect.get(c, k, c) !== "function")))
    throw Error("Two distinct complete route clients required");
  const start = clock(); let previous = start, ended = false, timer: ReturnType<typeof setTimeout> | undefined;
  const time = () => {
    const now = clock();
    if (ended || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < previous || now - start > 20000)
      throw Error("Route observation ended, expired or clock moved backwards");
    previous = now; return now;
  };
  const guarded = clients.map(client => new Proxy(client, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof key !== "string" || !methods.has(key) || typeof value !== "function") return value;
    return async (...args: unknown[]) => { time(); const result = await value.apply(target, args); time(); return result; };
  } })) as [PublicClient, PublicClient];
  try {
    time(); const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Route observation timed out")), 20000); });
    return await Promise.race([(async () => {
      const [buy, sell] = await Promise.all([
        readV3MarketQuote(guarded[0], p.buyMarket, "buy", p.tokenUnits, time),
        readV3MarketQuote(guarded[1], p.sellMarket, "sell", p.tokenUnits, time),
      ]);
      await Promise.all(([buy, sell] as const).map(async (observation, i) => {
        const [header, chain] = await Promise.all([guarded[i].getBlock({ blockNumber: observation.blockNumber }), guarded[i].getChainId()]);
        if (chain !== observation.quote.chainId || header.number !== observation.blockNumber || header.hash !== observation.blockHash
          || Number(header.timestamp) * 1000 !== observation.quote.quotedAtMs) throw Error("Route snapshot changed before combination");
      }));
      const observedAtMs = time();
      for (const [observation, market] of [[buy, p.buyMarket], [sell, p.sellMarket]] as const) {
        const age = observedAtMs - observation.quote.quotedAtMs;
        if (age < 0 || age > market.maxBlockAgeMs || age > p.maxQuoteAgeMs) throw Error("Route quote expired before combination");
      }
      const evaluation = evaluateArbitrage({ ...p, buy: buy.quote, sell: sell.quote, nowMs: observedAtMs });
      return { buy, sell, evaluation, observedAtMs, source: "isolated-two-network-v3-route-observation",
        costsVerified: false, capitalVerified: false, inventoryVerified: false, independentProvidersVerified: false,
        finalityVerified: false, realizedProfitVerified: false, routeExecutionVerified: false,
        currentAuthorization: null, executionAuthorized: false, fullStrategyReadiness: false };
    })(), deadline]);
  } finally { ended = true; clearTimeout(timer); }
}
