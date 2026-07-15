import { supabase } from './supabase';

export type KpiScope =
  | { type: 'company' }
  | { type: 'office'; officeId: string }
  | { type: 'rep'; repId: string };

export type DateRangeKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';

export interface SalesKpis {
  averageSale: number;
  averageMarginPct: number;
  salesOrderCount: number;
}

function getDateRange(key: DateRangeKey): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (key) {
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      lastDay.setHours(23, 59, 59, 999);
      return { start, end: lastDay };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { start, end };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end };
    }
    case 'all_time':
    default: {
      const start = new Date(2000, 0, 1);
      return { start, end };
    }
  }
}

export async function fetchSalesKpis(
  scope: KpiScope,
  dateRange: DateRangeKey = 'this_month'
): Promise<SalesKpis> {
  const { start, end } = getDateRange(dateRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Build sales_orders query with scope filtering
  let ordersQuery = supabase
    .from('sales_orders')
    .select('id, contract_total, proposal_id, sales_rep_id, created_by, contact_id')
    .not('status', 'in', '("cancelled","voided")')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (scope.type === 'rep') {
    ordersQuery = ordersQuery.or(`sales_rep_id.eq.${scope.repId},created_by.eq.${scope.repId}`);
  } else if (scope.type === 'office') {
    ordersQuery = ordersQuery.eq('contact_id', scope.officeId);
  }

  const { data: orders, error } = await ordersQuery;
  if (error) throw error;
  if (!orders || orders.length === 0) {
    return { averageSale: 0, averageMarginPct: 0, salesOrderCount: 0 };
  }

  const orderIds = orders.map(o => o.id);
  const totals = orders.reduce(
    (acc, o) => {
      const ct = parseFloat(String(o.contract_total || 0));
      acc.totalRevenue += ct;
      return acc;
    },
    { totalRevenue: 0 }
  );

  const averageSale = totals.totalRevenue / orders.length;

  // Fetch line items for margin calculation via proposal_ids
  const proposalIds = orders
    .map(o => o.proposal_id)
    .filter((id): id is string => !!id);

  let averageMarginPct = 0;

  if (proposalIds.length > 0) {
    const { data: lineItems, error: liError } = await supabase
      .from('proposal_line_items')
      .select('proposal_id, line_total, labor_total, cost, quantity')
      .in('proposal_id', proposalIds);

    if (!liError && lineItems && lineItems.length > 0) {
      // Group line items by proposal_id
      const byProposal = new Map<string, { revenue: number; cost: number }>();
      for (const li of lineItems) {
        const pid = li.proposal_id;
        if (!pid) continue;
        const revenue = parseFloat(String(li.line_total || 0)) + parseFloat(String(li.labor_total || 0));
        const cost = parseFloat(String(li.cost || 0)) * parseFloat(String(li.quantity || 1));
        const existing = byProposal.get(pid) || { revenue: 0, cost: 0 };
        existing.revenue += revenue;
        existing.cost += cost;
        byProposal.set(pid, existing);
      }

      // Calculate margin per sales order (via its proposal_id)
      const margins: number[] = [];
      for (const order of orders) {
        const pid = order.proposal_id;
        if (!pid) continue;
        const pl = byProposal.get(pid);
        if (!pl || pl.revenue <= 0) continue;
        const margin = ((pl.revenue - pl.cost) / pl.revenue) * 100;
        margins.push(margin);
      }

      if (margins.length > 0) {
        averageMarginPct = margins.reduce((a, b) => a + b, 0) / margins.length;
      }
    }
  }

  return {
    averageSale,
    averageMarginPct,
    salesOrderCount: orders.length,
  };
}

export interface RepGoalProgress {
  repId: string;
  repName: string;
  annualQuota: number;
  ytdSales: number;
  quotaProgress: number;
  monthlyQuota: number;
  thisMonthSales: number;
}

export async function fetchAllRepGoalProgress(orgId: string): Promise<RepGoalProgress[]> {
  // Get all sales reps with quota info
  const { data: reps, error: repError } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, current_annual_quota, monthly_sales_target')
    .eq('organization_id', orgId)
    .eq('can_create_proposals', true)
    .order('first_name', { ascending: true });

  if (repError) throw repError;
  if (!reps || reps.length === 0) return [];

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStartIso = yearStart.toISOString();
  const monthStartIso = monthStart.toISOString();
  const nowIso = now.toISOString();

  const results: RepGoalProgress[] = [];

  // Batch-fetch all sales_monthly_stats for this org (YTD + current month)
  const { data: allMonthlyStats } = await supabase
    .from('sales_monthly_stats')
    .select('user_id, year, month, total_sales')
    .eq('organization_id', orgId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  for (const rep of reps) {
    const annualQuota = parseFloat(String(rep.current_annual_quota || 0));
    const legacyMonthly = parseFloat(String(rep.monthly_sales_target || 0)) * 12;
    const effectiveQuota = annualQuota > 0 ? annualQuota : legacyMonthly;

    // YTD sales from sales_monthly_stats (includes manual uploads)
    const repYtdStats = (allMonthlyStats || []).filter(
      (r: any) => r.user_id === rep.id && r.year === now.getFullYear() && r.month <= (now.getMonth() + 1)
    );
    const ytdStatsTotal = repYtdStats.reduce(
      (sum: number, r: any) => sum + parseFloat(String(r.total_sales || 0)), 0
    );

    // This month from sales_monthly_stats
    const repMonthStat = (allMonthlyStats || []).find(
      (r: any) => r.user_id === rep.id && r.year === now.getFullYear() && r.month === (now.getMonth() + 1)
    );
    const monthStatsTotal = repMonthStat ? parseFloat(String(repMonthStat.total_sales || 0)) : 0;

    // Fetch YTD sales orders for this rep (live data)
    const { data: ytdOrders } = await supabase
      .from('sales_orders')
      .select('contract_total')
      .not('status', 'in', '("cancelled","voided")')
      .or(`sales_rep_id.eq.${rep.id},created_by.eq.${rep.id}`)
      .gte('created_at', yearStartIso)
      .lte('created_at', nowIso);

    const ytdOrderTotal = (ytdOrders || []).reduce(
      (sum, o) => sum + parseFloat(String(o.contract_total || 0)),
      0
    );

    // Fetch this month's sales orders
    const { data: monthOrders } = await supabase
      .from('sales_orders')
      .select('contract_total')
      .not('status', 'in', '("cancelled","voided")')
      .or(`sales_rep_id.eq.${rep.id},created_by.eq.${rep.id}`)
      .gte('created_at', monthStartIso)
      .lte('created_at', nowIso);

    const monthOrderTotal = (monthOrders || []).reduce(
      (sum, o) => sum + parseFloat(String(o.contract_total || 0)),
      0
    );

    // Prioritize sales_monthly_stats (includes manual uploads), fall back to sales_orders
    const ytdSales = ytdStatsTotal > 0 ? ytdStatsTotal : ytdOrderTotal;
    const thisMonthSales = monthStatsTotal > 0 ? monthStatsTotal : monthOrderTotal;

    const quotaProgress = effectiveQuota > 0 ? Math.round((ytdSales / effectiveQuota) * 100) : 0;
    const monthlyQuota = effectiveQuota > 0 ? effectiveQuota / 12 : 0;

    const repName = rep.first_name && rep.last_name
      ? `${rep.first_name} ${rep.last_name}`
      : rep.full_name || 'Unknown';

    results.push({
      repId: rep.id,
      repName,
      annualQuota: effectiveQuota,
      ytdSales,
      quotaProgress,
      monthlyQuota,
      thisMonthSales,
    });
  }

  // Sort by YTD sales descending
  results.sort((a, b) => b.ytdSales - a.ytdSales);
  return results;
}

export async function fetchCompanyKpis(orgId: string): Promise<SalesKpis> {
  return fetchSalesKpis({ type: 'company' }, 'this_month');
}

// ── TV Dashboard aggregated data ─────────────────────────────────────────────

export interface TvDashboardData {
  averageSale: number;
  averageMarginPct: number;
  salesOrderCount: number;
  monthlyRevenue: number;
  pipelineValue: number;
  proposalsOut: number;
  proposalsCreated: number;
  winRate: number;
  conversionRate: number;
  averageDealSize: number;
  ytdTotal: number;
  prevYearSamePeriod: number;
  prevYearFull: number;
  yoyPct: number | null;
  yoyDir: 'up' | 'down' | 'flat';
  monthlyTrend: Array<{ label: string; total: number; isCurrentMonth: boolean }>;
  yearlyBreakdown: Array<{ year: number; total: number; yoy: number | null; dir: 'up' | 'down' | 'neutral' }>;
}

function monthLabel(month: number): string {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[month - 1] || '';
}

export async function fetchTvDashboardData(orgId: string): Promise<TvDashboardData> {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const prevYear = curYear - 1;

  const monthStart = new Date(curYear, now.getMonth(), 1).toISOString();
  const monthEnd = new Date(curYear, now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  const yearStartIso = new Date(curYear, 0, 1).toISOString();
  const nowIso = now.toISOString();

  const safe = <T>(q: PromiseLike<{ data: T | null; error: any | null }>) =>
    Promise.resolve(q).catch(() => ({ data: null, error: null }));

  const [
    companyKpisResult,
    monthlyStatsResult,
    ytdStatsResult,
    prevYearSamePeriodStatsResult,
    prevYearFullStatsResult,
    allStatsResult,
    activePipelineResult,
    proposalsThisMonthResult,
    allTimeProposalsResult,
    approvedProposalsThisMonthResult,
    ytdSalesOrdersResult,
    importedHistResult,
  ] = await Promise.all([
    safe(fetchSalesKpis({ type: 'company' }, 'this_month')),
    safe(supabase
      .from('sales_monthly_stats')
      .select('year, month, total_sales')
      .eq('organization_id', orgId)
      .eq('year', curYear)
      .eq('month', curMonth)),
    safe(supabase
      .from('sales_monthly_stats')
      .select('total_sales')
      .eq('organization_id', orgId)
      .eq('year', curYear)
      .lte('month', curMonth)),
    safe(supabase
      .from('sales_monthly_stats')
      .select('total_sales')
      .eq('organization_id', orgId)
      .eq('year', prevYear)
      .lte('month', curMonth)),
    safe(supabase
      .from('sales_monthly_stats')
      .select('total_sales')
      .eq('organization_id', orgId)
      .eq('year', prevYear)),
    safe(supabase
      .from('sales_monthly_stats')
      .select('year, month, total_sales')
      .eq('organization_id', orgId)
      .order('year', { ascending: true })
      .order('month', { ascending: true })),
    safe(supabase
      .from('proposals')
      .select('id, status, total')
      .eq('organization_id', orgId)
      .in('status', ['designing', 'ready_to_submit', 'sent', 'portal'])),
    safe(supabase
      .from('proposals')
      .select('id, status, total')
      .eq('organization_id', orgId)
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)),
    safe(supabase
      .from('proposals')
      .select('id, status')
      .eq('organization_id', orgId)
      .in('status', ['approved', 'approved_pending_action', 'declined', 'cancelled', 'expired'])),
    safe(supabase
      .from('proposals')
      .select('id, total')
      .eq('organization_id', orgId)
      .in('status', ['approved', 'approved_pending_action'])
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)),
    safe(supabase
      .from('sales_orders')
      .select('contract_total, created_at')
      .not('status', 'in', '("cancelled","voided")')
      .gte('created_at', yearStartIso)
      .lte('created_at', nowIso)),
    safe(supabase
      .from('sales_history_monthly')
      .select('stat_year, invoice_total')
      .eq('organization_id', orgId)
      .eq('source_type', 'historical_import')
      .order('stat_year', { ascending: true })),
  ]);

  const companyKpis = companyKpisResult.data as SalesKpis || { averageSale: 0, averageMarginPct: 0, salesOrderCount: 0 };

  // Monthly revenue: 3-tier fallback matching SalesDashboard
  // 1) sales_monthly_stats (includes manual uploads)  2) sales_orders  3) approved proposals
  const monthlyStatsRows = monthlyStatsResult.data || [];
  const monthlyStatsTotal = monthlyStatsRows.reduce(
    (sum: number, r: any) => sum + parseFloat(String(r.total_sales || 0)), 0
  );
  const salesOrdersRevenue = companyKpis.averageSale * companyKpis.salesOrderCount;
  const approvedProposalsThisMonth = approvedProposalsThisMonthResult.data || [];
  const approvedProposalRevenue = approvedProposalsThisMonth.reduce(
    (sum: number, p: any) => sum + parseFloat(String(p.total || 0)), 0
  );
  const monthlyRevenue = monthlyStatsTotal > 0
    ? monthlyStatsTotal
    : salesOrdersRevenue > 0
      ? salesOrdersRevenue
      : approvedProposalRevenue;

  // YTD: start with sales_monthly_stats, then supplement with sales_orders for months not covered
  const ytdStatsRows = ytdStatsResult.data || [];
  const ytdFromStats = ytdStatsRows.reduce(
    (sum: number, r: any) => sum + parseFloat(String(r.total_sales || 0)), 0
  );
  // Determine which months already have stats coverage
  const statsMonthsCovered = new Set<number>();
  ytdStatsRows.forEach((r: any) => statsMonthsCovered.add(r.month));
  // Add sales_orders revenue for months without stats
  const ytdSalesOrders = ytdSalesOrdersResult.data || [];
  const salesOrdersByMonth = new Map<number, number>();
  ytdSalesOrders.forEach((o: any) => {
    const m = new Date(o.created_at).getMonth() + 1;
    if (m <= curMonth) {
      salesOrdersByMonth.set(m, (salesOrdersByMonth.get(m) || 0) + parseFloat(String(o.contract_total || 0)));
    }
  });
  let ytdSupplement = 0;
  salesOrdersByMonth.forEach((total, m) => {
    if (!statsMonthsCovered.has(m)) ytdSupplement += total;
  });
  const ytdTotal = ytdFromStats + ytdSupplement;

  // Previous year same period
  const prevYearSamePeriodRows = prevYearSamePeriodStatsResult.data || [];
  const prevYearSamePeriod = prevYearSamePeriodRows.reduce(
    (sum: number, r: any) => sum + parseFloat(String(r.total_sales || 0)), 0
  );

  // Previous year full
  const prevYearFullRows = prevYearFullStatsResult.data || [];
  const prevYearFull = prevYearFullRows.reduce(
    (sum: number, r: any) => sum + parseFloat(String(r.total_sales || 0)), 0
  );

  // YoY
  const yoyPct = prevYearSamePeriod > 0
    ? Math.round(((ytdTotal - prevYearSamePeriod) / prevYearSamePeriod) * 100)
    : null;
  const yoyDir: 'up' | 'down' | 'flat' =
    yoyPct === null ? 'flat' : yoyPct > 0 ? 'up' : yoyPct < 0 ? 'down' : 'flat';

  // Pipeline
  const activePipeline = activePipelineResult.data || [];
  const pipelineValue = activePipeline.reduce(
    (sum: number, p: any) => sum + parseFloat(String(p.total || 0)), 0
  );
  const proposalsOut = activePipeline.filter((p: any) =>
    ['sent', 'portal'].includes(p.status)
  ).length;

  // Proposals this month
  const proposalsThisMonth = proposalsThisMonthResult.data || [];
  const proposalsCreated = proposalsThisMonth.length;

  // Win rate from all-time proposals
  const allTimeProposals = allTimeProposalsResult.data || [];
  const approvedCount = allTimeProposals.filter((p: any) =>
    ['approved', 'approved_pending_action'].includes(p.status)
  ).length;
  const declinedCount = allTimeProposals.filter((p: any) => p.status === 'declined').length;
  const cancelledCount = allTimeProposals.filter((p: any) => p.status === 'cancelled').length;
  const expiredCount = allTimeProposals.filter((p: any) => p.status === 'expired').length;
  const closedUniverse = approvedCount + declinedCount + cancelledCount + expiredCount;
  const winRate = closedUniverse > 0 ? Math.round((approvedCount / closedUniverse) * 100) : 0;

  // Conversion rate: approved proposals created this month / total proposals created this month
  const approvedThisMonth = proposalsThisMonth.filter((p: any) =>
    ['approved', 'approved_pending_action'].includes(p.status)
  ).length;
  const conversionRate = proposalsCreated > 0
    ? Math.round((approvedThisMonth / proposalsCreated) * 100)
    : 0;

  // Average deal size: fall back to approved proposals count when no sales orders
  const dealCount = companyKpis.salesOrderCount > 0
    ? companyKpis.salesOrderCount
    : approvedProposalsThisMonth.length;
  const averageDealSize = dealCount > 0 ? monthlyRevenue / dealCount : 0;

  // 24-month trend from all sales_monthly_stats
  const allStats = allStatsResult.data || [];
  const monthlyTrend: Array<{ label: string; total: number; isCurrentMonth: boolean }> = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const row = allStats.find((r: any) => r.year === yr && r.month === mo);
    monthlyTrend.push({
      label: `${monthLabel(mo)} ${yr}`,
      total: row ? parseFloat(String(row.total_sales || 0)) : 0,
      isCurrentMonth: i === 0,
    });
  }

  // Yearly breakdown: derive from sales_monthly_stats (authoritative, includes manual uploads),
  // then supplement with imported historical for years not covered
  const byYear = new Map<number, number>();
  allStats.forEach((r: any) => {
    const prev = byYear.get(r.year) || 0;
    byYear.set(r.year, prev + parseFloat(String(r.total_sales || 0)));
  });
  // Merge imported historical for years not in live data
  const importedHist = importedHistResult.data || [];
  const importedByYear = new Map<number, number>();
  importedHist.forEach((r: any) => {
    const yr = r.stat_year;
    const prev = importedByYear.get(yr) || 0;
    importedByYear.set(yr, prev + parseFloat(String(r.invoice_total || 0)));
  });
  importedByYear.forEach((total, year) => {
    if (!byYear.has(year)) byYear.set(year, total);
  });

  const sortedYears = Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]);
  const yearlyBreakdown = sortedYears.map(([year, total], idx) => {
    if (idx === 0) return { year, total, yoy: null as number | null, dir: 'neutral' as const };
    const prev = sortedYears[idx - 1][1];
    const pct = prev > 0 ? Math.round(((total - prev) / prev) * 100 * 10) / 10 : null;
    return {
      year,
      total,
      yoy: pct,
      dir: pct === null ? 'neutral' as const : pct > 0 ? 'up' as const : 'down' as const,
    };
  });

  return {
    averageSale: companyKpis.averageSale,
    averageMarginPct: companyKpis.averageMarginPct,
    salesOrderCount: companyKpis.salesOrderCount,
    monthlyRevenue,
    pipelineValue,
    proposalsOut,
    proposalsCreated,
    winRate,
    conversionRate,
    averageDealSize,
    ytdTotal,
    prevYearSamePeriod,
    prevYearFull,
    yoyPct,
    yoyDir,
    monthlyTrend,
    yearlyBreakdown,
  };
}
