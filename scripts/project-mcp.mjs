// Operator-launched stdio only. No HTTP listener, credential, model or wallet.
import { serveProjectMcp } from "./project-mcp-server.mjs";
process.stdout.on("error", () => process.exit(1));
try {
  if (process.argv.length !== 2 || process.env.FORTUNE_PROJECT_MCP_ENABLED !== "true") throw Error("Configuration");
  await serveProjectMcp({ input: process.stdin, output: process.stdout, token: process.env.FORTUNE_PROJECT_TOKEN });
} catch {
  console.error("Fortune project MCP stopped. Check explicit enablement, nonzero project token and bounded newline JSON-RPC input. No wallet action occurred.");
  process.exitCode = 1;
}
