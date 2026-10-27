import { decodeEventLog, isAddress, keccak256, parseAbi, parseAbiItem, stringToHex, type Address, type Hex, type PublicClient } from "viem";

export const FILL_EVENTS = [
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
  parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)"),
  parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"),
] as const;
export const FILL_READ_ABI = parseAbi([
  "function factory() view returns (address)", "function token0() view returns (address)", "function token1() view returns (address)",
  "function fee() view returns (uint24)", "function decimals() view returns (uint8)",
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
]);
type Pin = { address: Address; codeHash: Hex };
export type FillMarket = {
  chainId: 97 | 84532 | 11155111;
  wallet: Address; router: Pin; factory: Pin; pool: Pin;
  token: Pin & { decimals: number }; settlement: Pin & { decimals: number };
  fee: number; confirmations: number; eventKind: "pancake-v3" | "uniswap-v3";
};
export type VerifiedFill = Readonly<{
  receiptId: string; chainId: number; transactionHash: Hex; blockNumber: string; blockHash: Hex; swapLogIndex: number;
  marketHash: Hex; receiptDigest: Hex; wallet: Address; pool: Address; token: Address; settlement: Address;
  tokenDecimals: number; settlementDecimals: number; side: "buy" | "sell";
  tokenUnits: string; settlementUnits: string; nativeGasCost: string; observedAtMs: number;
  executionAuthorized: false;
}>;
const approved = new WeakSet<object>();
export const isVerifiedFill = (value: unknown): value is VerifiedFill => typeof value === "object" && value !== null && approved.has(value);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/.test(v);
const address = (v: unknown): v is Address => typeof v === "string" && isAddress(v, { strict: false }) && !/^0x0{40}$/.test(v);
const MAX = (1n << 128n) - 1n;
const positive = (n: bigint) => { if (n <= 0n || n > MAX) throw new Error("Fill amount out of bounds"); return n; };
const digest = (value: unknown) => keccak256(stringToHex(JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v)));

export function fillMarketHash(m: FillMarket): Hex {
  if (![97, 84532, 11155111].includes(m.chainId) || !address(m.wallet)) throw new Error("Testnet strategy wallet required");
  if (m.chainId === 84532) throw new Error("Base receipt fee accounting requires a separate L1/data-fee adapter");
  const pins = [m.router, m.factory, m.pool, m.token, m.settlement];
  if (pins.some(p => !p || !address(p.address) || !hash(p.codeHash))
    || new Set([...pins.map(p => p.address.toLowerCase()), m.wallet.toLowerCase()]).size !== 6) throw new Error("Distinct reviewed contract pins required");
  if (![m.token.decimals, m.settlement.decimals].every(n => Number.isInteger(n) && n >= 0 && n <= 18)
    || !Number.isInteger(m.fee) || m.fee <= 0 || m.fee >= 1_000_000
    || !Number.isInteger(m.confirmations) || m.confirmations < 1 || m.confirmations > 256
    || !["pancake-v3", "uniswap-v3"].includes(m.eventKind)) throw new Error("Invalid receipt verification policy");
  // Fixed field order and normalized addresses/hashes make a stable configuration fingerprint.
  return digest([m.chainId, m.wallet.toLowerCase(), ...pins.flatMap(p => [p.address.toLowerCase(), p.codeHash.toLowerCase()]), m.token.decimals, m.settlement.decimals, m.fee, m.confirmations, m.eventKind]);
}

async function observe(client: PublicClient, m: FillMarket, txHash: Hex) {
  if (await client.getChainId() !== m.chainId) throw new Error("Receipt RPC chain mismatch");
  const [receipt, tx, head] = await Promise.all([
    client.getTransactionReceipt({ hash: txHash }), client.getTransaction({ hash: txHash }), client.getBlockNumber({ cacheTime: 0 }),
  ]);
  if (receipt.status !== "success" || !same(receipt.transactionHash, txHash) || !same(tx.hash, txHash)
    || receipt.blockNumber < 0n || head < receipt.blockNumber + BigInt(m.confirmations)
    || !same(receipt.from, m.wallet) || !receipt.to || !same(receipt.to, m.router.address)
    || !same(tx.from, m.wallet) || !tx.to || !same(tx.to, m.router.address) || tx.value !== 0n
    || !["legacy", "eip2930", "eip1559"].includes(tx.type) || (receipt.blobGasUsed ?? 0n) !== 0n
    || tx.blockNumber !== receipt.blockNumber || tx.blockHash !== receipt.blockHash
    || !hash(receipt.blockHash) || receipt.logs.length > 256
    || receipt.logs.some(l => l.removed || l.blockHash !== receipt.blockHash || l.blockNumber !== receipt.blockNumber || !same(l.transactionHash, txHash)
      || !Number.isSafeInteger(l.logIndex) || l.logIndex < 0 || l.logIndex > 99_999_999)
    || new Set(receipt.logs.map(l => l.logIndex)).size !== receipt.logs.length) throw new Error("Receipt provenance, depth or wallet mismatch");
  const blockNumber = receipt.blockNumber;
  const block = await client.getBlock({ blockNumber });
  if (block.number !== blockNumber || block.hash !== receipt.blockHash) throw new Error("Receipt block is not canonical");
  await Promise.all([m.router, m.factory, m.pool, m.token, m.settlement].map(async p => {
    const code = await client.getCode({ address: p.address, blockNumber });
    if (!code || code === "0x" || !same(keccak256(code), p.codeHash)) throw new Error("Receipt contract runtime mismatch");
  }));
  const read = (target: Address, functionName: "factory" | "token0" | "token1" | "fee" | "decimals") => client.readContract({ address: target, abi: FILL_READ_ABI, functionName, blockNumber });
  const [pool, factory, token0, token1, fee, td, sd] = await Promise.all([
    client.readContract({ address: m.factory.address, abi: FILL_READ_ABI, functionName: "getPool", args: [m.token.address, m.settlement.address, m.fee], blockNumber }),
    read(m.pool.address, "factory"), read(m.pool.address, "token0"), read(m.pool.address, "token1"), read(m.pool.address, "fee"),
    read(m.token.address, "decimals"), read(m.settlement.address, "decimals"),
  ]);
  const tokens = [m.token.address, m.settlement.address].map(a => a.toLowerCase()).sort();
  if (!same(pool, m.pool.address) || typeof factory !== "string" || !same(factory, m.factory.address)
    || typeof token0 !== "string" || typeof token1 !== "string" || !same(token0, tokens[0]) || !same(token1, tokens[1])
    || fee !== m.fee || td !== m.token.decimals || sd !== m.settlement.decimals) throw new Error("Receipt pool identity mismatch");
  const swapEvent = FILL_EVENTS[m.eventKind === "pancake-v3" ? 1 : 2];
  const swaps = receipt.logs.filter(l => same(l.address, m.pool.address)).flatMap(l => {
    try { const event = decodeEventLog({ abi: [swapEvent], data: l.data, topics: l.topics, strict: true }); return [{ log: l, args: event.args }]; }
    catch { return []; }
  });
  if (swaps.length !== 1) throw new Error("One unambiguous venue swap required");
  const { log, args } = swaps[0];
  if (!same(args.sender, m.router.address) || !same(args.recipient, m.wallet)) throw new Error("Swap custody mismatch");
  const tokenDelta = same(token0, m.token.address) ? args.amount0 : args.amount1;
  const settlementDelta = same(token0, m.token.address) ? args.amount1 : args.amount0;
  if (!((tokenDelta < 0n && settlementDelta > 0n) || (tokenDelta > 0n && settlementDelta < 0n))) throw new Error("Swap direction mismatch");
  let walletToken = 0n, walletSettlement = 0n;
  let transferCount = 0;
  for (const l of receipt.logs) {
    let transfer;
    try { transfer = decodeEventLog({ abi: [FILL_EVENTS[0]], data: l.data, topics: l.topics, strict: true }).args; }
    catch { continue; }
    const { from, to, value } = transfer;
    if (!same(from, m.wallet) && !same(to, m.wallet)) continue;
    if ((!same(l.address, m.token.address) && !same(l.address, m.settlement.address))
      || (same(from, m.wallet) ? !same(to, m.pool.address) : !same(from, m.pool.address))) throw new Error("Unexplained strategy wallet transfer");
    transferCount++;
    const delta = same(to, m.wallet) ? value : -value;
    if (same(l.address, m.token.address)) walletToken += delta; else walletSettlement += delta;
  }
  if (transferCount !== 2 || walletToken !== -tokenDelta || walletSettlement !== -settlementDelta) throw new Error("Swap and wallet transfers do not reconcile");
  const gasCost = positive(receipt.gasUsed * receipt.effectiveGasPrice);
  const after = await client.getBlock({ blockNumber });
  if (await client.getChainId() !== m.chainId || after.number !== blockNumber || after.hash !== block.hash) throw new Error("Receipt reorged during verification");
  return {
    receiptDigest: digest([receipt.status, txHash.toLowerCase(), receipt.blockNumber, receipt.blockHash.toLowerCase(), receipt.from.toLowerCase(), receipt.to.toLowerCase(),
      receipt.gasUsed, receipt.effectiveGasPrice, tx.type, tx.input, tx.value,
      [...receipt.logs].sort((a, b) => a.logIndex - b.logIndex).map(l => [l.logIndex, l.address.toLowerCase(), l.data.toLowerCase(), l.topics.map(t => t.toLowerCase())])]),
    receiptId: `${m.chainId}:${txHash.toLowerCase()}:${log.logIndex}`, chainId: m.chainId, transactionHash: txHash.toLowerCase() as Hex,
    blockNumber: blockNumber.toString(), blockHash: receipt.blockHash, swapLogIndex: log.logIndex,
    wallet: m.wallet.toLowerCase() as Address, pool: m.pool.address.toLowerCase() as Address,
    token: m.token.address.toLowerCase() as Address, settlement: m.settlement.address.toLowerCase() as Address,
    tokenDecimals: m.token.decimals, settlementDecimals: m.settlement.decimals,
    side: tokenDelta < 0n ? "buy" as const : "sell" as const,
    tokenUnits: positive(tokenDelta < 0n ? -tokenDelta : tokenDelta).toString(),
    settlementUnits: positive(settlementDelta < 0n ? -settlementDelta : settlementDelta).toString(), nativeGasCost: gasCost.toString(),
  };
}

/** Two separately configured trusted RPC clients must independently agree.
 * This is RPC-backed evidence, not a receipt Merkle proof or independent-provider attestation.
 */
export async function readVerifiedFill(clients: readonly [PublicClient, PublicClient], market: FillMarket, txHash: Hex): Promise<VerifiedFill> {
  const m = structuredClone(market), marketHash = fillMarketHash(m);
  if (!hash(txHash) || clients[0] === clients[1]) throw new Error("Transaction hash and two distinct RPC clients required");
  const start = Date.now();
  const observations = await Promise.all(clients.map(c => observe(c, m, txHash)));
  if (Date.now() - start > 60_000 || digest(observations[0]) !== digest(observations[1])) throw new Error("Receipt providers disagree or observation expired");
  const fill = Object.freeze({ ...observations[0], marketHash, observedAtMs: Date.now(), executionAuthorized: false as const });
  approved.add(fill);
  return fill;
}
