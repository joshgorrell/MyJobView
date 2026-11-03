import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync('supabase/migrations/20261014130000_smart_intake_audit_history.sql', 'utf8');
for (const table of ['intake_delivery_events', 'intake_processing_attempts']) {
  assert.ok(sql.includes('create table if not exists public.' + table));
  assert.ok(sql.includes('alter table public.' + table + ' enable row level security'));
}
assert.match(sql, /attempt_number integer not null/);
assert.match(sql, /provider_event_id text/);
console.log('Intake audit schema contract passed');
