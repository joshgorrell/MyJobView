// ── Sales Dashboard Types ───────────────────────────────────────────
// Centralized type definitions for the sales dashboard.
// All KPI cards and charts consume values from SalesDashboardResult.

export interface QuotaInfo {
  annualQuota: number;
  monthlyQuota: number;
  quotaStartDate: string;
  quotaEndDate: string;
  quotaElapsedPct: number;
  hasQuota: boolean;
}

export interface BookedSalesInfo {
  total: number;
  count: number;
  avgSale: number;
  prevTotal: number;
  prevCount: number;
}

export interface PipelineInfo {
  total: number;
  count: number;
}

export interface CloseRateInfo {
  pct: number;
  wonCount: number;
  lostCount: number;
  prevPct: number;
  prevWonCount: number;
  prevLostCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  total: number;
  count: number;
}

export interface SalesDashboardResult {
  repId: string;
  repDisplayName: string;
  quota: QuotaInfo;
  bookedSales: BookedSalesInfo;
  pipeline: PipelineInfo;
  closeRate: CloseRateInfo;
  runRate90Day: number;
  monthlyTrend: MonthlyTrendPoint[];
  ytdTotal?: number;
  ytdCount?: number;
  prevYearTotal?: number;
  allTimeTotal?: number;
}

export interface LeaderboardEntry {
  rank: number;
  repDisplayName: string;
  attainmentPct: number;
  trend: 'up' | 'down' | 'flat';
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface KpiCardData {
  title: string;
  value: string;
  supportingText: string;
  trend: TrendDirection;
  trendPct: number | null;
  comparisonBadge: string | null;
}

export interface AttentionItem {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  actionLabel: string;
  actionTab: string;
}

export type DashboardTab =
  | 'overview'
  | 'performance'
  | 'pipeline'
  | 'proposals'
  | 'activity'
  | 'history';

export type DashboardScope = 'self' | 'rep' | 'team';
