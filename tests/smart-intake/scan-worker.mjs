import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["supabase/functions/smart-intake-email/attachment-scan-worker.ts"],
  bundle: true,
  platform: "neutral",
  format: "esm",
  write: false,
});
const { scanPendingAttachment } = await import("data:text/javascript;base64," +
  Buffer.from(result.outputFiles[0].text).toString("base64"));
const originalFetch = globalThis.fetch;
const data = new Uint8Array([1, 2, 3]);
const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
  .map(x => x.toString(16).padStart(2, "0")).join("");
const org = "123e4567-e89b-42d3-a456-426614174000";
const intake = "123e4567-e89b-42d3-a456-426614174001";
const attachment = {
  id: "123e4567-e89b-42d3-a456-426614174002",
  organization_id: org,
  intake_id: intake,
  storage_key: org + "/" + intake + "/file_1",
  sha256,
  byte_size: 3,
  scan_status: "pending",
};
let downloads = 0;
let updates = [];
const db = {
  storage: { from: () => ({ download: async () => {
    downloads++;
    return { data: new Blob([data]), error: null };
  } }) },
  from: () => ({ update: (values) => ({
    eq: () => ({ eq: () => ({
      select: async () => {
        updates.push(values);
        return { data: [{ id: attachment.id }], error: null };
      },
    }) }),
  }) }),
};
const config = { endpoint: "https://scanner.example.com/scan", allowedHost: "scanner.example.com", token: "x".repeat(32) };
try {
  globalThis.fetch = async () => Response.json({ verdict: "clean" });
  assert.equal(await scanPendingAttachment(db, attachment, config), "clean");
  assert.equal(updates.at(-1).scan_status, "clean");
  globalThis.fetch = async () => Response.json({ verdict: "blocked" });
  assert.equal(await scanPendingAttachment(db, attachment, config), "blocked");
  assert.equal(updates.at(-1).scan_status, "blocked");
  globalThis.fetch = async () => { throw Error("scanner unavailable"); };
  assert.equal(await scanPendingAttachment(db, attachment, config), "failed");
  assert.equal(updates.at(-1).scan_status, "failed");
  const before = downloads;
  await assert.rejects(scanPendingAttachment(db, { ...attachment, organization_id: "223e4567-e89b-42d3-a456-426614174000" }, config));
  await assert.rejects(scanPendingAttachment(db, { ...attachment, intake_id: "223e4567-e89b-42d3-a456-426614174001" }, config));
  await assert.rejects(scanPendingAttachment(db, { ...attachment, sha256: "0".repeat(64) }, config));
  assert.equal(downloads, before + 1, "Tenant and intake mismatches must fail before storage read");
  assert.equal(updates.length, 3, "Invalid attachments must not be updated");
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Smart Intake scan worker integration tests passed");
