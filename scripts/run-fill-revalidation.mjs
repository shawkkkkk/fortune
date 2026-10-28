import { readFileSync, statSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { ArbitrageFillJournal } from "./arbitrage-fill-journal.mjs";
import { revalidateFillBatch } from "./revalidate-arbitrage-fills.mjs";
let journal;
try {
  const [manifestPath, journalPath, ...extra] = process.argv.slice(2);
  if (!manifestPath || !journalPath || extra.length || statSync(manifestPath).size > 16_384 || !statSync(journalPath).isFile()) throw Error("Arguments");
  const market = JSON.parse(readFileSync(manifestPath, "utf8"));
  // Verify an initialized, matching file without silently creating its schema.
  new ArbitrageFillJournal(journalPath, market, { readOnly: true }).close();
  const urls = [process.env.FORTUNE_ARBITRAGE_READ_RPC_URL, process.env.FORTUNE_ARBITRAGE_SECONDARY_RPC_URL].map(raw => new URL(raw || ""));
  if (urls.some(u => u.protocol !== "https:" || u.username || u.password || u.hash) || urls[0].origin === urls[1].origin) throw Error("Distinct reviewed origins required");
  const clients = urls.map(u => createPublicClient({ transport: http(u.href, { timeout: 8000, retryCount: 0 }) }));
  journal = new ArbitrageFillJournal(journalPath, market);
  const result = await revalidateFillBatch(journal, clients);
  console.log(JSON.stringify(result));
  if (!result.healthy) process.exitCode = 1;
} catch { console.error("Receipt revalidation unavailable: check reviewed policy, existing journal, read providers and host clock. No trade or profit allocation was submitted."); process.exitCode = 1; }
finally { journal?.close(); }
