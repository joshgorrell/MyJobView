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

  for (const rep of reps) {
    const annualQuota = parseFloat(String(rep.current_annual_quota || 0));
    const legacyMonthly = parseFloat(String(rep.monthly_sales_target || 0)) * 12;
    const effectiveQuota = annualQuota > 0 ? annualQuota : legacyMonthly;

    // Fetch YTD sales orders for this rep
    const { data: ytdOrders } = await supabase
      .from('sales_orders')
      .select('contract_total')
      .not('status', 'in', '("cancelled","voided")')
      .or(`sales_rep_id.eq.${rep.id},created_by.eq.${rep.id}`)
      .gte('created_at', yearStartIso)
      .lte('created_at', nowIso);

    const ytdSales = (ytdOrders || []).reduce(
      (sum, o) => sum + parseFloat(String(o.contract_total || 0)),
      0
    );

    // Fetch this month's sales
    const { data: monthOrders } = await supabase
      .from('sales_orders')
      .select('contract_total')
      .not('status', 'in', '("cancelled","voided")')
      .or(`sales_rep_id.eq.${rep.id},created_by.eq.${rep.id}`)
      .gte('created_at', monthStartIso)
      .lte('created_at', nowIso);

    const thisMonthSales = (monthOrders || []).reduce(
      (sum, o) => sum + parseFloat(String(o.contract_total || 0)),
      0
    );

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
