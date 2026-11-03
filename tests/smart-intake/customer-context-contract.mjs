import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const query = readFileSync('src/lib/smart-intake/customer-context.ts', 'utf8');
const ui = readFileSync('src/components/Dispatch/SmartIntakeHistory.tsx', 'utf8');
assert.match(query, /from\('contacts'\)/);
assert.match(query, /\.eq\('organization_id', organizationId\)/);
assert.doesNotMatch(query, /from\('work_orders'\)/);
assert.match(ui, /loadIntakeCustomerContext/);
assert.doesNotMatch(ui, /Possible work orders/);
console.log('Smart Intake pre-work-order customer context contract passed');
