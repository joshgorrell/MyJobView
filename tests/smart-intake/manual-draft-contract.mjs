import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const draft = readFileSync('src/lib/smart-intake/manual-draft.ts', 'utf8');
const form = readFileSync('src/components/Dispatch/ManualIntake.tsx', 'utf8');

assert.match(draft, /export function validateManualIntakeDraft/);
assert.match(draft, /'service' \| 'support' \| 'task'/);
assert.match(draft, /if \(!organizationId\)/);
assert.match(draft, /if \(!contactId\)/);
assert.match(draft, /subject\.length > 200/);
assert.match(draft, /description\.length > 10000/);
assert.match(draft, /assignmentNotes\.length > 1000/);
assert.match(form, /validateManualIntakeDraft\(/);
assert.match(form, /smart_intake_create_manual_service/);
assert.match(form, /Create Service Request/);
assert.match(form, /type !== 'service' \|\| !draftValidation.ok \|\| submitting/);
assert.match(draft, /if \(service && \(!jobAddress \|\| jobAddress\.length > 300\)\)/);
assert.doesNotMatch(draft, /\.from\(|\.insert\(|\.update\(|fetch\(/);
console.log('Manual intake validation contract passed');
