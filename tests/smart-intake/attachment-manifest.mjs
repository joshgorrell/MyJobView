import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";

const source = readFileSync(new URL("../../supabase/functions/smart-intake-email/attachment-manifest.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "esm" });
const { parseAttachmentManifest } = await import("data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64"));

const valid = { id: "attachment_123", filename: "panel-photo.jpg", content_type: "image/jpeg" };
assert.deepEqual(parseAttachmentManifest(undefined), []);
assert.deepEqual(parseAttachmentManifest([valid]), [{ id: valid.id, filename: valid.filename, contentType: valid.content_type }]);
assert.equal(parseAttachmentManifest(null), null);
assert.equal(parseAttachmentManifest({}), null);
assert.equal(parseAttachmentManifest(Array(21).fill(valid)), null);
assert.equal(parseAttachmentManifest([valid, valid]), null);
assert.equal(parseAttachmentManifest([{ ...valid, filename: "../escape.jpg" }]), null);
assert.equal(parseAttachmentManifest([{ ...valid, filename: "folder\\file.jpg" }]), null);
assert.equal(parseAttachmentManifest([{ ...valid, filename: "bad\nname.jpg" }]), null);
assert.equal(parseAttachmentManifest([{ ...valid, content_type: "invalid" }]), null);
assert.equal(parseAttachmentManifest([{ ...valid, id: "../bad" }]), null);
console.log("Smart Intake attachment manifest tests passed");

const keySource = readFileSync(new URL("../../supabase/functions/smart-intake-email/quarantine-key.ts", import.meta.url), "utf8");
const keyCompiled = await transform(keySource, { loader: "ts", format: "esm" });
const { quarantineObjectKey } = await import("data:text/javascript;base64," + Buffer.from(keyCompiled.code).toString("base64"));
const org = "123e4567-e89b-42d3-a456-426614174000";
const intake = "123e4567-e89b-42d3-a456-426614174001";
assert.equal(quarantineObjectKey(org, intake, "attachment_123"), org + "/" + intake + "/attachment_123");
assert.throws(() => quarantineObjectKey("../outside", intake, "attachment_123"));
assert.throws(() => quarantineObjectKey(org, intake, "../escape"));

const scanSource = readFileSync(new URL("../../supabase/functions/smart-intake-email/attachment-scan.ts", import.meta.url), "utf8");
const scanCompiled = await transform(scanSource, { loader: "ts", format: "esm" });
const { requireCleanScan } = await import("data:text/javascript;base64," + Buffer.from(scanCompiled.code).toString("base64"));
const sample = new Uint8Array([1, 2, 3]);
await assert.rejects(requireCleanScan(sample));
await assert.rejects(requireCleanScan(sample, async () => "blocked"));
await assert.rejects(requireCleanScan(sample, async () => "failed"));
await requireCleanScan(sample, async () => "clean");
