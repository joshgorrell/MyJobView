import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync('src/components/Technician/MyTimeLeaveRequest.tsx', 'utf8');
const daily = readFileSync('src/components/Technician/DailyClock.tsx', 'utf8');
const clock = readFileSync('src/components/Technician/EmployeeTimeClock.tsx', 'utf8');

// Same-day leave must be accessible to employees without a mandatory daily clock.
assert.match(clock, /MyTimeLeaveRequest/);
assert.doesNotMatch(daily, /submit_time_off|Request Same-Day Leave/);

// The employee must acknowledge the separate phone-call obligation.
assert.match(form, /You must personally call your manager/);
assert.match(form, /checked=\{calledManagerAcknowledged\}/);
assert.match(form, /!calledManagerAcknowledged/);
assert.match(form, /setCalledManagerAcknowledged\(false\)/);

// Preserve the existing approval workflow; no client-side payroll or attendance writes.
assert.match(form, /supabase\.rpc\('submit_time_off'/);
assert.match(form, /Manager phone call self-attested by employee/);
assert.match(form, /new Date\(\)\.toISOString\(\)/);
assert.match(form, /p_reason: leaveReason/);
assert.doesNotMatch(form, /\.from\('(?:daily_clock_entries|time_entries|payroll_entries)'\)/);

console.log('Same-day leave call-in contract passed.');
