const base = process.env.BASE_URL;
const concurrency = Number(process.env.CONCURRENCY || 100);
const requests = Number(process.env.REQUESTS || 2000);
const timeoutMs = Number(process.env.TIMEOUT_MS || 5000);

if (!base) {
  console.error("Set BASE_URL, e.g. BASE_URL=https://fortune.example");
  process.exit(1);
}

const paths = [
  "/",
  "/launch",
  "/registry",
  "/analytics",
  "/automations",
  "/api/health",
  "/api/registry/top-bsc",
];

let next = 0;
let ok = 0;
let failed = 0;
const latencies = [];

async function hit(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(base + path, {
      signal: controller.signal,
      headers: { "user-agent": "fortune-load-test/1.0" },
    });

    const elapsed = performance.now() - start;
    latencies.push(elapsed);

    if (response.ok) ok += 1;
    else failed += 1;

    await response.arrayBuffer();
  } catch {
    failed += 1;
  } finally {
    clearTimeout(timer);
  }
}

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    await hit(paths[index % paths.length]);
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(concurrency, requests) },
    () => worker()
  )
);

latencies.sort((a, b) => a - b);
const percentile = (p) =>
  latencies.length
    ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]
    : 0;

console.log(
  JSON.stringify(
    {
      base,
      requests,
      concurrency,
      ok,
      failed,
      successRate: requests ? ok / requests : 0,
      p50Ms: Math.round(percentile(0.5)),
      p95Ms: Math.round(percentile(0.95)),
      p99Ms: Math.round(percentile(0.99)),
    },
    null,
    2
  )
);

if (failed > 0 || ok / requests < 0.995) {
  process.exitCode = 1;
}
