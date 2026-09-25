import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFortuneLaunchCatalog } from "../lib/onchain-launches.ts";

const blockInput = process.env.FORTUNE_CATALOG_BLOCK;
if (blockInput && !/^\d{1,20}$/.test(blockInput)) throw new Error("Invalid FORTUNE_CATALOG_BLOCK.");
const catalog = await readFortuneLaunchCatalog(blockInput ? BigInt(blockInput) : undefined);
if (!catalog.configured) throw new Error("Configure the read-only factory, registry and BSC network first.");
const report = {
  schemaVersion: 1,
  kind: "fortune-factory-catalog",
  chainId: catalog.chainId,
  blockNumber: catalog.blockNumber.toString(),
  blockHash: catalog.blockHash,
  total: catalog.total,
  entries: catalog.entries.map(({ mode, factory, index, info }) => ({
    mode, factory, index, creator: info[0], token: info[1], curve: info[2],
    components: info.slice(3, 7), manifestHash: info[7], vanitySalt: info[8], createdAt: info[9].toString(),
  })),
  scope: "Complete configured factory launch records at the specified block; no trade, revenue, burn or rewards aggregates. Block may reorganize; validate blockHash before relying on it.",
};
const bytes = JSON.stringify(report, null, 2) + "\n";
const output = resolve(process.env.FORTUNE_CATALOG_OUTPUT || "/tmp/fortune-onchain-catalog.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes);
console.log(JSON.stringify({ output, chainId: report.chainId, blockNumber: report.blockNumber, blockHash: report.blockHash, total: report.total, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2));
