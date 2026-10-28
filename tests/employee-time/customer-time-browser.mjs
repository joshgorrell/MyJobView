import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PACKAGE_PATH || "playwright",
);
const server = await createServer({
  configFile: "tests/employee-time/customer-browser/vite.config.mjs",
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on("pageerror", (e) => { errors.push(e.message); console.error("Customer time browser error:", e.message); });
    const open = async (name = "Randy Travis") => {
      await page.goto("http://127.0.0.1:5192");
      await page.getByRole("button", { name: new RegExp(name) }).click();
      await page
        .getByRole("button", { name: "Record Customer Activity" })
        .waitFor();
    };
    await open();
    await page
      .getByRole("button", { name: /Project.*P-100.*Whole Home Audio/ })
      .click();
    await page
      .getByRole("button", { name: /Project Work Order.*WO-100/ })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: /Project Work Order.*WO-200/ })
        .count(),
      0,
      "Service linked to project stays in Service choices",
    );
    await page
      .getByRole("button", { name: /Service.*WO-200.*TV Troubleshooting/ })
      .click();
    await page
      .getByRole("button", { name: "Start Job Time", exact: true })
      .click();
    assert.ok(
      (await page.evaluate(() => window.__timeTest.calls)).some(
        (c) => c.id === "service-wo",
      ),
    );
    await page
      .getByRole("button", { name: "Enter time already worked" })
      .click();
    await page
      .getByLabel("Work notes")
      .fill("Customer service troubleshooting");
    await page.getByRole("button", { name: "Submit Time for Review" }).click();
    await page.waitForFunction(() =>
      window.__timeTest.writes.some(
        (w) => w.table === "manual_job_time_requests",
      ),
    );
    let payload = await page.evaluate(
      () =>
        window.__timeTest.writes.find(
          (w) => w.table === "manual_job_time_requests",
        ).payload,
    );
    assert.equal(payload.work_order_id, "service-wo");
    assert.equal(payload.project_id, null);
    assert.equal(payload.contact_id, "randy");
    await open("No Open Jobs");
    await page.getByText("No open projects.", { exact: true }).waitFor();
    await page
      .getByText("No open service Work Orders.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Record Customer Activity" })
      .click();
    await page
      .getByRole("button", { name: "Enter time already worked" })
      .click();
    await page
      .getByLabel("Work notes")
      .fill("Initial site survey with customer");
    await page
      .getByLabel("Activity", { exact: true })
      .selectOption("site_survey");
    await page.getByRole("button", { name: "Submit Time for Review" }).click();
    await page.waitForFunction(() =>
      window.__timeTest.writes.some(
        (w) => w.table === "manual_job_time_requests",
      ),
    );
    payload = await page.evaluate(
      () =>
        window.__timeTest.writes.find(
          (w) => w.table === "manual_job_time_requests",
        ).payload,
    );
    assert.equal(payload.contact_id, "empty");
    assert.equal(payload.project_id, null);
    assert.equal(payload.work_order_id, null);
    assert.equal(payload.activity_type, "site_survey");
    await open();
    await page
      .getByRole("button", { name: /Service.*WO-201.*Legacy Project Repair/ })
      .click();
    await page.getByText(/Ask dispatch to assign it to you/).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Start Job Time", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Change customer" }).click();
    await page.getByRole("button", { name: /No Open Jobs/ }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Start Timer", exact: true })
        .count(),
      0,
      "Changing customer clears previous target",
    );
    await open();
    await page
      .getByRole("button", { name: "Record Customer Activity" })
      .click();
    await page
      .getByLabel("Work notes")
      .fill("Planning the next customer visit");
    await page
      .getByRole("button", { name: "Start Timer", exact: true })
      .click();
    await page.getByRole("button", { name: "Record more time" }).waitFor();
    await page.evaluate(() => { window.__timeTest.timerFailures = 1; window.dispatchEvent(new Event("customer-time-changed")); });
    await page.getByRole("alert").filter({ hasText: "Unable to load your customer timer" }).waitFor();
    await page.getByRole("button", { name: "Retry customer timer" }).click();
    await page.getByRole("alert").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Stop & Submit Time" }).click();
    await page.waitForFunction(() =>
      window.__timeTest.calls.some((c) => c.name === "stop_customer_job_time"),
    );
    await page.evaluate(() => { window.__timeTest.timerFailures = 1; window.dispatchEvent(new Event("customer-time-changed")); });
    await page.getByRole("button", { name: "Retry customer timer" }).click();
    await page.getByRole("button", { name: "Retry customer timer" }).waitFor({ state: "detached" });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Customer-first picker passed at 320px, 390px and desktop: project/service separation, linked service, empty customer, manual target payload, assignment boundary, customer reset, and timer start/stop.",
  );
} finally {
  await browser.close();
  await server.close();
}
