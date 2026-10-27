// Operator-only manual command. No public route, tools, wallet or automatic retry.
import { selectCreatorHelp } from "../lib/creator-copilot.ts";
try {
  if (process.argv.length !== 2) throw Error("Arguments");
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 4096) throw Error("Input limit"); chunks.push(chunk); }
  const question = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  const result = await selectCreatorHelp(question, { enabled: process.env.FORTUNE_COPILOT_ENABLED === "true", model: process.env.FORTUNE_COPILOT_MODEL || "",
    credential: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "" });
  console.log(JSON.stringify(result, null, 2));
} catch { console.error("Co-pilot unavailable. Check enablement, reviewed model, provider access and bounded non-private input. No wallet action or release approval was performed."); process.exitCode = 1; }
