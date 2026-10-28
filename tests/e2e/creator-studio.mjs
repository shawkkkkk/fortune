/** Local browser/storage/download fixture. No identity or publishing claim. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
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
} finally { await browser.close(); }
