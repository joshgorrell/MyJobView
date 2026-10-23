import { salesDate, type SalesSources } from './salesDashboardRecords';
import type { SalesDashboardResult } from './salesDashboardTypes';

// Aggregate the same tenant-scoped sources used by drilldowns; never fetch one RPC per rep.
export function companySalesDashboard(source: SalesSources, now = new Date()): SalesDashboardResult {
  const today = salesDate(now.toISOString(), source.timezone);
  const year = Number(today.slice(0, 4));
  const months = new Map<string, { total: number; count: number }>();
  const covered = new Set(source.months.map(m => `${m.user_id}:${m.year}-${String(m.month).padStart(2, '0')}`));
  const add = (month: string, total: number, count: number) => {
    const previous = months.get(month) || { total: 0, count: 0 };
    months.set(month, { total: previous.total + total, count: previous.count + count });
  };
  source.months.forEach(m => add(`${m.year}-${String(m.month).padStart(2, '0')}`, Number(m.total_sales || 0), Number(m.sales_order_count || 0)));
  source.orders.forEach(o => {
    const date = salesDate(o.booked_at || o.created_at, source.timezone);
    if (['cancelled', 'voided'].includes(o.status) || date > today || covered.has(`${o.sales_rep_id || o.created_by}:${date.slice(0, 7)}`)) return;
    add(date.slice(0, 7), Number(o.contract_total || 0), 1);
  });
  const sumYear = (target: number) => [...months].filter(([month]) => month.startsWith(`${target}-`) && (target !== year || month <= today.slice(0, 7))).reduce((sum, [, value]) => ({ total: sum.total + value.total, count: sum.count + value.count }), { total: 0, count: 0 });
  const current = sumYear(year), previous = sumYear(year - 1);
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(year, Number(today.slice(5, 7)) - 1 - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { month, ...(months.get(month) || { total: 0, count: 0 }) };
  });
  return {
    repId: '', repDisplayName: 'All sales',
    quota: { annualQuota: 0, monthlyQuota: 0, quotaStartDate: `${year}-01-01`, quotaEndDate: `${year}-12-31`, quotaElapsedPct: 0, hasQuota: false },
    bookedSales: { ...current, avgSale: current.count ? current.total / current.count : 0, prevTotal: previous.total, prevCount: previous.count },
    pipeline: { total: 0, count: 0 }, closeRate: { pct: 0, wonCount: 0, lostCount: 0, prevPct: 0, prevWonCount: 0, prevLostCount: 0 },
    runRate90Day: 0, monthlyTrend, ytdTotal: current.total, ytdCount: current.count, prevYearTotal: previous.total,
    allTimeTotal: [...months].filter(([month]) => month <= today.slice(0, 7)).reduce((sum, [, value]) => sum + value.total, 0),
  };
}
