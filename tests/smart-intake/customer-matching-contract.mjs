import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webhook = readFileSync('supabase/functions/smart-intake-email/index.ts', 'utf8');
const start = webhook.indexOf('// Resolve an existing customer contact only');
const end = webhook.indexOf('// Persist an inbound message record once', start);
assert.ok(start >= 0 && end > start, 'Customer match should occur after tenant-verified intake persistence');
const matching = webhook.slice(start, end);
assert.match(matching, /from\("contacts"\)/);
assert.match(matching, /eq\("organization_id", destination\.organization_id\)/);
assert.match(matching, /\.ilike\("email", senderMailbox\)/);
assert.match(matching, /candidates\?\.length === 1/);
assert.match(matching, /email\?\.trim\(\)\.toLowerCase\(\) === senderMailbox/);
assert.match(matching, /\.is\("contact_id", null\)/);
assert.doesNotMatch(matching, /\.insert\(/, 'Customer matching must not create contacts');
assert.doesNotMatch(matching, /\.upsert\(/, 'Customer matching must not overwrite contacts');
console.log('Smart Intake automatic customer matching contract passed');
