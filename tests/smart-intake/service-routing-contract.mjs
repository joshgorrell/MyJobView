import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/migrations/20261014230000_smart_intake_complete_service_routing.sql','utf8');
for (const [label, pattern] of [
  ['trusted service role', /auth\.role\(\)\) <> 'service_role'/],
  ['locked intake', /where id = target_intake for update/],
  ['locked routing claim', /where intake_id = target_intake for update/],
  ['completed retry returns prior ID', /if claim\.state = 'completed'[\s\S]*?return claim\.destination_id/],
  ['claim tenant consistency', /claim\.organization_id is distinct from item\.organization_id/],
  ['null-safe readiness', /item\.missing_fields is distinct from '\\[\\]'::jsonb/],
  ['requires verified details', /from public\.intake_service_details/],
  ['blocks unsafe attachments', /a\.scan_status <> 'clean' or a\.disposition = 'pending'/],
  ['creates real service request', /insert into public\.service_requests/],
  ['links intake', /service_request_id = request_id/],
  ['completes claim', /state = 'completed', destination_kind = 'service'/],
  ['audit', /'service_request_created'/],
]) assert.match(sql, pattern, label);
console.log('Service routing contract passed');
