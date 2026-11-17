import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const callback = readFileSync(new URL('../../supabase/functions/sms-status-callback/index.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../supabase/functions/process-sms-dispatch/index.ts', import.meta.url), 'utf8');
for (const [name, pattern] of [
  ['Twilio signature', /X-Twilio-Signature/],
  ['HMAC SHA1', /hash: "SHA-1"/],
  ['fixed callback URL', /req\.url !== publicUrl/],
  ['account scope', /AccountSid/],
  ['message scope', /provider_message_sid/],
  ['organization scope', /eq\("organization_id", org\)/],
  ['delivered mapping', /providerStatus === "delivered"/],
  ['undelivered mapping', /providerStatus === "undelivered"/],
  ['atomic transition', /record_sms_dispatch_result/],
]) assert.match(callback, pattern, name);
assert.match(worker, /StatusCallback: callbackUrl/, 'worker must attach callback URL');
assert.match(worker, /status_callback_not_configured/, 'worker must fail closed without callback');
console.log('SMS callback source contracts verified');
