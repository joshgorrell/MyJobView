import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../supabase/functions/send-work-order-reminder/index.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /api\.twilio\.com|SIMULATED|twilio_auth_token|twilio_account_sid/);
assert.match(source, /SMS not queued: appointment SMS dispatch is not yet enabled/);
assert.match(source, /if \(result\.emailSent\) \{/);
assert.doesNotMatch(source, /if \(result\.emailSent \|\| result\.smsSent\)/);
assert.match(source, /if \(wo\.reminder_email && wo\.contact\?\.email\)/);
assert.match(source, /sendSystemEmail/);
console.log('Legacy work order reminders: direct SMS disabled; email path retained');
