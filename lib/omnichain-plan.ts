/** Static testnet planning only. No endpoint addresses, signing or deploy authority. */
export const OMNI_TESTNETS = [{ id: 97, name: "BNB Smart Chain Testnet" }, { id: 84532, name: "Base Sepolia" }, { id: 11155111, name: "Ethereum Sepolia" }] as const;
const MAX_UINT64 = (1n << 64n) - 1n;
const UNIT = 10n ** 18n;
const SHARED_UNIT = 10n ** 6n;
const DUST_UNIT = UNIT / SHARED_UNIT;

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function wholeSupply(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,13}$/.test(value)) throw new Error("Supply must be a positive whole-token decimal string");
  const n = BigInt(value);
  if (n * SHARED_UNIT > MAX_UINT64) throw new Error("Supply exceeds shared-decimal capacity");
  return n;
}

export function planOmnichain(input: unknown) {
  if (!record(input) || Object.keys(input).some(k => !["name", "symbol", "globalSupply", "allocations"].includes(k))) throw new Error("Unknown or invalid plan fields");
  if (typeof input.name !== "string" || typeof input.symbol !== "string") throw new Error("Name and ticker are required");
  const name = input.name.trim(), symbol = input.symbol.trim();
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (!name || !symbol || bytes(name) > 64 || bytes(symbol) > 16 || /[\u0000-\u001f\u007f]/.test(input.name + input.symbol)) throw new Error("Invalid token identity");
  const supply = wholeSupply(input.globalSupply);
  if (!Array.isArray(input.allocations) || input.allocations.length < 2 || input.allocations.length > OMNI_TESTNETS.length) throw new Error("Choose two or three test networks");
  const seen = new Set<number>();
  const allocations = input.allocations.map((a: unknown) => {
    if (!record(a) || Object.keys(a).some(k => !["chainId", "supply"].includes(k)) || typeof a.chainId !== "number" || !OMNI_TESTNETS.some(c => c.id === a.chainId) || seen.has(a.chainId)) throw new Error("Unknown or duplicate test network");
    seen.add(a.chainId);
    const n = wholeSupply(a.supply);
    return { chainId: a.chainId, supply: n.toString(), supplyUnits: (n * UNIT).toString() };
  }).sort((a, b) => a.chainId - b.chainId);
  if (!seen.has(97)) throw new Error("BNB testnet must be included");
  if (allocations.reduce((sum, a) => sum + BigInt(a.supply), 0n) !== supply) throw new Error("Chain allocations must equal the global supply");
  return { schemaVersion: 1, engine: "omnichain-plan", name, symbol, globalSupply: supply.toString(), localDecimals: 18, sharedDecimals: 6, allocations, transactionReady: false, blockers: ["TOKEN_ENGINE_NOT_DEPLOYED", "MESSAGING_ROUTES_NOT_VERIFIED", "POOL_ADAPTERS_NOT_VERIFIED", "DEPLOYMENT_ORCHESTRATOR_NOT_IMPLEMENTED"] } as const;
}

/** For future receipt reconciliation: all terms use 18-decimal normalized units.
 * In-flight obligations must come from authenticated, finalized debits, not user input.
 */
export function reconcileOmnichainSupply(issued: bigint, localSupplies: readonly bigint[], inFlight: bigint, permanentlyBurned: bigint) {
  const values = [issued, ...localSupplies, inFlight, permanentlyBurned];
  if (!localSupplies.length || values.some(n => typeof n !== "bigint" || n < 0n || n > MAX_UINT64 * DUST_UNIT)) throw new Error("Invalid supply snapshot");
  const accounted = localSupplies.reduce((a, b) => a + b, 0n) + inFlight + permanentlyBurned;
  return { balanced: accounted === issued, accounted, issued };
}

export function quoteOmnichainUnits(amount: bigint) {
  if (typeof amount !== "bigint" || amount < 0n || amount > MAX_UINT64 * DUST_UNIT) throw new Error("Invalid bridge amount");
  const dust = amount % DUST_UNIT;
  return { transferable: amount - dust, dust };
}
