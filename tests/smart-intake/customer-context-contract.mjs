import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const query = readFileSync('src/lib/smart-intake/customer-context.ts', 'utf8');
const ui = readFileSync('src/components/Dispatch/SmartIntakeHistory.tsx', 'utf8');
assert.match(query, /from\('contacts'\)/);
assert.match(query, /from\('work_orders'\)/);
assert.match(query, /\.eq\('organization_id', organizationId\)/g);
assert.match(query, /\.eq\('contact_id', contact\.id\)/);
assert.match(query, /\.limit\(10\)/);
assert.match(ui, /loadIntakeCustomerContext/);
assert.match(ui, /Possible work orders/);
assert.match(ui, /Suggestions only/);
console.log('Smart Intake customer context contract passed');
