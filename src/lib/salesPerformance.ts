export interface CompetitionEntry { rank: number; repDisplayName: string; monthlyTotal: number; isCurrentUser: boolean; }
export interface CompetitionResult { month: string; timezone: string; trackingSince: string; leaderboard: CompetitionEntry[]; }
export interface PerformanceEvent { id: string; source_id: string; source_type: string; effective_at: string; net_amount: number; adjustment_of_id: string | null; customer_name: string; record_kind: 'order' | 'invoice'; }
export interface PerformanceReport { period: string; timezone: string; trackingSince: string; total: number; previousTotal: number; count: number; unassignedTotal: number | null; events: PerformanceEvent[]; }
function amount(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '') || !Number.isFinite(Number(value))) throw new Error('Invalid sales performance amount');
  return Number(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sales performance is unavailable');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value) throw new Error('Invalid sales performance response'); return value; }
export function parseCompetition(value: unknown): CompetitionResult {
  const d = object(value); if (!Array.isArray(d.leaderboard)) throw new Error('Invalid competition response');
  return { month: text(d.month), timezone: text(d.timezone), trackingSince: text(d.trackingSince), leaderboard: d.leaderboard.map(value => {
    const r = object(value); const rank = amount(r.rank);
    if (!Number.isInteger(rank) || rank < 1 || typeof r.isCurrentUser !== 'boolean') throw new Error('Invalid competition rank');
    return { rank, repDisplayName: text(r.repDisplayName), monthlyTotal: amount(r.monthlyTotal), isCurrentUser: r.isCurrentUser };
  }) };
}
export function parsePerformanceReport(value: unknown): PerformanceReport {
  const d = object(value); if (!Array.isArray(d.events)) throw new Error('Invalid performance events');
  const count = amount(d.count); if (!Number.isInteger(count) || count < d.events.length) throw new Error('Incomplete performance count');
  const events = d.events.map(value => { const r = object(value); if (!['order', 'invoice'].includes(String(r.record_kind))) throw new Error('Invalid performance record');
    return { id: text(r.id), source_id: text(r.source_id), source_type: text(r.source_type), effective_at: text(r.effective_at), net_amount: amount(r.net_amount), adjustment_of_id: r.adjustment_of_id ? text(r.adjustment_of_id) : null, customer_name: text(r.customer_name), record_kind: r.record_kind as 'order' | 'invoice' };
  });
  return { period: text(d.period), timezone: text(d.timezone), trackingSince: text(d.trackingSince), total: amount(d.total), previousTotal: amount(d.previousTotal), count, unassignedTotal: d.unassignedTotal == null ? null : amount(d.unassignedTotal), events };
}
