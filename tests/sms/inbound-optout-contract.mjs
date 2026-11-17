import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../supabase/functions/sms-inbound-webhook/index.ts', import.meta.url), 'utf8');
for (const [label, regex] of [
  ['signed webhook', /X-Twilio-Signature/],
  ['HMAC validation', /hash: "SHA-1"/],
  ['exact public URL', /req\.url !== publicUrl/],
  ['account validation', /params\.get\("AccountSid"\) !== accountSid/],
  ['destination validation', /params\.get\("To"\) !== fromNumber/],
  ['STOP', /"STOP"/],
  ['UNSUBSCRIBE', /"UNSUBSCRIBE"/],
  ['dealer suppression', /organization_id: org, phone_e164: sender, reason: "stop"/],
  ['idempotent upsert', /onConflict: "organization_id,phone_e164"/],
  ['START does not auto-opt-in', /Leave suppression in place/],
]) assert.match(src, regex, label);
assert.doesNotMatch(src, /\.delete\(\)|sms_opt_in:\s*true/, 'Do not auto-clear suppression or opt-in');
console.log('SMS inbound opt-out source contracts verified');
