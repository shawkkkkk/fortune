/** Isolated localhost UI fixtures, NOT onchain or real storage-provider evidence. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.FORTUNE_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000";
const target = new URL(base);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "UI fixtures run against localhost only");
const output = resolve(".tmp/creator-browser");
await mkdir(output, { recursive: true });
const pair = "0x1bDcF1500866E273Cb11E99cC1832Aa2436Db17d";
const unapproved = "0x1111111111111111111111111111111111111111";
const fixtureOrigin = "https://example.com";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const metadata = {
  name: "Imported Fortune", symbol: "CaT", description: "Imported description — fixture only",
  image: `${fixtureOrigin}/cat.png`, external_url: `${fixtureOrigin}/project`,
  extensions: { twitter: "https://x.com/fortunepad", telegram: "https://t.me/fortune" },
  totalSupply: "1", feeBps: [9999], metadataEditable: true,
};
const browser = await chromium.launch();
let failed = false;

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const label = viewport.width === 390 ? "mobile" : "desktop";
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  const unexpectedWrites = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === fixtureOrigin) {
      if (url.pathname === "/metadata.json") return route.fulfill({
        contentType: "application/json", headers: { "access-control-allow-origin": target.origin }, body: JSON.stringify(metadata),
      });
      return route.fulfill({ contentType: "image/png", body: png });
    }
    if (url.origin !== target.origin) return route.abort(); // No wallet/RPC/provider/network writes.
    if (url.pathname === "/api/public/v1/assets/check") return route.fulfill({ json: { data: {
      address: unapproved, chainId: 97, metadata: { name: "Unapproved fixture", symbol: "NOPE" },
      launchability: { launchableNow: false, reasonCodes: ["ASSET_NOT_REGISTERED"] },
    } } });
    if (url.pathname === "/api/public/v1/assets") return route.fulfill({ json: { data: { items: [{
      address: pair, name: "Fortune Public Test USD", symbol: "fUSD", decimals: 18,
      category: "Fortune Public Testnet", healthy: true, launchable: true,
    }] } } });
    if (!["GET", "HEAD"].includes(request.method())) {
      unexpectedWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });

  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  const value = async (name, expected) => assert.equal(await page.getByLabel(name, { exact: true }).inputValue(), expected);
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${label}: no horizontal overflow`);
  try {
    const response = await page.goto(`${base}/launch`);
    assert.equal(response.status(), 200);
    // Consent is accepted only in this disposable test profile, never for a user.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Continue to Fortune →" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.locator(".assetSelected").waitFor();

    assert.equal(await page.getByLabel(/^Description/).isVisible(), true);
    assert.equal(await page.getByLabel("Website · optional", { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /^Burn \+ Rewards/ }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: /^Dev Launch/ }).isDisabled(), true);
    assert.equal(await page.locator("details.advancedLaunch").getAttribute("open"), null);
    await page.getByLabel("Token name", { exact: true }).fill("Fortune UI fixture");
    await page.getByLabel("Ticker", { exact: true }).fill("LuCk");
    await page.getByLabel("Image URL or IPFS URI", { exact: true }).fill(`${fixtureOrigin}/cat.png`);
    await page.getByLabel(/^Description/).fill("Description visible without advanced settings");
    await page.getByLabel("Website · optional", { exact: true }).fill(`${fixtureOrigin}/project`);
    await page.getByLabel("X · optional", { exact: true }).fill("https://x.com/fortunepad");
    await page.getByLabel("Telegram · optional", { exact: true }).fill("https://t.me/fortune");
    await click("Save draft");
    await page.getByText(/^Draft saved on this browser/).waitFor();
    await page.reload();
    await page.locator(".assetSelected").waitFor();
    await click("Restore draft");
    await page.getByText(/^Draft restored\. Review every field/).waitFor();
    await value("Token name", "Fortune UI fixture");
    await value("Ticker", "LuCk");
    await value("X · optional", "https://x.com/fortunepad");
    await click("Review launch →");
    await page.locator(".reviewSummary").waitFor();
    assert.match(await page.locator(".reviewSummary").innerText(), /Fortune UI fixture · LuCk/);
    assert.match(await page.locator(".reviewSummary").innerText(), /Description visible without advanced settings/);
    assert.match(await page.locator(".reviewSummary").innerText(), /https:\/\/x.com\/fortunepad/);
    await noOverflow();
    await page.screenshot({ path: `${output}/${label}-review.png`, fullPage: true });

    // Editing invalidates review; a local file is never a launchable URI.
    await page.getByLabel("Ticker", { exact: true }).fill("Edit");
    await page.locator(".reviewSummary").waitFor({ state: "detached" });
    await page.getByLabel("Token image file", { exact: true }).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Upload image", exact: true }).waitFor();
    await value("Image URL or IPFS URI", "");
    assert.equal(await page.getByRole("button", { name: "Upload image", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Review launch →", exact: true }).isDisabled(), true);
    assert.match(await page.getByAltText("Selected token image preview").getAttribute("src"), /^blob:/);
    await click("Save draft");
    await page.reload();
    await page.locator(".assetSelected").waitFor();
    await click("Restore draft");
    await value("Image URL or IPFS URI", "");
    assert.equal(await page.getByAltText("Selected token image preview").count(), 0);

    await page.getByText("Advanced · custom metadata URI", { exact: true }).click();
    await page.getByLabel("Metadata URI", { exact: true }).fill(`${fixtureOrigin}/metadata.json`);
    await click("Load metadata");
    await page.getByRole("button", { name: "Apply imported fields", exact: true }).waitFor();
    await value("Token name", "Fortune UI fixture"); // Preview does not auto-apply.
    await click("Apply imported fields");
    await value("Token name", metadata.name);
    await value("Ticker", metadata.symbol);
    await value("Website · optional", metadata.external_url);
    assert.equal(await page.getByLabel("Total token supply", { exact: true }).inputValue(), "1000000000");
    await click("Any token");
    await page.getByLabel("Token contract address", { exact: true }).fill(unapproved);
    await click("Check token");
    await page.getByText("Not available for this launch.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Use checked pair", exact: true }).count(), 0);
    assert.match(await page.locator(".launchPreviewFacts").innerText(), /fUSD/);
    await click("Approved");

    // HTML maxlength counts characters; the review gate also enforces Solidity bytes.
    await page.getByLabel("Token name", { exact: true }).fill("猫".repeat(22));
    await click("Review launch →");
    await page.getByText("Token name must be 64 UTF-8 bytes or fewer.", { exact: true }).waitFor();
    assert.equal(await page.locator(".reviewSummary").count(), 0);
    await page.getByLabel("Token name", { exact: true }).fill(metadata.name);
    await click("Review launch →");
    await page.locator(".reviewSummary").waitFor();
    await click("Delete saved draft");
    await page.getByText("Saved draft deleted. Current form is unchanged.", { exact: true }).waitFor();
    await value("Token name", metadata.name);
    assert.equal(await page.getByRole("button", { name: "Restore draft", exact: true }).count(), 0);
    await noOverflow();
    await page.screenshot({ path: `${output}/${label}-metadata.png`, fullPage: true });
    assert.deepEqual(errors, [], `${label}: no unhandled browser errors`);
    assert.deepEqual(unexpectedWrites, [], `${label}: no transaction or storage write requested`);
    console.log(`PASS ${label}: identity, drafts, review invalidation, file preview, metadata import, unsupported pair, UTF-8 gate and layout`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${label}:`, error);
    await page.screenshot({ path: `${output}/${label}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
