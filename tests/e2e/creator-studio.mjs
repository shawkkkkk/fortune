/** Local browser/storage/download fixture. No identity or publishing claim. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = await import(process.env.FORTUNE_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const token = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222";
await mkdir(".tmp/studio-browser", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [], writes = [];
    page.on("pageerror", e => errors.push(e.message));
    await context.route("**/*", route => {
      const r = route.request();
      if (!["GET", "HEAD"].includes(r.method())) { writes.push(r.method()); return route.abort(); }
      return new URL(r.url()).origin === new URL(base).origin ? route.continue() : route.abort();
    });
    await page.goto(base + "/studio");
    const dialog = page.getByRole("dialog"); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Continue to Fortune →" }).click(); await dialog.waitFor({ state: "hidden" });
    const address = page.getByLabel("BSC Testnet project address", { exact: true });
    const name = page.getByLabel("Project name", { exact: true });
    const review = page.getByRole("checkbox", { name: /I reviewed these local fields/ });
    const exportButton = page.getByRole("button", { name: "Export character JSON" });
    await address.fill(token); await name.fill("Studio Cat");
    await page.getByLabel("Ticker", { exact: true }).fill("CAT");
    await page.getByLabel("Project description", { exact: true }).fill("<script>window.injected=true</script>");
    await page.getByLabel("Voice", { exact: true }).fill("Warm and direct");
    await review.check(); assert.equal(await exportButton.isEnabled(), true);
    await page.getByRole("button", { name: "Save local draft" }).click(); assert.equal(await review.isChecked(), false);
    await page.reload(); await address.fill(token); await page.getByRole("button", { name: "Load local draft" }).click();
    assert.equal(await name.inputValue(), "Studio Cat"); assert.equal(await review.isChecked(), false);
    assert.equal(await page.getByLabel("Backstory", { exact: true }).inputValue(), "");
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await review.check(); await page.getByLabel("Voice", { exact: true }).fill("Changed voice"); assert.equal(await exportButton.isDisabled(), true);
    await review.check(); const downloadPromise = page.waitForEvent("download"); await exportButton.click();
    const download = await downloadPromise; const path = `.tmp/studio-browser/profile-${width}.json`; await download.saveAs(path);
    const exported = JSON.parse(await readFile(path, "utf8"));
    assert.equal(exported.provenance, "local-unverified-draft"); assert.equal(exported.fields.voice, "Changed voice"); assert.equal(Object.hasOwn(exported, "reviewed"), false);
    await page.getByLabel("Draft JSON", { exact: true }).fill(JSON.stringify({ ...exported, approved: true, fields: { ...exported.fields, privateKey: "must-not-persist" } }));
    await page.getByRole("button", { name: "Import local draft" }).click(); assert.equal(await review.isChecked(), false);
    await address.fill(other); assert.equal(await name.inputValue(), "");
    await page.getByRole("button", { name: "Load local draft" }).click(); assert.equal(await name.inputValue(), "");
    await address.fill(token); await page.getByRole("button", { name: "Load local draft" }).click(); assert.equal(await name.inputValue(), "Studio Cat");
    await page.getByLabel("Draft JSON", { exact: true }).fill(JSON.stringify({ ...exported, chainId: 56 }));
    await page.getByRole("button", { name: "Import local draft" }).click(); assert.match(await page.getByRole("status").last().textContent(), /Import rejected/);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `.tmp/studio-browser/studio-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole("button", { name: "Delete local draft" }).click(); assert.equal(await name.inputValue(), "");
    assert.deepEqual(errors, []); assert.deepEqual(writes, []); await context.close();
    console.log(`PASS Studio ${width}px: storage/reload/scope/import/download/review reset, no HTML execution or network writes`);
  }
  // Actual Studio -> injected provider -> viem -> browser download. The provider
  // returns existing arbitrary r/s/v bytes; it cannot sign or broadcast.
  await import("../../scripts/register-ts.mjs");
  const { CreatorCanonRegistry } = await import("../../scripts/creator-canon-registry.mjs");
  const { emptyCharacter } = await import("../../lib/creator-character.ts");
  const { policy, signature, creatorFor, client, a } = await import("../fixtures/creator-canon.mjs");
  const folder = await mkdtemp(join(tmpdir(), "fortune-studio-canon-"));
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const path = join(folder, "canon.sqlite");
    const now = Date.now();
    CreatorCanonRegistry.initialize(path, policy, now);
    const book = new CreatorCanonRegistry(path, policy, { now: () => now });
    let prepared;
    try { prepared = book.prepare({ ...emptyCharacter, name: "Wallet Cat" }); }
    finally { book.close(); }
    const creator = await creatorFor(prepared);
    const raw = JSON.stringify(prepared, (_, value) => typeof value === "bigint" ? String(value) : value);
    const policyPath = join(folder, "policy.json");
    await writeFile(policyPath, JSON.stringify(policy), { mode: 0o600 });
    const exportPins = mode => execFileSync(process.execPath, ["--import", "./scripts/register-ts.mjs",
      "scripts/operate-creator-canon.mjs", mode, path, policyPath, creator], {
      encoding: "utf8", timeout: 5000, env: { ...process.env, FORTUNE_CREATOR_CANON_ENABLED: "true" },
    });
    const pins = exportPins("studio-pins");
    const initialHeadPins = exportPins("studio-head-pins");
    assert.deepEqual(JSON.parse(pins), { policy, registryId: prepared.typedData.domain.salt, account: creator });
    assert.deepEqual(JSON.parse(initialHeadPins), { ...JSON.parse(pins),
      head: { revision: 0, digest: prepared.update.previousDigest } });
    const page = await context.newPage(), writes = [], errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await context.route("**/*", route => {
      const req = route.request();
      if (!["GET", "HEAD"].includes(req.method())) { writes.push(req.method()); return route.abort(); }
      return new URL(req.url()).origin === new URL(base).origin ? route.continue() : route.abort();
    });
    await page.addInitScript(({ creator, signature }) => {
      window.fixtureCalls = [];
      window.ethereum = { async request(args) {
        window.fixtureCalls.push(args);
        if (args.method === "eth_accounts") return [creator];
        if (args.method === "eth_chainId") return "0x61";
        if (args.method === "eth_signTypedData_v4") {
          if (window.fixtureHold) await new Promise(resolve => { window.releaseFixture = resolve; });
          return signature;
        }
        throw Error("Unexpected wallet call");
      } };
    }, { creator, signature });
    await page.goto(base + "/studio");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Continue to Fortune →" }).click();
    await dialog.waitFor({ state: "hidden" });
    // The unchanged global Header reads already-connected identity on mount.
    // Keep these in the trace and require zero *additional* calls before consent.
    await page.waitForFunction(() => window.fixtureCalls.length >= 2);
    const headerCalls = [{ method: "eth_accounts" }, { method: "eth_chainId" }];
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls), headerCalls);
    const name = page.getByLabel("Project name", { exact: true });
    await page.getByLabel("BSC Testnet project address", { exact: true }).fill(policy.token);
    await name.fill("Wallet Cat");
    assert.equal(await page.getByLabel("Operator pins JSON").count(), 0);
    await page.getByRole("button", { name: "Open local wallet handoff" }).click();
    const fillRequest = async (pinText, preparedText = raw) => {
      await page.getByLabel("Operator pins JSON").fill(pinText);
      await page.getByLabel("Prepared character request JSON").fill(preparedText);
      await page.getByRole("button", { name: "Review prepared request" }).click();
    };
    const sign = page.getByRole("button", { name: "Request character signature" });
    await fillRequest(pins.replace(prepared.typedData.domain.salt, "0x" + "ff".repeat(32)));
    assert.equal(await sign.count(), 0);
    await fillRequest(pins);
    assert.equal(await sign.isDisabled(), true);
    assert.equal(await page.getByText(/These pins do not include a registry head/).count(), 1);
    await fillRequest(initialHeadPins);
    assert.equal(await sign.isDisabled(), true);
    assert.equal(await page.getByText(/Predecessor matches the operator/).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls), headerCalls);
    const consent = page.getByRole("checkbox", { name: /allow my browser wallet/ });
    await consent.check();
    await sign.click();
    const downloadButton = page.getByRole("button", { name: "Download signed envelope" });
    await downloadButton.waitFor();
    const pending = page.waitForEvent("download");
    await downloadButton.click();
    const download = await pending;
    const envelopePath = join(folder, "envelope.json");
    await download.saveAs(envelopePath);
    const envelope = JSON.parse(await readFile(envelopePath, "utf8"));
    assert.deepEqual(envelope, { update: prepared.update, signature });
    const calls = (await page.evaluate(() => window.fixtureCalls)).slice(headerCalls.length);
    assert.deepEqual(calls.map(x => x.method), ["eth_accounts", "eth_chainId", "eth_signTypedData_v4", "eth_accounts", "eth_chainId"]);
    assert.equal(calls[2].params[0].toLowerCase(), creator);
    const typed = JSON.parse(calls[2].params[1]);
    assert.deepEqual(typed.message, JSON.parse(raw).typedData.message);
    assert.deepEqual(typed.domain, prepared.typedData.domain);
    assert.ok(await page.evaluate(() => !Object.values(localStorage).some(v => v.includes("Wallet Cat") || v.includes(window.fixtureCalls.find(x => x.method === "eth_signTypedData_v4").params[0]))));

    await page.evaluate(() => { window.fixtureHold = true; });
    await fillRequest(pins);
    await consent.check();
    await sign.click();
    await page.waitForFunction(() => typeof window.releaseFixture === "function");
    await name.fill("Changed while pending");
    await page.evaluate(() => window.releaseFixture());
    // Start a fresh review to ensure the old result cannot surface or re-use consent.
    await name.fill("Wallet Cat");
    await fillRequest(pins);
    assert.equal(await sign.isDisabled(), true);
    assert.equal(await downloadButton.count(), 0);
    assert.deepEqual((await page.evaluate(() => window.fixtureCalls)).slice(headerCalls.length + 5).map(x => x.method), ["eth_accounts", "eth_chainId", "eth_signTypedData_v4"]);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log("PASS Studio local wallet handoff: exact envelope, separate pins and consent, in-flight edit fence, no network writes");

    // The explicit operator-side acceptance is separate from the browser flow.
    const acceptor = new CreatorCanonRegistry(path, policy);
    let record;
    try {
      assert.equal(acceptor.latest(), null);
      await assert.rejects(acceptor.accept(envelope, [client(a(99), { now }), client(a(99), { now })]), /creator/i);
      assert.equal(acceptor.latest(), null);
      await acceptor.accept(envelope, [client(creator, { now }), client(creator, { now })]);
      record = acceptor.latest();
      assert.deepEqual(record.update, envelope.update);
      assert.equal(record.signature, envelope.signature);
      assert.equal(record.currentAuthorization, null);
      assert.equal(record.executionAuthorized, false);
    } finally { acceptor.close(); }
    const reopened = new CreatorCanonRegistry(path, policy);
    let nextRaw;
    try {
      assert.deepEqual(reopened.latest(), record);
      await assert.rejects(reopened.accept(envelope, []), /revision/i);
      assert.deepEqual(reopened.latest(), record);
      nextRaw = JSON.stringify(reopened.prepare({ ...emptyCharacter, name: "Wallet Cat" }),
        (_, value) => typeof value === "bigint" ? String(value) : value);
    } finally { reopened.close(); }
    const nextHeadPins = exportPins("studio-head-pins");
    assert.deepEqual(JSON.parse(nextHeadPins).head, { revision: 1, digest: record.digest });
    const before = await page.evaluate(() => window.fixtureCalls);
    await fillRequest(nextHeadPins);
    assert.equal(await sign.count(), 0);
    await fillRequest(nextHeadPins.replace(record.digest, "0x" + "ff".repeat(32)), nextRaw);
    assert.equal(await sign.count(), 0);
    await fillRequest(nextHeadPins, nextRaw);
    assert.equal(await sign.isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls), before);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log("PASS Studio registry predecessor check: stale request and wrong digest rejected before wallet access");
    console.log("PASS Studio operator round trip: CLI pins, browser envelope, wrong-creator rejection, durable acceptance and replay rejection");
  } finally {
    await context.close();
    await rm(folder, { recursive: true, force: true });
  }
} finally { await browser.close(); }
