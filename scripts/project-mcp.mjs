// Operator-launched stdio only. No HTTP listener, credential, model or wallet.
import { serveProjectMcp } from "./project-mcp-server.mjs";
process.stdout.on("error", () => process.exit(1));
try {
  if (process.argv.length !== 2 || process.env.FORTUNE_PROJECT_MCP_ENABLED !== "true") throw Error("Configuration");
  let readCharacter;
  if (process.env.FORTUNE_PROJECT_CHARACTER_ENABLED === "true") {
    const { characterRecordReader } = await import("./character-record-reader.mjs");
    readCharacter = characterRecordReader({ path: process.env.FORTUNE_PROJECT_CHARACTER_DB, policyPath: process.env.FORTUNE_PROJECT_CHARACTER_POLICY, token: process.env.FORTUNE_PROJECT_TOKEN });
  }
  await serveProjectMcp({ readCharacter, input: process.stdin, output: process.stdout, token: process.env.FORTUNE_PROJECT_TOKEN });
} catch {
  console.error("Fortune project MCP stopped. Check explicit enablement, nonzero project token, optional protected character-store configuration and bounded newline JSON-RPC input. No wallet action occurred.");
  process.exitCode = 1;
}
