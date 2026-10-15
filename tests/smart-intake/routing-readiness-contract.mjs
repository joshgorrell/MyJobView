import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261014200000_smart_intake_routing_claims.sql', 'utf8');
const foundation = readFileSync('supabase/migrations/20261014120000_smart_intake_foundation.sql', 'utf8');

assert.match(migration, /intake_id uuid primary key/, 'one claim per intake');
assert.match(migration, /current_item\.status <> 'ready'/, 'only ready intake may route');
assert.match(migration, /current_item\.contact_id is null/, 'customer required');
assert.match(migration, /current_item\.missing_fields <> '\[\]'::jsonb/, 'missing fields block routing');
assert.match(migration, /m\.direction = 'inbound'/, 'inbound content must be persisted');
assert.match(migration, /a\.scan_status <> 'clean' or a\.disposition = 'pending'/, 'unsafe attachments block routing');
assert.match(migration, /auth\.role\(\)\) <> 'service_role'/, 'only trusted service may enqueue');
assert.match(migration, /on conflict \(intake_id\) do nothing/, 'retries cannot duplicate claims');
assert.match(foundation, /'needs_review','ready','processed'/, 'ready status exists');
console.log('Smart Intake routing readiness contract passed');
