import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20261117201500_sms_safe_enqueue.sql', import.meta.url), 'utf8');
const checks = [
  ['service-role gate', /current_user\s*<>\s*'service_role'/],
  ['revoke public execute', /FROM PUBLIC, anon, authenticated/],
  ['same-tenant contact', /c\.organization_id = p_organization_id/],
  ['opt-in', /c\.sms_opt_in IS TRUE/],
  ['E.164 validation', /v_phone !~ /],
  ['suppression', /public\.sms_suppressions/],
  ['master enable', /cfg\.enabled IS TRUE/],
  ['per-feature enable', /cfg\.appointment_reminders_enabled/],
  ['idempotent insert', /ON CONFLICT \(organization_id, idempotency_key\) DO NOTHING/],
  ['key collision rejection', /Idempotency key already used/],
];
for (const [label, regex] of checks) assert.match(sql, regex, label);
assert.doesNotMatch(sql, /api\.twilio\.com|net\.http_post|cron\.schedule/, 'Must not send SMS');
console.log('SMS enqueue safeguards: ' + checks.length + ' checks');
