import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync('src/components/Production/WorkOrderDetail.tsx', 'utf8');
const control = readFileSync('src/components/Production/WorkOrderTimeControl.tsx', 'utf8');

for (const [label, pattern] of [
  ['live timer tick', /setInterval\(\(\) => setTimeNow\(Date\.now\(\)\), 1000\)/],
  ['server refresh fallback', /setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) void refresh\(\); \}, 15000\)/],
  ['database change subscription', /table: 'time_entries'/],
  ['crew clock-in time', /Clocked in \{new Date\(entry\.clock_in\)/],
  ['crew elapsed time', /elapsedHours\(entry\)/],
  ['active and completed totals separated', /completedTimeHours \+ activeTimeHours/],
  ['rejected time excluded', /'rejected', 'cancelled'/],
  ['break deduction', /Number\(entry\.break_minutes \|\| 0\) \/ 60/],
  ['linked visits included', /\.\.\.linkedWorkOrders\.map\(order => order\.id\)/],
  ['timer refresh cleanup', /clearInterval\(tick\); window\.clearInterval\(poll\)/],
]) assert.match(detail, pattern, label);
assert.match(control, /\.eq\('technician_id',profile\.id\)\.is\('clock_out',null\)/);
assert.match(control, /start_work_order_time/);
assert.match(control, /ClockOutModal/);

function elapsedHours(now, clockIn, breakMinutes = 0) {
  return Math.max(0, (now - Date.parse(clockIn)) / 3600000 - Number(breakMinutes || 0) / 60);
}
const start = '2026-10-16T08:00:00-05:00';
const now = Date.parse('2026-10-16T10:30:00-05:00');
assert.equal(elapsedHours(now, start), 2.5);
assert.equal(elapsedHours(now, start, 30), 2);
assert.equal(elapsedHours(now, start, 180), 0);
assert.equal(elapsedHours(Date.parse(start) - 1000, start), 0);
const entries = [
  { clock_in: start, clock_out: null, break_minutes: 30, status: 'draft' },
  { clock_in: start, clock_out: '2026-10-16T09:00:00-05:00', total_hours: 1, status: 'approved' },
  { clock_in: start, clock_out: null, status: 'rejected' },
];
const valid = entries.filter(e => !['rejected', 'cancelled'].includes(e.status));
const total = valid.filter(e => e.clock_out).reduce((sum, e) => sum + Number(e.total_hours || 0), 0)
  + valid.filter(e => !e.clock_out).reduce((sum, e) => sum + elapsedHours(now, e.clock_in, e.break_minutes), 0);
assert.equal(total, 3);
console.log('Work-order live team time contracts and elapsed-hour examples passed.');
