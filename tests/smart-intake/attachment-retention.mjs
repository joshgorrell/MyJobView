import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/smart-intake/attachment-retention.ts"],
  bundle: true, platform: "neutral", format: "esm", write: false,
});
const { canPurgeQuarantine } = await import("data:text/javascript;base64," +
  Buffer.from(result.outputFiles[0].text).toString("base64"));
const now = new Date("2026-10-14T12:00:00Z");
const item = {
  id: "attachment-1", scan_status: "clean", disposition: "discarded",
  expires_at: "2026-10-13T12:00:00Z", deleted_at: null,
};
assert.equal(canPurgeQuarantine(item, now, 0), true);
assert.equal(canPurgeQuarantine({ ...item, disposition: "pending" }, now, 0), true);
assert.equal(canPurgeQuarantine({ ...item, disposition: "pending", scan_status: "pending" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, disposition: "pending" }, now, 1), false);
assert.equal(canPurgeQuarantine({ ...item, disposition: "customer_media" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, disposition: "work_order" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, disposition: "both" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, scan_status: "pending" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, expires_at: "2026-10-15T12:00:00Z" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, expires_at: "invalid" }, now, 0), false);
assert.equal(canPurgeQuarantine({ ...item, deleted_at: now.toISOString() }, now, 0), false);
assert.equal(canPurgeQuarantine(item, now, 1), false);
assert.equal(canPurgeQuarantine(item, now, -1), false);
console.log("Smart Intake retention policy tests passed");
