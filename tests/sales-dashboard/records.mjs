import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ entryPoints: ['src/lib/salesDashboardRecords.ts'], bundle: true, format: 'esm', write: false });
const { buildSalesLists, isStaleProposal, recordCount, recordTotal } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const now = new Date('2026-10-21T12:00:00Z');
const quota = { quotaStartDate: '2026-01-01', quotaEndDate: '2026-12-31' };
const proposal = (id, status, extra = {}) => ({ id, status, created_at: '2026-09-01T12:00:00Z', total: 100, ...extra });
const source = { proposals: [
  proposal('old-expired', 'expired', { valid_until: '2026-08-01' }),
  proposal('overdue-sent', 'sent', { valid_until: '2026-10-01' }),
  proposal('won', 'approved', { approved_at: '2026-10-20T12:00:00Z' }),
  proposal('lost', 'declined', { declined_at: '2026-10-19T12:00:00Z', decline_reason: 'price_too_high' }),
  proposal('archived-loss', 'archived', { declined_at: '2026-10-18T12:00:00Z' }),
  proposal('cancelled', 'cancelled'),
  proposal('active', 'sent', { valid_until: '2026-12-01', sent_at: '2026-10-15T12:00:00Z' }),
], leads: [{ id: 'untouched', status: 'claimed', priority: 'urgent', created_at: '2026-09-01', last_contact_date: null, next_follow_up: '2026-10-19' }, { id: 'closed', status: 'closed_lost', created_at: '2026-09-01' }], contacts: [], connections: [], orders: [{ id: 'native', status: 'active', created_at: '2026-10-12', contract_total: 999 }], months: [{ id: 'import', year: 2026, month: 10, total_sales: 5000, sales_order_count: 7 }] };
const lists = buildSalesLists(source, 'month', quota, now);
assert.deepEqual(lists.stale.map(r => r.id), ['old-expired', 'overdue-sent']);
assert.deepEqual(lists.won.map(r => r.id), ['won']);
assert.deepEqual(lists.lost.map(r => r.id), ['lost', 'archived-loss']);
assert.equal(lists.closed.length, 3, 'Expired/cancelled proposals do not become losses');
assert.equal(lists.pipeline.length, 1);
assert.equal(lists.sent.length, 1, 'Use event date, not creation date');
assert.equal(lists.created.length, 0);
assert.equal(lists.untouched.length, 1);
assert.equal(lists.staleLeads.length, 1);
assert.equal(lists.hot.length, 1, 'Database urgent priority is supported');
assert.equal(lists.followups.length, 1);
assert.equal(recordCount(lists.booked), 7);
assert.equal(recordTotal(lists.booked), 5000, 'Native orders are suppressed in imported months');
assert.equal(recordTotal(lists.runRate), 5000);
assert.equal(buildSalesLists(source, 'year', quota, now).created.length, 7);
for (const status of ['approved', 'approved_pending_action', 'declined', 'cancelled', 'archived']) assert.equal(isStaleProposal(proposal('terminal', status, { valid_until: '2020-01-01' }), '2026-10-21'), false);
assert.equal(isStaleProposal(proposal('inconsistent', 'expired', { approved_at: '2026-10-20' }), '2026-10-21'), false);
assert.equal(isStaleProposal(proposal('today', 'sent', { valid_until: '2026-10-21' }), '2026-10-21'), false, 'Valid through today is not expired');
assert.equal(buildSalesLists({ ...source, proposals: [], leads: [], months: [], orders: [] }, 'month', quota, now).stale.length, 0);
console.log('PASS: stale outcomes, event periods, real lead statuses, overdue/untouched leads, and imported/native sales reconciliation.');
const boundary = buildSalesLists({ ...source, timezone: 'America/Chicago', leads: [], proposals: [proposal('september-local', 'approved', { approved_at: '2026-10-01T02:00:00Z' }), proposal('october-local', 'approved', { approved_at: '2026-10-01T15:00:00Z' })] }, 'month', quota, now);
assert.deepEqual(boundary.won.map(r => r.id), ['october-local'], 'Periods use the organization day at UTC boundaries');
assert.equal(isStaleProposal(proposal('archived-expired', 'archived', { archived_loss_status: 'expired' }), '2026-10-21', now), true);
assert.equal(isStaleProposal(proposal('expired-today', 'sent', { expires_at: '2026-10-21T10:00:00Z' }), '2026-10-21', now), true);
console.log('PASS: organization calendar boundaries and archived/unprocessed expiry.');
