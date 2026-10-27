import { encodeEventTopics, encodeAbiParameters, encodeFunctionData, keccak256 } from "viem";
import { FILL_EVENTS } from "../../lib/arbitrage-receipts.ts";
import { STRATEGY_EXECUTION_ABI } from "../../lib/strategy-executor-abi.ts";
export const a = n => "0x" + n.toString(16).padStart(40, "0");
export const h = n => "0x" + n.toString(16).padStart(64, "0");
export const TX = h(77);
const runtime = "0x6001600055";
const pin = n => ({ address: a(n), codeHash: keccak256(runtime) });
export const market = () => ({ chainId: 97, wallet: a(1), router: pin(2), factory: pin(3), pool: pin(4), token: { ...pin(5), decimals: 18 }, settlement: { ...pin(6), decimals: 6 }, fee: 500, confirmations: 20, eventKind: "pancake-v3" });
export const vaultMarket = () => ({ ...market(), vault: { codeHash: keccak256(runtime), operator: a(7) } });

function eventLog(event, args, values, types, index, address, blockHash) {
  return { address, topics: encodeEventTopics({ abi: [event], eventName: event.name, args }), data: encodeAbiParameters(types.map(type => ({ type })), values), blockNumber: 100n, blockHash, transactionHash: TX, logIndex: index, removed: false };
}
export function receiptClient(options = {}) {
  const m = market(), blockHash = options.blockHash || h(100);
  const sell = options.sell === true, tokenDelta = sell ? 1000n : -1000n, settlementDelta = sell ? -120n : 100n;
  const swap = FILL_EVENTS[options.uniswap ? 2 : 1];
  const swapTypes = ["int256", "int256", "uint160", "uint128", "int24", ...(options.uniswap ? [] : ["uint128", "uint128"])];
  const swapValues = [tokenDelta, settlementDelta, 1n << 96n, 1000n, 1, ...(options.uniswap ? [] : [0n, 0n])];
  const logs = [
    eventLog(FILL_EVENTS[0], { from: sell ? m.wallet : m.pool.address, to: sell ? m.pool.address : m.wallet }, [options.badTransfer ? 999n : 1000n], ["uint256"], 0, m.token.address, blockHash),
    eventLog(FILL_EVENTS[0], { from: sell ? m.pool.address : m.wallet, to: sell ? m.wallet : m.pool.address }, [sell ? 120n : 100n], ["uint256"], 1, m.settlement.address, blockHash),
    eventLog(swap, { sender: m.router.address, recipient: options.badRecipient ? a(99) : m.wallet }, swapValues, swapTypes, 2, m.pool.address, blockHash),
  ];
  if (options.extraTransfer) logs.push(eventLog(FILL_EVENTS[0], { from: m.wallet, to: a(99) }, [1n], ["uint256"], 3, a(90), blockHash));
  if (options.duplicateSwap) logs.push({ ...logs[2], logIndex: 3 });
  if (options.duplicateIndex) logs[1].logIndex = 0;
  if (options.removed) logs[0].removed = true;
  let input = options.input || "0x01020304";
  if (options.vault) {
    const order = { tokenIn: sell ? m.token.address : m.settlement.address, amountIn: sell ? 1000n : 100n, minAmountOut: 1n, deadline: 1060n, epoch: 3n, nonce: 8n };
    input = options.input || encodeFunctionData({ abi: STRATEGY_EXECUTION_ABI, functionName: "executeSwap", args: [order] });
    const event = STRATEGY_EXECUTION_ABI.find(item => item.type === "event");
    const auth = eventLog(event, { nonce: options.badVaultNonce ? 9n : order.nonce, epoch: order.epoch, tokenIn: order.tokenIn },
      [options.badVaultAmount ? order.amountIn + 1n : order.amountIn, sell ? 120n : 1000n, options.badVaultMinimum ? 2000n : 1n], ["uint256", "uint256", "uint256"], 3, m.wallet, blockHash);
    if (!options.noVaultEvent) logs.push(auth);
    if (options.duplicateVaultEvent) logs.push({ ...auth, logIndex: 4 });
  }
  let blockReads = 0;
  return {
    async getChainId() { if (options.unavailable) throw new Error("provider unavailable"); return options.chainId ?? 97; },
    async getTransactionReceipt() { return { status: options.reverted ? "reverted" : "success", transactionHash: TX, blockNumber: 100n, blockHash, from: options.wrongWallet ? a(99) : options.vault ? a(7) : m.wallet, to: options.vault ? m.wallet : m.router.address, gasUsed: 50_000n, effectiveGasPrice: options.gasPrice ?? 1n, logs }; },
    async getTransaction() { return { hash: TX, blockNumber: 100n, blockHash, from: options.vault ? a(7) : m.wallet, to: options.vault ? m.wallet : m.router.address, input, type: options.txType || "eip1559", value: options.nativeValue ? 1n : 0n }; },
    async getBlockNumber() { return options.shallow ? 110n : 130n; },
    async getBlock({ blockNumber }) { blockReads++; return { number: blockNumber, hash: options.reorg && blockReads > 1 ? h(200) : blockHash, timestamp: 1000n }; },
    async getCode({ address, blockNumber }) { if (blockNumber !== 100n) throw new Error("unpinned code read"); return options.wrongCode || (options.badVaultCode && address.toLowerCase() === m.wallet) ? "0x6000" : runtime; },
    async readContract({ address, functionName, blockNumber }) {
      if (blockNumber !== 100n) throw new Error("unpinned pool read");
      if (functionName === "getPool") return options.wrongPool ? a(99) : m.pool.address;
      if (functionName === "factory") return m.factory.address;
      if (functionName === "token0") return m.token.address;
      if (functionName === "token1") return m.settlement.address;
      if (functionName === "fee") return 500;
      if (functionName === "decimals") return address.toLowerCase() === m.token.address ? 18 : (options.wrongDecimals ? 18 : 6);
      throw new Error("unexpected read");
    },
  };
}
