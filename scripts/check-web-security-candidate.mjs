// Tests a proposed dependency refresh in a disposable checkout. Never changes the frozen root pins.
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidate = join(root, "security/web-runtime");
const scratch = mkdtempSync(join(tmpdir(), "fortune-web-security-"));
const reportDir = process.env.FORTUNE_SECURITY_REPORT_DIR ? resolve(process.env.FORTUNE_SECURITY_REPORT_DIR) : null;
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
if (tracked.status !== 0) throw new Error("Tracked source inventory unavailable");
// Gitlinks are dependency directories, not files in this repository's source tree.
const pinnedPaths = tracked.stdout.split("\0").filter(p => p && lstatSync(join(root, p), { throwIfNoEntry: false })?.isFile());
const hashes = () => pinnedPaths.map(p => createHash("sha256").update(readFileSync(join(root, p))).digest("hex")).join(":");
const before = hashes();
let server;
let sourceCommit = null, sourceTree = null;
const env = { ...process.env, NEXT_PUBLIC_CHAIN_ID: "97", NEXT_PUBLIC_FORTUNE_MAINNET_UI_ENABLED: "false", FORTUNE_UPLOADS_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" };
function run(command, args) {
  const r = spawnSync(command, args, { cwd: scratch, env, stdio: "inherit", timeout: 10 * 60_000 });
  if (r.error || r.status !== 0) throw new Error(`Candidate check failed: ${command} ${args[0] || ""}`);
}
try {
  const source = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (source.status !== 0) throw new Error("Git source revision unavailable");
  const tree = spawnSync("git", ["write-tree"], { cwd: root, encoding: "utf8" });
  if (tree.status !== 0) throw new Error("Staged source tree unavailable");
  sourceCommit = source.stdout.trim(); sourceTree = tree.stdout.trim();
  if (reportDir) { mkdirSync(reportDir, { recursive: true }); writeFileSync(join(reportDir, "result.json"), JSON.stringify({ status: "in_progress", sourceCommit, sourceTree, deployed: false, mainnetApproved: false }, null, 2) + "\n"); }
  const archive = spawnSync("git", ["archive", tree.stdout.trim()], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error("Source archive failed");
  const extracted = spawnSync("tar", ["-x", "-C", scratch], { input: archive.stdout });
  if (extracted.status !== 0) throw new Error("Source extraction failed");
  copyFileSync(join(candidate, "package.json"), join(scratch, "package.json"));
  copyFileSync(join(candidate, "package-lock.json"), join(scratch, "package-lock.json"));
  run("npm", ["ci", "--ignore-scripts", "--no-audit"]);
  const audit = spawnSync("npm", ["audit", "--omit=dev", "--audit-level=high", "--json"], { cwd: scratch, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const auditReport = JSON.parse(audit.stdout);
  if (reportDir) { mkdirSync(reportDir, { recursive: true }); writeFileSync(join(reportDir, "audit.json"), JSON.stringify(auditReport, null, 2) + "\n"); }
  if (audit.error || audit.status !== 0 || !auditReport.metadata?.vulnerabilities || auditReport.metadata.vulnerabilities.high || auditReport.metadata.vulnerabilities.critical) throw new Error("Patched candidate production audit failed");
  const tests = readdirSync(join(scratch, "tests/web")).filter(p => p.endsWith(".test.mjs")).sort().map(p => `tests/web/${p}`);
  run(process.execPath, ["--import", "./scripts/register-ts.mjs", "--test", ...tests]);
  run("npm", ["run", "build"]);
  let serverLog = "";
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3130"], { cwd: scratch, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", c => { serverLog += c; }); server.stderr.on("data", c => { serverLog += c; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch("http://127.0.0.1:3130/api/health", { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Patched candidate server unavailable");
  env.FORTUNE_BASE_URL = "http://127.0.0.1:3130";
  run(process.execPath, ["scripts/release-smoke.mjs"]);
  if (!process.env.FORTUNE_PLAYWRIGHT_MODULE) throw new Error("Isolated browser runner required for candidate verification");
  run(process.execPath, ["tests/e2e/creator-flow.mjs"]);
  run(process.execPath, ["tests/e2e/launch-catalog.mjs"]);
  if (reportDir) cpSync(join(scratch, ".tmp/creator-browser"), join(reportDir, "browser"), { recursive: true });
  if (before !== hashes()) throw new Error("Root candidate pins changed during isolated check");
  const result = { status: "passed", sourceCommit, sourceTree, patchedNext: "16.4.3", patchedSharp: "0.35.5", patchedSourceMap: "1.2.2", productionAudit: auditReport.metadata.vulnerabilities,
    webTests: "passed", productionBuild: "passed", runtimeSmoke: "passed", browserFlows: "passed", frozenRootPinsChanged: false, deployed: false, mainnetApproved: false };
  if (reportDir) writeFileSync(join(reportDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  if (reportDir) { mkdirSync(reportDir, { recursive: true }); writeFileSync(join(reportDir, "result.json"), JSON.stringify({ status: "failed", sourceCommit, sourceTree, deployed: false, mainnetApproved: false }, null, 2) + "\n"); }
  console.error(e.message); process.exitCode = 1;
}
finally { server?.kill("SIGTERM"); rmSync(scratch, { recursive: true, force: true }); }
