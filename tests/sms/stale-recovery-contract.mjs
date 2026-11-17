import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../../supabase/migrations/20261117213000_sms_stale_claim_recovery.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../supabase/functions/process-sms-dispatch/index.ts', import.meta.url), 'utf8');
for (const [label, pattern] of [
  ['service-only', /current_user <> 'service_role'/],
  ['dealer scope', /q\.organization_id = p_organization_id/],
  ['stale cutoff', /q\.locked_at < now\(\) - make_interval/],
  ['max attempts', /q\.attempts >= 5/],
  ['safe failure', /SET status = 'failed'/],
  ['unknown outcome marker', /stale_processing_unknown_outcome/],
  ['skip locked', /FOR UPDATE SKIP LOCKED/],
  ['audit event', /INSERT INTO public\.sms_dispatch_events/],
]) assert.match(sql, pattern, label);
assert.doesNotMatch(sql, /SET status = 'pending'|net\.http_post|api\.twilio\.com/, 'Never auto-retry unknown outcomes');
assert.match(worker, /reconcile_stale_sms_dispatch/);
console.log('SMS stale-claim recovery contracts verified');
