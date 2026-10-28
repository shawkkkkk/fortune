// Operator-launched stdio only. No HTTP listener, credential, model or wallet.
import { serveProjectMcp } from "./project-mcp-server.mjs";
process.stdout.on("error", () => process.exit(1));
try {
  if (process.argv.length !== 2 || process.env.FORTUNE_PROJECT_MCP_ENABLED !== "true") throw Error("Configuration");
  let readCharacter, readNotebook;
  if (process.env.FORTUNE_PROJECT_CHARACTER_ENABLED === "true") {
    const { characterRecordReader } = await import("./character-record-reader.mjs");
    readCharacter = characterRecordReader({ path: process.env.FORTUNE_PROJECT_CHARACTER_DB, policyPath: process.env.FORTUNE_PROJECT_CHARACTER_POLICY, token: process.env.FORTUNE_PROJECT_TOKEN });
  }
  if (process.env.FORTUNE_PROJECT_NOTEBOOK_ENABLED === "true") {
    const { ProjectResearchNotebook } = await import("./project-research-notebook.mjs");
    const path = process.env.FORTUNE_PROJECT_NOTEBOOK_DB, token = process.env.FORTUNE_PROJECT_TOKEN;
    const check = new ProjectResearchNotebook(path, token, { readOnly: true }); check.close();
    readNotebook = async () => { const book = new ProjectResearchNotebook(path, token, { readOnly: true }); try { return book.read(); } finally { book.close(); } };
  }
  await serveProjectMcp({ readNotebook, readCharacter, input: process.stdin, output: process.stdout, token: process.env.FORTUNE_PROJECT_TOKEN });
} catch {
  console.error("Fortune project MCP stopped. Check explicit enablement, nonzero project token, optional protected character-store configuration and bounded newline JSON-RPC input. No wallet action occurred.");
  process.exitCode = 1;
}
