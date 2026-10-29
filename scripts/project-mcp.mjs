// Operator-launched stdio only. No HTTP listener, model or wallet; optional protected read RPCs only.
import { serveProjectMcp } from "./project-mcp-server.mjs";
process.stdout.on("error", () => process.exit(1));
try {
  if (process.argv.length !== 2 || process.env.FORTUNE_PROJECT_MCP_ENABLED !== "true") throw Error("Configuration");
  let readCharacter, readNotebook, readProvenance;
  if (process.env.FORTUNE_PROJECT_CHARACTER_ENABLED === "true") {
    const { characterRecordReader } = await import("./character-record-reader.mjs");
    readCharacter = characterRecordReader({ path: process.env.FORTUNE_PROJECT_CHARACTER_DB, policyPath: process.env.FORTUNE_PROJECT_CHARACTER_POLICY, token: process.env.FORTUNE_PROJECT_TOKEN });
  }
  if (process.env.FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED === "true") {
    if (!readCharacter) throw Error("Historical character sharing must be explicitly enabled");
    const { createPublicClient, http } = await import("viem");
    const { characterProvenanceReader } = await import("./character-provenance-reader.mjs");
    const urls = [process.env.FORTUNE_CANON_READ_RPC_URL, process.env.FORTUNE_CANON_SECONDARY_RPC_URL].map(x => new URL(x || ""));
    if (urls.some(u => u.protocol !== "https:" || u.username || u.password || u.hash) || urls[0].origin === urls[1].origin) throw Error("Reviewed read origins required");
    const clients = urls.map(u => createPublicClient({ transport: http(u.href, { timeout: 8000, retryCount: 0, fetchOptions: { redirect: "error" } }) }));
    readProvenance = characterProvenanceReader({ path: process.env.FORTUNE_PROJECT_CHARACTER_DB, policyPath: process.env.FORTUNE_PROJECT_CHARACTER_POLICY, token: process.env.FORTUNE_PROJECT_TOKEN }, clients);
  }
  if (process.env.FORTUNE_PROJECT_NOTEBOOK_ENABLED === "true") {
    const { ProjectResearchNotebook } = await import("./project-research-notebook.mjs");
    const path = process.env.FORTUNE_PROJECT_NOTEBOOK_DB, token = process.env.FORTUNE_PROJECT_TOKEN;
    const check = new ProjectResearchNotebook(path, token, { readOnly: true }); check.close();
    readNotebook = async () => { const book = new ProjectResearchNotebook(path, token, { readOnly: true }); try { return book.read(); } finally { book.close(); } };
  }
  await serveProjectMcp({ readNotebook, readCharacter, readProvenance, input: process.stdin, output: process.stdout, token: process.env.FORTUNE_PROJECT_TOKEN });
} catch {
  console.error("Fortune project MCP stopped. Check explicit enablement, nonzero project token, optional protected character-store configuration and bounded newline JSON-RPC input. No wallet action occurred.");
  process.exitCode = 1;
}
