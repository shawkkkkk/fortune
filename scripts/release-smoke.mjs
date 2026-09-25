const base = (process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fortune-rho-snowy.vercel.app").replace(/\/$/, "");

const checks = [
  {
    path: "/api/health",
    kind: "json",
    expect: (body) =>
      body?.ok === true &&
      body?.service === "fortune-web" &&
      (body?.chainId !== 97 || body?.testnetFactoryConfigured === true),
  },
  { path: "/api/public/v1/meta", kind: "json", expect: (body) => body && typeof body === "object" },
  { path: "/testnet", kind: "html", expectText: "Fortune" },
  { path: "/launch", kind: "html", expectText: "Fortune" },
  { path: "/robots.txt", kind: "html", expectText: "Sitemap:" },
  { path: "/sitemap.xml", kind: "html", expectText: site },
  { path: "/", kind: "html", expectText: `rel="canonical" href="${site}"` },
  { path: "/api/public/v1/release", kind: "json", expect: body =>
    typeof body?.data?.standard?.activationReady === "boolean" && body?.data?.burnRewardsV2?.mainnetEnabled === false },
];

if (process.env.FORTUNE_REQUIRE_ONCHAIN === "true") {
  checks.push(
    { path: "/api/public/v1/stats", kind: "json", expect: body =>
      Number.isSafeInteger(body?.data?.totalLaunches) && body.data.totalLaunches >= 0 &&
      /^\d+$/.test(body.data.blockNumber) && /^0x[a-fA-F0-9]{64}$/.test(body.data.blockHash) &&
      body.data.volumeUsd === null && body.data.revenueUsd === null },
    { path: "/api/public/v1/launches?limit=2", kind: "json", expect: body =>
      Array.isArray(body?.data?.items) && typeof body?.data?.page?.hasMore === "boolean" &&
      /^\d+$/.test(body?.meta?.blockNumber) },
    { path: "/api/public/v1/assets?launchable=true", kind: "json", expect: body =>
      Array.isArray(body?.data?.items) && body.data.items.every(item => item.launchable && item.healthy) },
  );
}

if (process.env.FORTUNE_REQUIRE_READY === "true") {
  checks.splice(1, 0, {
    path: "/api/ready",
    kind: "json",
    expect: (body) => body?.ready === true && body?.service === "fortune",
  });
}

async function probe(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(base + check.path, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "fortune-release-smoke/1.0" },
    });

    if (!response.ok) {
      throw new Error(`${check.path} returned HTTP ${response.status}`);
    }

    if (check.kind === "json") {
      const body = await response.json();
      if (!check.expect(body)) {
        throw new Error(`${check.path} returned an unexpected JSON payload`);
      }
    } else {
      const body = await response.text();
      if (!body.includes(check.expectText)) {
        throw new Error(`${check.path} did not contain expected text: ${check.expectText}`);
      }
    }

    console.log(`PASS ${check.path}`);
  } finally {
    clearTimeout(timeout);
  }
}

let failed = false;
for (const check of checks) {
  try {
    await probe(check);
  } catch (error) {
    failed = true;
    console.error(
      `FAIL ${check.path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

if (failed) process.exit(1);
console.log("Fortune production-runtime smoke gate passed.");
