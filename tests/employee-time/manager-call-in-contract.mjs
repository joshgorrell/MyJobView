import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104114500_manager_record_employee_call_in.sql','utf8');
const ui=readFileSync('src/components/Admin/PTOManagement.tsx','utf8');
assert.match(sql,/OLD\.recorded_by = auth\.uid\(\)/);
assert.match(ui,/Record Employee Call-In/);
assert.match(ui,/record_employee_call_in/);
assert.match(ui,/callInConfirmed/);
console.log('Manager call-in static permission and approval contract passed.');
