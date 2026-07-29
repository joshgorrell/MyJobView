// ── Sales Dashboard Calculations ────────────────────────────────────
// Pure functions that derive display-ready values from SalesDashboardResult.
// No component calculates its own KPI independently — all go through here.

import type {
  SalesDashboardResult,
  KpiCardData,
  TrendDirection,
  AttentionItem,
  MonthlyTrendPoint,
} from './salesDashboardTypes';

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function trendFromPct(p: number | null): TrendDirection {
  if (p === null) return 'flat';
  if (p > 0) return 'up';
  if (p < 0) return 'down';
  return 'flat';
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ── Goal Progress ───────────────────────────────────────────────────
export interface GoalProgressData {
  annualQuota: number;
  ytdSales: number;
  pctAchieved: number;
  pacePct: number;
  aheadBehind: number;
  remainingGoal: number;
  weeksRemaining: number;
  requiredWeeklySales: number;
  forecast: number;
  status: 'ahead' | 'on_track' | 'behind' | 'no_quota';
  hasQuota: boolean;
}

export function computeGoalProgress(data: SalesDashboardResult): GoalProgressData {
  const { quota, bookedSales, runRate90Day } = data;
  const annualQuota = quota.annualQuota;
  const ytdSales = bookedSales.total;

  if (!quota.hasQuota || annualQuota <= 0) {
    return {
      annualQuota: 0,
      ytdSales,
      pctAchieved: 0,
      pacePct: 0,
      aheadBehind: 0,
      remainingGoal: 0,
      weeksRemaining: 0,
      requiredWeeklySales: 0,
      forecast: runRate90Day,
      status: 'no_quota',
      hasQuota: false,
    };
  }

  const pctAchieved = Math.round((ytdSales / annualQuota) * 100);
  const pacePct = quota.quotaElapsedPct;
  const aheadBehind = ytdSales - (annualQuota * pacePct / 100);
  const remainingGoal = Math.max(0, annualQuota - ytdSales);

  const today = new Date();
  const quotaEnd = new Date(quota.quotaEndDate);
  const daysRemaining = Math.max(0, Math.ceil((quotaEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const weeksRemaining = Math.ceil(daysRemaining / 7);
  const requiredWeeklySales = weeksRemaining > 0 ? remainingGoal / weeksRemaining : 0;

  let status: GoalProgressData['status'];
  if (pctAchieved >= pacePct + 5) status = 'ahead';
  else if (pctAchieved >= pacePct - 5) status = 'on_track';
  else status = 'behind';

  return {
    annualQuota,
    ytdSales,
    pctAchieved,
    pacePct,
    aheadBehind,
    remainingGoal,
    weeksRemaining,
    requiredWeeklySales,
    forecast: runRate90Day,
    status,
    hasQuota: true,
  };
}

// ── Current Pace KPI ────────────────────────────────────────────────
export function computeCurrentPaceKpi(data: SalesDashboardResult): KpiCardData {
  const forecast = data.runRate90Day;
  const quota = data.quota.annualQuota;
  const forecastVsQuota = quota > 0 ? pctChange(forecast, quota) : null;

  return {
    title: 'Current Pace (90-Day Run Rate)',
    value: formatCurrency(forecast),
    supportingText: quota > 0 ? `vs ${formatCurrency(quota)} annual goal` : 'Annualized from last 90 days',
    trend: trendFromPct(forecastVsQuota),
    trendPct: forecastVsQuota,
    comparisonBadge: quota > 0 ? `${forecast >= quota ? '+' : ''}${formatCurrency(forecast - quota)}` : null,
  };
}

// ── Sales Booked KPI ────────────────────────────────────────────────
export function computeSalesBookedKpi(data: SalesDashboardResult): KpiCardData {
  const current = data.bookedSales.total;
  const previous = data.bookedSales.prevTotal;
  const change = pctChange(current, previous);

  return {
    title: 'Sales Booked (This Quota Year)',
    value: formatCurrency(current),
    supportingText: `${data.bookedSales.count} order${data.bookedSales.count !== 1 ? 's' : ''} · Avg ${formatCurrency(data.bookedSales.avgSale)}`,
    trend: trendFromPct(change),
    trendPct: change,
    comparisonBadge: previous > 0 ? `Prev: ${formatCurrency(previous)}` : null,
  };
}

// ── Pipeline Coverage KPI ───────────────────────────────────────────
export function computePipelineCoverageKpi(data: SalesDashboardResult): KpiCardData {
  const pipeline = data.pipeline.total;
  const remainingGoal = Math.max(0, data.quota.annualQuota - data.bookedSales.total);
  const coverageRatio = remainingGoal > 0 ? pipeline / remainingGoal : 0;

  let healthLabel: string;
  let trend: TrendDirection;
  if (coverageRatio >= 3) { healthLabel = 'Healthy'; trend = 'up'; }
  else if (coverageRatio >= 1.5) { healthLabel = 'Adequate'; trend = 'flat'; }
  else { healthLabel = 'Low'; trend = 'down'; }

  return {
    title: 'Pipeline Coverage',
    value: formatCurrency(pipeline),
    supportingText: `${data.pipeline.count} active proposal${data.pipeline.count !== 1 ? 's' : ''} · ${healthLabel}`,
    trend,
    trendPct: null,
    comparisonBadge: remainingGoal > 0 ? `${coverageRatio.toFixed(1)}x remaining goal` : null,
  };
}

// ── Close Rate KPI ──────────────────────────────────────────────────
export function computeCloseRateKpi(data: SalesDashboardResult): KpiCardData {
  const current = data.closeRate.pct;
  const previous = data.closeRate.prevPct;
  const change = previous > 0 ? Math.round((current - previous) * 10) / 10 : null;
  const total = data.closeRate.wonCount + data.closeRate.lostCount;

  return {
    title: 'Close Rate',
    value: formatPct(current),
    supportingText: `${data.closeRate.wonCount} won / ${total} closed`,
    trend: change !== null ? trendFromPct(change) : 'flat',
    trendPct: change,
    comparisonBadge: previous > 0 ? `Prev: ${formatPct(previous)}` : null,
  };
}

// ── Monthly Trend for Chart ─────────────────────────────────────────
export interface ChartTrendPoint {
  label: string;
  total: number;
  isCurrentMonth: boolean;
}

export function computeChartTrend(trend: MonthlyTrendPoint[]): ChartTrendPoint[] {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return trend.map((p) => {
    const [year, month] = p.month.split('-');
    const monthIdx = parseInt(month, 10) - 1;
    return {
      label: `${monthNames[monthIdx] ?? ''} ${year.slice(2)}`,
      total: p.total,
      isCurrentMonth: p.month === currentMonth,
    };
  }).reverse();
}

// ── Rolling 3-month average ──────────────────────────────────────────
export function computeRollingAverage(trend: MonthlyTrendPoint[]): number[] {
  const reversed = [...trend].reverse();
  return reversed.map((_, i) => {
    const window = reversed.slice(Math.max(0, i - 2), i + 1);
    return window.reduce((sum, p) => sum + p.total, 0) / window.length;
  });
}

// ── Attention Items ─────────────────────────────────────────────────
export function computeAttentionItems(data: SalesDashboardResult): AttentionItem[] {
  const items: AttentionItem[] = [];
  const goal = computeGoalProgress(data);

  if (goal.hasQuota && goal.status === 'behind') {
    items.push({
      severity: 'critical',
      title: 'Behind on Sales Goal',
      description: `You are ${formatCurrency(Math.abs(goal.aheadBehind))} behind pace. Need ${formatCurrency(goal.requiredWeeklySales)}/week to catch up.`,
      actionLabel: 'View Pipeline',
      actionTab: 'pipeline',
    });
  }

  if (data.pipeline.count === 0) {
    items.push({
      severity: 'warning',
      title: 'No Active Proposals',
      description: 'Your pipeline is empty. Create a new proposal to start building toward your goal.',
      actionLabel: 'Create Proposal',
      actionTab: 'proposals',
    });
  } else if (data.pipeline.count > 0 && data.pipeline.total < goal.remainingGoal * 0.5 && goal.remainingGoal > 0) {
    items.push({
      severity: 'warning',
      title: 'Pipeline Too Thin',
      description: `Your pipeline (${formatCurrency(data.pipeline.total)}) covers less than 50% of your remaining goal (${formatCurrency(goal.remainingGoal)}).`,
      actionLabel: 'View Pipeline',
      actionTab: 'pipeline',
    });
  }

  if (data.closeRate.pct < 30 && (data.closeRate.wonCount + data.closeRate.lostCount) >= 5) {
    items.push({
      severity: 'info',
      title: 'Close Rate Below 30%',
      description: `Your close rate is ${formatPct(data.closeRate.pct)} across ${data.closeRate.wonCount + data.closeRate.lostCount} closed proposals. Review your recent losses for patterns.`,
      actionLabel: 'View Proposals',
      actionTab: 'proposals',
    });
  }

  if (items.length === 0 && goal.hasQuota && goal.status === 'ahead') {
    items.push({
      severity: 'info',
      title: 'Ahead of Pace',
      description: `You are ${formatCurrency(goal.aheadBehind)} ahead of your goal pace. Keep it up!`,
      actionLabel: 'View Performance',
      actionTab: 'performance',
    });
  }

  return items.slice(0, 5);
}
