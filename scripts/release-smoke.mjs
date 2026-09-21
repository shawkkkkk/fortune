const base = (process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

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
  { path: "/sitemap.xml", kind: "html", expectText: "fortune-rho-snowy.vercel.app" },
];

if (process.env.FORTUNE_REQUIRE_READY === "true") {
  checks.splice(1, 0, {
    path: "/api/ready",
    kind: "json",
    expect: (body) => body?.ready === true && body?.service === "fortune",
  });
}

async function probe(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

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
