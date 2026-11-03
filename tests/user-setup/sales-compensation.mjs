import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261016120000_sales_compensation_arrangements.sql', import.meta.url), 'utf8');
const fields = readFileSync(new URL('../../src/components/Admin/SalesCompensationFields.tsx', import.meta.url), 'utf8');
const add = readFileSync(new URL('../../src/components/Admin/AddUserForm.tsx', import.meta.url), 'utf8');
const edit = readFileSync(new URL('../../src/components/Admin/EditUserForm.tsx', import.meta.url), 'utf8');
const tabs = readFileSync(new URL('../../src/components/Admin/UserSetup.tsx', import.meta.url), 'utf8');

assert.match(migration, /base_plus_commission/);
assert.match(migration, /commission_only/);
assert.match(migration, /base_amount_cents > 0/);
assert.match(migration, /sales_compensation_no_overlap/);
assert.match(migration, /AS \$lock\$[\s\S]*?\$lock\$;/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /p\.role = 'admin'/);
assert.doesNotMatch(migration, /recoverable_draw|nonrecoverable_draw/);
assert.match(fields, /Base pay is additional to commissions/);
assert.match(fields, /validateSalesCompensation/);
assert.match(add, /<SalesCompensationFields/);
assert.match(edit, /<SalesCompensationFields/);
assert.match(add, /save_sales_compensation_arrangement/);
assert.match(edit, /sales_compensation_arrangements/);
assert.match(tabs, /Required information complete/);
assert.match(tabs, /Required information missing/);
console.log('Sales compensation static contract checks passed. Database migration and browser behavior still require integration testing.');
