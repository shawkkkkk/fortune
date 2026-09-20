import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
};

const rpcUrl = required("RPC_URL");
const factory = required("FACTORY_ADDRESS");
const locker = required("LOCKER_ADDRESS");
const positionManager = required("POSITION_MANAGER_ADDRESS");
const funder = required("FUNDER_ADDRESS");
const deployerKey = required("DEPLOYER_PRIVATE_KEY");
const curvesFile = required("CURVES_FILE");
const reportPath =
  process.env.REPORT_PATH || "/tmp/fortune-graduation-wave-report.json";

const gasPriceWei = BigInt(process.env.GAS_PRICE_WEI || "1000000000");
const requestedParallelism = Number(
  process.env.SUBMISSION_CONCURRENCY || "100",
);

function runCast(args, { env = {}, allowFailure = false } = {}) {
  const result = spawnSync("cast", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`cast ${args[0]} failed: ${detail}`);
  }

  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

const curves = (await readFile(curvesFile, "utf8"))
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean);

if (curves.length < 1 || curves.length > 100) {
  throw new Error(`Expected 1-100 curves, found ${curves.length}`);
}

const unique = new Set(curves.map((x) => x.toLowerCase()));
if (unique.size !== curves.length) {
  throw new Error("Curve list contains duplicates");
}

const deadline = Math.floor(Date.now() / 1000) + 3600;
const plan = runCast([
  "abi-encode",
  "f((uint24[],uint16,uint16,uint64))",
  `([500],100,100,${deadline})`,
]).stdout;

if (!/^0x[0-9a-fA-F]+$/.test(plan)) {
  throw new Error("Failed to ABI-encode graduation plan");
}

const deployer = runCast([
  "wallet",
  "address",
  "--private-key",
  deployerKey,
]).stdout;

const estimatedGasText = runCast([
  "estimate",
  factory,
  "finalizeGraduation(address,bytes)",
  curves[0],
  plan,
  "--from",
  deployer,
  "--rpc-url",
  rpcUrl,
]).stdout.split(/\s+/)[0];

const estimatedGas = BigInt(estimatedGasText);
const gasLimit = (estimatedGas * 140n) / 100n + 100_000n;
const amountEach = gasLimit * gasPriceWei * 130n / 100n;
const totalFunding = amountEach * BigInt(curves.length);

const deployerBalance = BigInt(
  runCast(["balance", deployer, "--rpc-url", rpcUrl]).stdout.split(/\s+/)[0],
);

if (deployerBalance < totalFunding + 10_000_000_000_000_000n) {
  throw new Error(
    `Insufficient keeper-funding balance. Need at least ${totalFunding} wei plus reserve; have ${deployerBalance} wei.`,
  );
}

const keepers = curves.map(() => {
  const key = `0x${randomBytes(32).toString("hex")}`;
  const address = runCast([
    "wallet",
    "address",
    "--private-key",
    key,
  ]).stdout;
  return { key, address };
});

const recipients = `[${keepers.map((k) => k.address).join(",")}]`;

runCast([
  "send",
  funder,
  "fund(address[],uint256)",
  recipients,
  amountEach.toString(),
  "--value",
  totalFunding.toString(),
  "--private-key",
  deployerKey,
  "--rpc-url",
  rpcUrl,
  "--gas-price",
  gasPriceWei.toString(),
]);

async function sendGraduation(index) {
  const keeper = keepers[index];
  const curve = curves[index];
  const started = performance.now();

  return await new Promise((resolve) => {
    const child = spawn(
      "cast",
      [
        "send",
        factory,
        "finalizeGraduation(address,bytes)",
        curve,
        plan,
        "--private-key",
        keeper.key,
        "--rpc-url",
        rpcUrl,
        "--gas-limit",
        gasLimit.toString(),
        "--gas-price",
        gasPriceWei.toString(),
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const elapsedMs = Math.round(performance.now() - started);
      const txMatch = stdout.match(/transactionHash\s+(0x[a-fA-F0-9]{64})/);
      resolve({
        index,
        curve,
        keeper: keeper.address,
        ok: code === 0,
        elapsedMs,
        transactionHash: txMatch?.[1] || null,
        error: code === 0 ? null : (stderr || stdout).trim().slice(-1200),
      });
    });
  });
}

const parallelism = Math.max(
  1,
  Math.min(requestedParallelism, curves.length),
);

const results = new Array(curves.length);
let nextIndex = 0;

async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= curves.length) return;
    results[index] = await sendGraduation(index);
  }
}

const waveStart = performance.now();
await Promise.all(Array.from({ length: parallelism }, () => worker()));
const waveDurationMs = Math.round(performance.now() - waveStart);

const txFailures = results.filter((r) => !r.ok);

const checks = [];
for (let i = 0; i < curves.length; i += 1) {
  const curve = curves[i];
  const graduated =
    runCast([
      "call",
      curve,
      "graduated()(bool)",
      "--rpc-url",
      rpcUrl,
    ]).stdout.toLowerCase() === "true";

  const phaseRaw = runCast([
    "call",
    curve,
    "phase()(uint8)",
    "--rpc-url",
    rpcUrl,
  ]).stdout.split(/\s+/)[0];

  checks.push({
    index: i,
    curve,
    graduated,
    phase: Number(phaseRaw),
  });
}

const lockedCount = BigInt(
  runCast([
    "call",
    locker,
    "lockedPositionCount()(uint256)",
    "--rpc-url",
    rpcUrl,
  ]).stdout.split(/\s+/)[0],
);

let lpOwnershipFailures = 0;
for (let i = 0; i < curves.length; i += 1) {
  const tokenId = runCast([
    "call",
    locker,
    "lockedTokenIds(uint256)(uint256)",
    String(i),
    "--rpc-url",
    rpcUrl,
  ]).stdout.split(/\s+/)[0];

  const owner = runCast([
    "call",
    positionManager,
    "ownerOf(uint256)(address)",
    tokenId,
    "--rpc-url",
    rpcUrl,
  ]).stdout.toLowerCase();

  if (owner !== locker.toLowerCase()) {
    lpOwnershipFailures += 1;
  }
}

const stateFailures = checks.filter(
  (x) => !x.graduated || x.phase !== 2,
);

const elapsed = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
const percentile = (p) =>
  elapsed[Math.min(elapsed.length - 1, Math.floor(elapsed.length * p))];

const report = {
  launchedAt: new Date().toISOString(),
  requestedGraduations: curves.length,
  submissionConcurrency: parallelism,
  estimatedFinalizeGas: estimatedGas.toString(),
  gasLimit: gasLimit.toString(),
  keeperFundingWeiEach: amountEach.toString(),
  waveDurationMs,
  txSuccesses: results.length - txFailures.length,
  txFailures: txFailures.length,
  p50ConfirmationMs: percentile(0.5),
  p95ConfirmationMs: percentile(0.95),
  p99ConfirmationMs: percentile(0.99),
  graduatedStateSuccesses: checks.length - stateFailures.length,
  stateFailures: stateFailures.length,
  lockedPositionCount: lockedCount.toString(),
  expectedLockedPositionCount: curves.length,
  lpOwnershipFailures,
  results,
  checks,
};

await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log("FORTUNE_GRADUATION_WAVE_REPORT");
console.log(JSON.stringify(report, null, 2));

if (
  txFailures.length > 0 ||
  stateFailures.length > 0 ||
  lockedCount !== BigInt(curves.length) ||
  lpOwnershipFailures > 0
) {
  process.exit(1);
}
