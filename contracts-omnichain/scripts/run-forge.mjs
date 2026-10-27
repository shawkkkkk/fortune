import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const platforms = { "linux:x64": "linux-amd64", "linux:arm64": "linux-arm64", "darwin:x64": "darwin-amd64", "darwin:arm64": "darwin-arm64", "win32:x64": "win32-amd64" };
const platform = platforms[process.platform + ":" + process.arch];
if (!platform) throw Error("Unsupported Forge platform");
const binary = new URL(`../node_modules/@foundry-rs/forge-${platform}/bin/forge${process.platform === "win32" ? ".exe" : ""}`, import.meta.url);
const result = spawnSync(fileURLToPath(binary), process.argv.slice(2), { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.signal ? 1 : result.status ?? 1);
