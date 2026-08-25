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

export interface HotLead {
  id: string;
  companyName: string;
  contactName: string;
  estimatedValue: number;
  priority: string;
  status: string;
}

export interface StaleLead {
  id: string;
  companyName: string;
  contactName: string;
  estimatedValue: number;
  priority: string;
  lastContactDate: string | null;
  daysSinceContact: number;
}

export interface DeclineReason {
  reason: string;
  count: number;
  byCustomer: number;
  byRep: number;
}

export interface RecentProposal {
  id: string;
  proposalNumber: string;
  status: string;
  total: number;
  customerName: string;
  createdAt: string;
}

export interface RecentActivityItem {
  id: string;
  type: 'connection' | 'lead_created' | 'proposal_created';
  createdAt: string;
  title: string;
  description: string;
}

export interface PeriodStats {
  contactsAdded: number;
  connectionsLogged: number;
  proposalsCreated: number;
  proposalsExpired: number;
  proposalsDeclined: number;
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
  hotLeads?: HotLead[];
  staleLeads?: StaleLead[];
  declineReasons?: DeclineReason[];
  expiredProposalsCount?: number;
  teamRank?: { rank: number; total: number } | null;
  recentProposals?: RecentProposal[];
  recentActivity?: RecentActivityItem[];
  periodStats?: PeriodStats;
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
  | 'daily_recap'
  | 'overview'
  | 'pipeline'
  | 'proposals'
  | 'activity';

export type DashboardScope = 'self' | 'rep' | 'team';
