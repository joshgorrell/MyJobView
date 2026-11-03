import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261014120000_smart_intake_foundation.sql', 'utf8');
for (const table of ['intake_destinations', 'intake_items', 'intake_messages', 'intake_attachments', 'intake_events']) {
  assert.ok(migration.includes('create table if not exists public.' + table), table + ' missing');
  assert.ok(migration.includes('alter table public.' + table + ' enable row level security'), table + ' missing RLS');
}
assert.match(migration, /unique \(organization_id, channel, provider, provider_event_id\)/);
assert.match(migration, /not enabled or verified_at is not null/);
assert.ok(!migration.includes('create policy'), 'No employee access policy should be installed before authorization review');
console.log('Smart Intake schema contract passed');
