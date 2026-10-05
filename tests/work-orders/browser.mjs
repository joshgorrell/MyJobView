import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({
  configFile: "tests/work-orders/browser/vite.config.mjs",
});
await server.listen();
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_USE_SERVERLESS_CHROMIUM) {
  const { default: binary } = await import("@sparticuz/chromium");
  launchOptions.args = binary.args.filter((arg) => arg !== "--single-process");
  launchOptions.executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (await binary.executablePath());
}
const browser = await chromium.launch(launchOptions);
try {
  for (const theme of ["light", "dark"])
    for (const size of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 390, height: 420 },
      { width: 1280, height: 800 },
    ]) {
      const page = await browser.newPage({ viewport: size });
      page.setDefaultTimeout(10000);
      console.log("Checking", theme, size.width, size.height);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      await page.goto(`http://127.0.0.1:5187?checklist&theme=${theme}`);
      await page.getByText("Assigned install", { exact: true }).waitFor();
      assert.equal(
        await page.getByText("Other rough work", { exact: true }).count(),
        0,
      );
      await page
        .getByRole("button", { name: "Full Project", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: /^Bedroom$/ })
        .click();
      await page
        .getByText("Original bedroom speakers and controls", { exact: true })
        .waitFor();
      await page.getByText("Other rough work", { exact: true }).waitFor();
      await page.locator("select").first().selectOption("sold");
      await page
        .getByText("Original house installation", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: /Today.s Work/ }).click();
      await page.context().setOffline(true);
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByText(/Viewing saved instructions offline/).waitFor();
      await page
        .getByRole("button", { name: "Full Project", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: /^Bedroom$/ })
        .click();
      await page
        .getByText("Original bedroom speakers and controls", { exact: true })
        .waitFor();
      await page.context().setOffline(false);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Project fits viewport",
      );
      await page.goto(`http://127.0.0.1:5187?tasks&theme=${theme}`);
      await page.getByText("Assigned install", { exact: true }).waitFor();
      await page
        .locator("summary")
        .filter({ hasText: "Assigned install" })
        .click();
      await page
        .getByRole("button", { name: "Edit", exact: true })
        .first()
        .click();
      await page
        .getByLabel("Title", { exact: true })
        .fill("Draft kept in this tab");
      await page.reload();
      await page.getByLabel("Title", { exact: true }).waitFor();
      assert.equal(
        await page.getByLabel("Title", { exact: true }).inputValue(),
        "Draft kept in this tab",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Task editor fits viewport",
      );
      await page.goto(`http://127.0.0.1:5187?labor&theme=${theme}`);
      await page
        .getByRole("button", { name: "Keep labor", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Remove labor too", exact: true })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Labor choice fits viewport",
      );
      await page.goto(`http://127.0.0.1:5187?theme=${theme}`);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.getByText("Customer", { exact: true }).first().waitFor();
      const type = page
        .locator("select")
        .filter({ has: page.locator('option[value="type-service"]') })
        .first();
      assert.equal(
        await type.locator("option").count(),
        2,
        "Project origin keeps every work-order type",
      );
      const rect = await dialog.boundingBox();
      assert.ok(
        rect.width <= size.width && rect.height <= size.height + 1,
        "Universal form fits viewport",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Form has no horizontal overflow",
      );
      const fieldCount = await dialog.locator("input,select,textarea").count();
      await page.goto(`http://127.0.0.1:5187?service&theme=${theme}`);
      await page.getByRole("dialog").waitFor();
      await page.getByText("Customer", { exact: true }).first().waitFor();
      assert.ok(
        (await page.locator('select option[value="type-project"]').count()) > 0,
        "Service origin can select project type",
      );
      assert.ok(fieldCount > 10);
      assert.deepEqual(errors, []);
      await page.close();
    }
  console.log(
    "Handoff browser checks passed: Light/Dark at 320px, 390px, short viewport and desktop; full/original scope, offline packet, persistent drafts, labor choices and universal form.",
  );
} finally {
  await browser.close();
  await server.close();
}
