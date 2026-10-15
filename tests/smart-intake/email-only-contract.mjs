import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/lib/smart-intake/channel-settings.ts', 'utf8');
const schema = fs.readFileSync('supabase/migrations/20261014120000_smart_intake_foundation.sql', 'utf8');
const endpoint = fs.readFileSync('supabase/functions/smart-intake-email/index.ts', 'utf8');
assert.match(source, /canActivateEmailIntake/);
assert.match(source, /canActivateSmsIntake/);
assert.match(schema, /enabled boolean not null default false/);
assert.match(schema, /verified_at timestamptz/);
assert.match(endpoint, /SMART_INTAKE_EMAIL_ENABLED/);
assert.doesNotMatch(endpoint, /TWILIO_/);
console.log('Email-only configuration contract passed');
