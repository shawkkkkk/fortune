import { readFileSync, writeFileSync } from "node:fs";
const artifact = JSON.parse(readFileSync(new URL("../out/FortuneTestnetStrategyVault.sol/FortuneTestnetStrategyVault.json", import.meta.url), "utf8"));
const abi = artifact.abi.filter(item => (item.type === "function" && item.name === "executeSwap") || (item.type === "event" && item.name === "SwapExecuted"));
if (abi.length !== 2) throw Error("Expected strategy execution function/event ABI");
const source = "// Generated from the isolated testnet vault; run contracts-omnichain/scripts/export-strategy-abi.mjs.\nexport const STRATEGY_EXECUTION_ABI = " + JSON.stringify(abi) + " as const;\n";
const target = new URL("../../lib/strategy-executor-abi.ts", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== source) throw Error("Strategy executor ABI drift");
} else writeFileSync(target, source);
