// Read-only operator tool. No keys, signatures, approvals or transaction submission.
import { readFileSync, statSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { readV3MarketQuote } from "../lib/arbitrage-v3-quotes.ts";

try {
  const [manifestPath, side, units, ...extra] = process.argv.slice(2);
  if (!manifestPath || !["buy", "sell"].includes(side) || !/^[1-9][0-9]{0,38}$/.test(units || "") || extra.length) throw new Error("arguments");
  if (statSync(manifestPath).size > 16_384) throw new Error("manifest size");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rpcUrl = new URL(process.env.FORTUNE_ARBITRAGE_READ_RPC_URL || "");
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password || rpcUrl.hash) throw new Error("RPC URL");
  const client = createPublicClient({ transport: http(rpcUrl.href, { timeout: 8_000, retryCount: 0 }) });
  const observation = await readV3MarketQuote(client, manifest, side, BigInt(units));
  console.log(JSON.stringify(observation, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
} catch {
  // RPC errors can include credential-bearing URLs. Do not print upstream exceptions.
  console.error("Quote unavailable: check reviewed testnet manifest, read RPC, arguments and fresh canonical pool state. No transaction was submitted.");
  process.exitCode = 1;
}
