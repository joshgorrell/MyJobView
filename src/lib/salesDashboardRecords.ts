import type { QuotaInfo } from './salesDashboardTypes';

export type SalesPeriod = 'month' | 'quarter' | 'year' | 'quota';
export type RecordKind = 'proposal' | 'lead' | 'contact' | 'connection' | 'order' | 'source';
export interface SalesRecord {
  id: string;
  kind: RecordKind;
  recordId?: string;
  title: string;
  customer: string;
  status: string;
  date: string;
  amount?: number;
  detail?: string;
  reason?: string;
  weight?: number;
}
export type SalesListKey = 'won' | 'lost' | 'closed' | 'stale' | 'pipeline' | 'contacts' | 'connections' | 'created' | 'sent' | 'followups' | 'untouched' | 'hot' | 'staleLeads' | 'feedback' | 'booked' | 'runRate';
export const SALES_LIST_LABELS: Record<SalesListKey, string> = {
  won: 'Won Proposals', lost: 'Lost Proposals', closed: 'Closed Proposals', stale: 'Stale Proposals',
  pipeline: 'Active Proposals', contacts: 'Contacts Added', connections: 'Connections Logged',
  created: 'Proposals Created', sent: 'Proposals Sent', followups: 'Follow-ups Due', untouched: 'Untouched Leads',
  hot: 'Hot Leads', staleLeads: 'Stale Leads', feedback: 'Losses Missing an Initial Reason', booked: 'Booked Sales Sources', runRate: '90-Day Sales Sources',
};
export type SalesLists = Record<SalesListKey, SalesRecord[]>;
export interface SalesSources { proposals: any[]; leads: any[]; contacts: any[]; connections: any[]; orders: any[]; months: any[]; occurrences?: any[]; timezone?: string; }
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function periodBounds(period: SalesPeriod, quota: QuotaInfo, now = new Date()) {
  const year = now.getFullYear();
  const start = period === 'quota' ? quota.quotaStartDate : dateKey(new Date(year, period === 'year' ? 0 : period === 'quarter' ? Math.floor(now.getMonth() / 3) * 3 : now.getMonth(), 1));
  return { start, end: dateKey(now) };
}
export function isStaleProposal(p: any, today: string, now = new Date()): boolean {
  // Expired is unresolved, never an inferred loss. Terminal/archived outcomes stay separate.
  const status = p.status === 'archived' ? p.archived_loss_status || 'archived' : p.status;
  if (['approved', 'approved_pending_action', 'declined', 'cancelled', 'archived'].includes(status) || p.approved_at || p.declined_at) return false;
  return status === 'expired' || (['sent', 'portal'].includes(status) && (p.expires_at ? new Date(p.expires_at).getTime() < now.getTime() : !!p.valid_until && p.valid_until < today));
}
const name = (r: any) => r.contact?.full_name || r.contact?.company_name || r.contact_name || r.full_name || r.company_name || 'Customer';
export function salesDate(value: string, timezone?: string): string {
  if (!value || value.length === 10 || !timezone) return value?.slice(0, 10) || '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
const inRange = (date: string | null, start: string, end: string, timezone?: string) => !!date && salesDate(date, timezone) >= start && salesDate(date, timezone) <= end;
export const recordCount = (rows: SalesRecord[]) => rows.reduce((sum, r) => sum + (r.weight ?? 1), 0);
export const recordTotal = (rows: SalesRecord[]) => rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
export function buildSalesLists(source: SalesSources, period: SalesPeriod, quota: QuotaInfo, now = new Date()): SalesLists {
  const lists = Object.fromEntries(Object.keys(SALES_LIST_LABELS).map(k => [k, []])) as unknown as SalesLists;
  const calendarNow = source.timezone ? new Date(`${salesDate(now.toISOString(), source.timezone)}T12:00:00`) : now;
  const today = dateKey(calendarNow);
  const { start, end } = periodBounds(period, quota, calendarNow);
  const within = (date: string | null, start: string, end: string) => inRange(date, start, end, source.timezone);
  for (const p of source.proposals) {
    const row: SalesRecord = { id: p.id, kind: 'proposal', title: p.proposal_number || p.title || 'Proposal', customer: name(p), status: p.status, date: p.created_at, amount: Number(p.total || 0), reason: p.decline_reason, detail: p.decline_notes || '' };
    if (within(p.created_at, start, end)) lists.created.push(row);
    if (within(p.sent_at, start, end)) lists.sent.push({ ...row, date: p.sent_at });
    const won = ['approved', 'approved_pending_action'].includes(p.status);
    const lost = p.status === 'declined' || (p.status === 'archived' && (p.archived_loss_status === 'declined' || !!p.declined_at));
    if (won && within(p.approved_at || p.created_at, start, end)) lists.won.push({ ...row, date: p.approved_at || p.created_at });
    if (lost && within(p.declined_at || p.created_at, start, end)) {
      const loss = { ...row, date: p.declined_at || p.created_at, detail: p.decline_notes || p.decline_reason || 'Feedback needed' };
      lists.lost.push(loss);
      if (!p.decline_reason || p.decline_reason === 'unknown') lists.feedback.push(loss);
    }
    if (isStaleProposal(p, today, now)) lists.stale.push({ ...row, date: p.expires_at || p.valid_until || p.created_at, detail: p.expires_at || p.valid_until ? `${Math.max(0, Math.floor((new Date(today).getTime() - new Date(p.expires_at || p.valid_until).getTime()) / 86400000))} days overdue` : 'Expired; awaiting a decision' });
    else if (['designing', 'ready_to_submit', 'sent', 'portal'].includes(p.status)) lists.pipeline.push(row);
  }
  lists.closed = [...lists.won, ...lists.lost];
  for (const c of source.contacts) if (c.createdByRep !== false && within(c.created_at, start, end)) lists.contacts.push({ id: c.id, kind: 'contact', title: c.full_name || c.company_name || 'Contact', customer: c.company_name || '', status: c.contact_type || 'contact', date: c.created_at });
  for (const c of source.connections) if (within(c.connection_date, start, end)) lists.connections.push({ id: c.id, kind: 'connection', title: (c.connection_type || 'connection').replace(/_/g, ' '), customer: name(c), status: 'logged', date: c.connection_date, detail: c.notes || '' });
  for (const c of source.contacts) if (c.assignedToRep && c.next_follow_up && salesDate(c.next_follow_up, source.timezone) <= today) lists.followups.push({ id: c.id, kind: 'contact', title: c.full_name || c.company_name || 'Contact', customer: c.company_name || '', status: 'follow-up due', date: c.next_follow_up });
  for (const c of source.connections) if (c.follow_up_needed && !c.completed_at && c.reminder_date && salesDate(c.reminder_date, source.timezone) <= today) lists.followups.push({ id: c.id, kind: 'connection', title: 'Connection follow-up', customer: name(c), status: 'follow-up due', date: c.reminder_date, detail: c.notes || '' });
  for (const c of source.occurrences || []) if (c.scheduled_date <= today) lists.followups.push({ id: `occurrence-${c.id}`, recordId: c.prospect_id, kind: 'contact', title: 'Scheduled connection', customer: name(c), status: 'pending', date: c.scheduled_date, detail: c.schedule?.default_notes || '' });
  const weekAgo = new Date(calendarNow); weekAgo.setDate(weekAgo.getDate() - 7);
  for (const l of source.leads) {
    if (!['unclaimed', 'claimed', 'escalated', 'in_progress', 'new', 'contacted', 'qualified', 'proposal', 'negotiation'].includes(l.status)) continue;
    const row: SalesRecord = { id: l.id, kind: 'lead', title: l.contact_name || l.company_name || 'Lead', customer: l.company_name || '', status: l.status, date: l.last_contact_date || l.created_at, amount: Number(l.estimated_value || 0) };
    if (!l.last_contact_date) lists.untouched.push({ ...row, detail: 'Never contacted' });
    if (!l.last_contact_date ? salesDate(l.created_at, source.timezone) <= dateKey(weekAgo) : salesDate(l.last_contact_date, source.timezone) <= dateKey(weekAgo)) lists.staleLeads.push({ ...row, detail: l.last_contact_date ? 'No contact in 7+ days' : 'Never contacted' });
    if (['urgent', 'critical', 'high'].includes(l.priority)) lists.hot.push(row);
    if (l.next_follow_up && salesDate(l.next_follow_up, source.timezone) <= today) lists.followups.push({ ...row, date: l.next_follow_up, detail: salesDate(l.next_follow_up, source.timezone) < today ? 'Overdue follow-up' : 'Due today' });
  }
  // Match the existing RPC's imported month precedence; do not double-count native orders.
  const qStart = quota.quotaStartDate; const qEnd = quota.quotaEndDate;
  const firstRunMonth = new Date(calendarNow.getFullYear(), calendarNow.getMonth() - 2, 1);
  for (const m of source.months) {
    const month = `${m.year}-${String(m.month).padStart(2, '0')}`;
    const sourceRow: SalesRecord = { id: m.id, kind: 'source', title: `Sales report ${month}`, customer: 'Imported monthly summary', status: 'reported', date: `${month}-01`, amount: Number(m.total_sales || 0), weight: Number(m.sales_order_count || 0), detail: `${m.sales_order_count || 0} reported orders. This import contains summary totals; individual customer orders were not imported.` };
    if (month >= dateKey(firstRunMonth).slice(0, 7) && month <= today.slice(0, 7)) lists.runRate.push(sourceRow);
    if (month >= qStart.slice(0, 7) && month <= qEnd.slice(0, 7)) lists.booked.push({ id: m.id, kind: 'source', title: `Sales report ${month}`, customer: 'Imported monthly summary', status: 'reported', date: `${month}-01`, amount: Number(m.total_sales || 0), weight: Number(m.sales_order_count || 0), detail: `${m.sales_order_count || 0} reported orders. This import contains summary totals; individual customer orders were not imported.` });
  }
  const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  for (const o of source.orders) {
    if (['cancelled', 'voided'].includes(o.status)) continue;
    const date = o.booked_at || o.created_at;
    const row: SalesRecord = { id: o.id, kind: 'order', title: o.order_number || 'Sales Order', customer: name(o), status: o.status, date, amount: Number(o.contract_total || 0) };
    if (within(date, qStart, qEnd) && !source.months.some(m => `${m.year}-${String(m.month).padStart(2, '0')}` === date.slice(0, 7))) lists.booked.push(row);
    if (within(date, dateKey(ninetyDaysAgo), today) && !source.months.some(m => `${m.year}-${String(m.month).padStart(2, '0')}` === date.slice(0, 7))) lists.runRate.push(row);
  }
  Object.values(lists).forEach(rows => rows.sort((a, b) => b.date.localeCompare(a.date)));
  lists.stale.sort((a, b) => a.date.localeCompare(b.date));
  lists.followups.sort((a, b) => a.date.localeCompare(b.date));
  return lists;
}
