import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20261014180000_smart_intake_attachment_metadata_read.sql", "utf8");
assert.match(sql, /for select to authenticated/i);
assert.match(sql, /smart_intake_staff_can_read\(i\.organization_id\)/i);
assert.match(sql, /m\.id = intake_message_id/i);
const grant = sql.match(/grant select\s*\(([^)]*)\)\s*on public\.intake_attachments to authenticated/i);
assert.ok(grant, "Must use a column-level metadata grant");
const columns = grant[1].split(",").map(x => x.trim().toLowerCase());
for (const column of ["id", "intake_message_id", "original_filename", "scan_status", "disposition", "expires_at", "deleted_at"]) {
  assert.ok(columns.includes(column), "Missing metadata column " + column);
}
for (const forbidden of ["storage_key", "sha256"]) assert.ok(!columns.includes(forbidden));
assert.doesNotMatch(sql, /grant\s+(?:all|update|insert|delete)\b/i);
console.log("Smart Intake attachment metadata grant contract passed");
