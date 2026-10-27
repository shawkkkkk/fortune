// Read-only chain operations; writes only an explicitly selected local journal.
import { readFileSync, statSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { ArbitrageFillJournal } from "./arbitrage-fill-journal.mjs";

let journal;
try {
  const [manifestPath, databasePath, txHash, ...extra] = process.argv.slice(2);
  if (!manifestPath || !databasePath || !/^0x[0-9a-fA-F]{64}$/.test(txHash || "") || extra.length) throw new Error("arguments");
  if (statSync(manifestPath).size > 16_384) throw new Error("manifest size");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const urls = [process.env.FORTUNE_ARBITRAGE_READ_RPC_URL, process.env.FORTUNE_ARBITRAGE_SECONDARY_RPC_URL].map(raw => new URL(raw || ""));
  if (urls.some(u => u.protocol !== "https:" || u.username || u.password || u.hash) || urls[0].origin === urls[1].origin) throw new Error("Distinct trusted HTTPS read origins required");
  const clients = urls.map(url => createPublicClient({ transport: http(url.href, { timeout: 8000, retryCount: 0 }) }));
  journal = new ArbitrageFillJournal(databasePath, manifest);
  const result = await journal.refresh(clients, txHash);
  console.log(JSON.stringify({ ...result, state: "observed", profitAllocated: false }));
} catch {
  console.error("Fill unavailable: verify the reviewed testnet manifest, two read providers, receipt and durable journal. Existing evidence may be quarantined; no trade or profit allocation was submitted.");
  process.exitCode = 1;
} finally { journal?.close(); }
