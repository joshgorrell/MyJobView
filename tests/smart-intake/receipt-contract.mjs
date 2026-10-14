import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const endpoint = readFileSync(new URL('../../supabase/functions/smart-intake-email/index.ts', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../../supabase/migrations/20261014120000_smart_intake_foundation.sql', import.meta.url), 'utf8');
const purpose = readFileSync(new URL('../../supabase/migrations/20261014150000_smart_intake_destination_purpose.sql', import.meta.url), 'utf8');

assert.match(endpoint, /SMART_INTAKE_EMAIL_ENABLED/);
assert.match(endpoint, /verifyResendSignature\(body, request.headers, webhookSecret\)/);
assert.match(endpoint, /crypto\.subtle\.verify/);
assert.match(endpoint, /svix-signature/);
assert.match(endpoint, /svix-timestamp/);
assert.doesNotMatch(endpoint, /x-webhook-secret/);
assert.match(endpoint, /SMART_INTAKE_EMAIL_PROVIDER/);
assert.match(endpoint, /payload\.data/);
assert.match(endpoint, /email\.received/);
assert.match(endpoint, /recipients\.length !== 1/);
assert.match(endpoint, /raw_body: null/);
assert.match(endpoint, /Email content pending retrieval/);
assert.match(endpoint, /Retry-After/);
assert.match(endpoint, /storedContent\.raw_body === null/);
assert.match(endpoint, /status: "needs_review"/);
assert.match(endpoint, /ignoreDuplicates: true/);
assert.match(endpoint, /verified_at/);
assert.match(foundation, /intake_item_provider_unique unique/);
assert.match(purpose, /purpose in \('support','sales'\)/);
console.log('Smart Intake receipt contract passed');
