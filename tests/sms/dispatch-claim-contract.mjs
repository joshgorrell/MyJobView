import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261117194500_sms_dispatch_claim.sql', import.meta.url),
  'utf8',
);
const checks = [
  ['service-role restriction', /current_user\s*<>\s*'service_role'/i],
  ['revoke public execution', /REVOKE ALL ON FUNCTION.*FROM PUBLIC, anon, authenticated/i],
  ['same-organization contact', /c\.organization_id\s*=\s*q\.organization_id/i],
  ['contact opt-in', /c\.sms_opt_in IS TRUE/i],
  ['dealer master switch', /cfg\.enabled IS TRUE/i],
  ['category-specific switches', /cfg\.appointment_reminders_enabled/i],
  ['suppression', /public\.sms_suppressions/i],
  ['quiet hours', /cfg\.quiet_hours_start/i],
  ['dealer timezone', /AT TIME ZONE cfg\.timezone/i],
  ['due time', /q\.next_attempt_at <= now\(\)/i],
  ['atomic claim', /FOR UPDATE OF q SKIP LOCKED/i],
  ['bounded batch', /LEAST\(GREATEST\(p_limit, 1\), 100\)/i],
  ['status processing', /status = 'processing'/i],
];
for (const [name, pattern] of checks) {
  assert.match(sql, pattern, `Missing SMS claim safeguard: ${name}`);
}
assert.doesNotMatch(sql, /net\.http_post|cron\.schedule|api\.twilio\.com/i,
  'Claim migration must not trigger external sends');
console.log(`SMS claim migration contract: ${checks.length} safeguards present`);
