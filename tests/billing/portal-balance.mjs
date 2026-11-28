import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual component's pure balance calculation without mounting React.
const source = readFileSync(new URL('../../src/components/Portal/PortalInvoices.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const outstandingInvoices =');
const end = source.indexOf('  const selectedInvoices =', start);
assert.ok(start >= 0 && end > start, 'balance calculation must exist');
const calculate = new Function('invoices', 'Date', source.slice(start, end) + '\nreturn {outstandingCents, overdueCents};');
class FixedDate extends Date { constructor() { super(2026, 10, 27, 12); } }
const invoice = (amount_due, due_date, status = 'submitted') => ({amount_due, due_date, status});
assert.deepEqual(calculate([
  invoice(100.01, '2026-11-26'), invoice(20.02, '2026-11-27'),
  invoice(30.03, '2026-11-28'), invoice(40.04, null),
  invoice(10.05, '2026-11-01', 'partial'), invoice(1000, '2026-11-01', 'paid'),
  invoice(1000, '2026-11-01', 'void'), invoice(1000, '2026-11-01', 'draft'),
  invoice(0, '2026-11-01'), invoice(-10, '2026-11-01')
], FixedDate), {outstandingCents: 20015, overdueCents: 11006});
assert.deepEqual(calculate([], FixedDate), {outstandingCents: 0, overdueCents: 0});
console.log('Portal invoice balance regression checks passed');
