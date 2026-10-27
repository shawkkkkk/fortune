/** Local UI and actual preview API only. No deployment, keys or chain transactions. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.FORTUNE_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.FORTUNE_BASE_URL || "http://127.0.0.1:3000";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
await mkdir(".tmp/creator-browser", { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(base + "/launch/types");
      // Accept the existing notice only inside this disposable localhost profile.
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByRole("checkbox").check();
      await dialog.getByRole("button", { name: "Continue to Fortune →" }).click();
      await dialog.waitFor({ state: "detached" });
      await page.getByRole("heading", { name: "What will you launch?" }).waitFor();
      assert.equal(await page.locator(".launchCatalogCard").count(), 10);
      assert.ok(await page.getByRole("link", { name: "Open Standard form" }).getAttribute("href") === "/launch");
      await page.getByRole("link", { name: "Open supply planner" }).click();
      await page.getByRole("heading", { name: "One token. A global supply." }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Validate supply plan" }).isDisabled(), true);
      await page.getByLabel("Token name", { exact: true }).fill("Test Lucky");
      await page.getByLabel("Ticker", { exact: true }).fill("LUCK");
      await page.getByRole("button", { name: "Validate supply plan" }).click();
      await page.getByRole("status").filter({ hasText: "Supply plan validated" }).waitFor();
      await page.getByLabel("Global supply · whole tokens", { exact: true }).fill("2000000000");
      assert.equal(await page.getByRole("button", { name: "Validate supply plan" }).isDisabled(), true);
      assert.equal(await page.getByText("Supply plan validated", { exact: false }).count(), 0, "old validation must disappear when inputs change");
      await page.getByLabel("Tokens on BNB Smart Chain Testnet", { exact: true }).fill("1500000000");
      await page.getByRole("button", { name: "Validate supply plan" }).click();
      await page.getByRole("status").filter({ hasText: "Supply plan validated" }).waitFor();
      await page.getByLabel("Base Sepolia", { exact: true }).uncheck();
      assert.equal(await page.getByRole("button", { name: "Validate supply plan" }).isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no horizontal overflow");
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: `.tmp/creator-browser/omnichain-${viewport.width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`Catalog → supply planner → real preview API passed at ${viewport.width}px`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
