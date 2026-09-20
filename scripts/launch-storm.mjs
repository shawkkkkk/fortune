const base = (process.env.BASE_URL || "").replace(/\/$/, "");
const p95LimitMs = Number(process.env.P95_LIMIT_MS || 2500);
const successFloor = Number(process.env.SUCCESS_FLOOR || 0.995);
const timeoutMs = Number(process.env.TIMEOUT_MS || 8000);

if (!base) {
  console.error("BASE_URL is required.");
  process.exit(1);
}

const stages = (process.env.STAGES || "50x500,200x2000,500x5000")
  .split(",")
  .map((stage) => {
    const [concurrency, requests] = stage.split("x").map(Number);
    return { concurrency, requests };
  });

const targets = [
  { path: "/", weight: 14 },
  { path: "/launch", weight: 18 },
  { path: "/analytics", weight: 8 },
  { path: "/forum", weight: 5 },
  { path: "/api/health", weight: 15 },
  { path: "/api/ready", weight: 10 },
  { path: "/api/public/v1/protocol", weight: 10 },
  { path: "/api/public/v1/readiness", weight: 10 },
  { path: "/api/public/v1/pairs?launchable=true&limit=25", weight: 10 },
];

const weighted = targets.flatMap((target) =>
  Array.from({ length: target.weight }, () => target.path)
);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function one(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(base + path, {
      signal: controller.signal,
      headers: {
        "user-agent": "fortune-launch-storm/1.0",
        "cache-control": "no-cache",
      },
    });

    await response.arrayBuffer();

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: performance.now() - start,
      path,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - start,
      path,
      error: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runStage(stage) {
  let next = 0;
  const results = [];

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= stage.requests) return;

      const path = weighted[index % weighted.length];
      results.push(await one(path));
    }
  }

  const started = performance.now();
  await Promise.all(
    Array.from(
      { length: Math.min(stage.concurrency, stage.requests) },
      () => worker()
    )
  );
  const elapsedMs = performance.now() - started;

  const latencies = results.map((result) => result.latencyMs);
  const successes = results.filter((result) => result.ok).length;
  const rate = successes / results.length;

  const byPath = {};
  for (const result of results) {
    const bucket = (byPath[result.path] ||= {
      requests: 0,
      failures: 0,
      latencies: [],
    });
    bucket.requests += 1;
    bucket.failures += result.ok ? 0 : 1;
    bucket.latencies.push(result.latencyMs);
  }

  const paths = Object.fromEntries(
    Object.entries(byPath).map(([path, value]) => [
      path,
      {
        requests: value.requests,
        failures: value.failures,
        p95Ms: Math.round(percentile(value.latencies, 0.95)),
      },
    ])
  );

  return {
    concurrency: stage.concurrency,
    requests: stage.requests,
    elapsedMs: Math.round(elapsedMs),
    throughputRps: Number((stage.requests / (elapsedMs / 1000)).toFixed(1)),
    successes,
    failures: results.length - successes,
    successRate: Number(rate.toFixed(5)),
    p50Ms: Math.round(percentile(latencies, 0.5)),
    p95Ms: Math.round(percentile(latencies, 0.95)),
    p99Ms: Math.round(percentile(latencies, 0.99)),
    paths,
  };
}

const report = {
  base,
  startedAt: new Date().toISOString(),
  thresholds: {
    successFloor,
    p95LimitMs,
    timeoutMs,
  },
  stages: [],
};

for (const stage of stages) {
  console.log(
    `Running Fortune launch storm: concurrency=${stage.concurrency}, requests=${stage.requests}`
  );
  const result = await runStage(stage);
  report.stages.push(result);
  console.log(JSON.stringify(result, null, 2));
}

report.finishedAt = new Date().toISOString();

const failed = report.stages.some(
  (stage) =>
    stage.successRate < successFloor ||
    stage.p95Ms > p95LimitMs
);

console.log("\nFORTUNE_LAUNCH_STORM_REPORT");
console.log(JSON.stringify(report, null, 2));

if (failed) {
  console.error(
    `Release gate failed. Required success >= ${successFloor * 100}% and p95 <= ${p95LimitMs}ms.`
  );
  process.exitCode = 1;
}
