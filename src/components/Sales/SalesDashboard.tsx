import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, TrendingDown, DollarSign, Target, FileText, Users, Calendar, Clock, AlertCircle, Award, Phone, Mail, MapPin, CheckCircle, XCircle, Eye, Plus, ArrowRight, Sparkles, Activity, BarChart3, Flame, RefreshCw, MessageSquare, CreditCard as Edit, ShoppingCart, ClipboardList, Layers, Ban } from 'lucide-react';
import { LeadDetail } from '../Leads/LeadDetail';
import { WeeklyCheckInBanner } from './WeeklyCheckInBanner';
import { ManagerCheckInCompliance } from './ManagerCheckInCompliance';
import { MonthlySalesStats } from './MonthlySalesStats';
import { StaffSalesComparison } from './StaffSalesComparison';

interface DashboardMetrics {
  pipelineValue: number;
  dealsClosedThisMonth: number;
  proposalsOut: number;
  conversionRate: number;
  monthlyRevenue: number;
  contactsAdded: number;
  connectionsLogged: number;
  proposalsCreated: number;
  proposalsExpired: number;
  proposalsDeclined: number;
  proposalsCancelled: number;
  averageDealSize: number;
  winRate: number;
  daysToClose: number;
  monthlyTarget: number;
  targetProgress: number;
  // Sales order metrics
  salesOrdersCount: number;
  salesOrdersRevenue: number;
  salesOrdersActive: number;
  salesOrdersCompleted: number;
  proposalApprovalRate: number;
}

interface DeclineBreakdown {
  reason: string;
  count: number;
  byCustomer: number;
  byRep: number;
}

const REASON_LABELS: Record<string, string> = {
  price_too_high: 'Price Too High',
  went_with_competitor: 'Went with Competitor',
  project_cancelled: 'Project Cancelled',
  no_response: 'No Response',
  timing: 'Not the Right Time',
  budget_cut: 'Budget Cut',
  scope_change: 'Scope Changed',
  changed_mind: 'Changed Mind',
  dont_want_rep: 'Rep Relationship',
  dont_want_company: 'Company Relationship',
  duplicate: 'Duplicate',
  customer_request: 'Customer Request',
  error: 'Created in Error',
  replaced_by_revision: 'Replaced by Revision',
  other: 'Other',
};

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  estimated_value: string;
  status: string;
  priority: string;
  created_at: string;
  last_contact_date: string;
}

interface UnifiedActivity {
  id: string;
  type: 'connection' | 'lead_created' | 'lead_updated' | 'proposal_created' | 'proposal_updated';
  created_at: string;
  title: string;
  description: string;
  metadata?: any;
}

interface Proposal {
  id: string;
  proposal_number: string;
  status: string;
  total: number;
  created_at: string;
  decline_reason?: string | null;
  declined_by?: string | null;
  declined_at?: string | null;
  contact?: {
    full_name?: string;
    company_name?: string;
  };
}

interface YearlySalesRecord {
  year: number;
  total_revenue: number;
  yoy_growth?: number;
  yoy_direction?: 'up' | 'down' | 'neutral';
  isHistoricalImport?: boolean;
}

interface YearComparison {
  current_year: number;
  current_ytd: number;
  previous_year: number;
  previous_total: number;
  difference_percent: number;
  direction: 'up' | 'down' | 'neutral';
}

interface SalesDashboardProps {
  onProposalClick?: (proposalId: string) => void;
}

export function SalesDashboard({ onProposalClick }: SalesDashboardProps) {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    pipelineValue: 0,
    dealsClosedThisMonth: 0,
    proposalsOut: 0,
    conversionRate: 0,
    monthlyRevenue: 0,
    contactsAdded: 0,
    connectionsLogged: 0,
    proposalsCreated: 0,
    averageDealSize: 0,
    winRate: 0,
    daysToClose: 0,
    monthlyTarget: 0,
    targetProgress: 0,
    salesOrdersCount: 0,
    salesOrdersRevenue: 0,
    salesOrdersActive: 0,
    salesOrdersCompleted: 0,
    proposalApprovalRate: 0,
    proposalsExpired: 0,
    proposalsDeclined: 0,
    proposalsCancelled: 0,
  });
  const [declineBreakdown, setDeclineBreakdown] = useState<DeclineBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<string>('this_month'); // Always default to This Month
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [staleLeads, setStaleLeads] = useState<Lead[]>([]);
  const [recentActivities, setRecentActivities] = useState<UnifiedActivity[]>([]);
  const [recentProposals, setRecentProposals] = useState<Proposal[]>([]);
  const [fishbowlCount, setFishbowlCount] = useState(0);
  const [teamRank, setTeamRank] = useState<{ rank: number; total: number } | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [historicalSales, setHistoricalSales] = useState<YearlySalesRecord[]>([]);
  const [yearComparison, setYearComparison] = useState<YearComparison | null>(null);
  const [historicalView, setHistoricalView] = useState<'personal' | 'company'>('personal');

  const isAdmin = profile?.role && ['admin', 'manager', 'sales_manager'].includes(profile.role);

  useEffect(() => {
    if (profile?.id && dateRange) {
      loadDashboardData();

      // Set up real-time subscriptions
      const leadsChannel = supabase
        .channel('dashboard_leads')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, loadDashboardData)
        .subscribe();

      const proposalsChannel = supabase
        .channel('dashboard_proposals')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, loadDashboardData)
        .subscribe();

      const connectionsChannel = supabase
        .channel('dashboard_connections')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, loadDashboardData)
        .subscribe();

      return () => {
        supabase.removeChannel(leadsChannel);
        supabase.removeChannel(proposalsChannel);
        supabase.removeChannel(connectionsChannel);
      };
    }
  }, [profile?.id, dateRange, historicalView]);

  async function handleDateRangeChange(newRange: string) {
    setDateRange(newRange);
    // Note: We no longer save the date range preference - always defaults to 'this_month'
    // Reload data with new range
    loadDashboardData();
  }

  async function loadDashboardData() {
    if (!profile?.id) return;

    try {
      setRefreshing(true);

      // Get date range based on user preference
      const now = new Date();
      const currentRange = dateRange || 'this_month';
      let startDate: string;
      let endDate: string = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      switch (currentRange) {
        case 'last_month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
          endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
          break;
        case 'this_quarter':
          const currentQuarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
          endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59).toISOString();
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1).toISOString();
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
          break;
        case 'all_time':
          startDate = new Date('2020-01-01').toISOString();
          endDate = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59).toISOString();
          break;
        case 'this_month':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      }

      const firstDayOfMonth = startDate;
      const lastDayOfMonth = endDate;
      const isAllTime = currentRange === 'all_time';

      // Calculate last month dates for comparison (not used but kept for compatibility)
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      // Build queries conditionally based on date range
      let closedLeadsQuery = supabase
        .from('leads')
        .select('estimated_value, status, created_at, updated_at')
        .eq('assigned_to', profile.id)
        .in('status', ['closed_won', 'closed_lost']);

      if (!isAllTime) {
        closedLeadsQuery = closedLeadsQuery
          .gte('updated_at', firstDayOfMonth)
          .lte('updated_at', lastDayOfMonth);
      }

      let proposalsQuery = supabase
        .from('proposals')
        .select('id, proposal_number, status, total, created_at, decline_reason, declined_by, declined_at, contact:contacts!proposals_contact_id_fkey(full_name, company_name)')
        .eq('created_by', profile.id);

      if (!isAllTime) {
        proposalsQuery = proposalsQuery
          .gte('created_at', firstDayOfMonth)
          .lte('created_at', lastDayOfMonth);
      }

      let contactsQuery = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profile.id);

      if (!isAllTime) {
        contactsQuery = contactsQuery
          .gte('created_at', firstDayOfMonth)
          .lte('created_at', lastDayOfMonth);
      }

      let connectionsQuery = supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id);

      if (!isAllTime) {
        connectionsQuery = connectionsQuery
          .gte('created_at', firstDayOfMonth)
          .lte('created_at', lastDayOfMonth);
      }

      // Build sales orders query — match by sales_rep_id OR created_by (sales_rep_id may be null)
      let salesOrdersQuery = supabase
        .from('sales_orders')
        .select('id, status, contract_total, created_at')
        .or(`sales_rep_id.eq.${profile.id},created_by.eq.${profile.id}`);

      if (!isAllTime) {
        salesOrdersQuery = salesOrdersQuery
          .gte('created_at', firstDayOfMonth)
          .lte('created_at', lastDayOfMonth);
      }

      // All-time sales orders for approval rate calculation (not date-filtered)
      const allTimeSalesOrdersQuery = supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .or(`sales_rep_id.eq.${profile.id},created_by.eq.${profile.id}`);

      const allTimeProposalsQuery = supabase
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .in('status', ['approved', 'approved_pending_action', 'completed']);

      // Build historical query in parallel with everything else
      const canViewCompanyHistoryEarly = ['admin', 'manager', 'sales_manager'].includes(profile.role || '');
      const effectiveHistoricalViewEarly = canViewCompanyHistoryEarly ? historicalView : 'personal';
      let historicalQuery = supabase
        .from('yearly_sales_performance')
        .select('year, total_revenue')
        .order('year', { ascending: true });
      if (effectiveHistoricalViewEarly === 'company' && profile.organization_id) {
        historicalQuery = historicalQuery.eq('organization_id', profile.organization_id);
      } else {
        historicalQuery = historicalQuery.eq('user_id', profile.id);
      }

      // Build imported historical query — fills years not yet in yearly_sales_performance
      let importedHistoricalQuery = supabase
        .from('sales_history_monthly')
        .select('stat_year, invoice_total, sales_rep_id')
        .eq('organization_id', profile.organization_id)
        .eq('source_type', 'historical_import')
        .order('stat_year', { ascending: true });
      if (effectiveHistoricalViewEarly === 'personal') {
        importedHistoricalQuery = importedHistoricalQuery.eq('sales_rep_id', profile.id);
      }

      // Build sales_monthly_stats query matching the selected range (source of truth for booked revenue,
      // including manually-entered historical data not represented in sales_orders)
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      const startYear = rangeStart.getFullYear();
      const startMonth = rangeStart.getMonth() + 1;
      const endYear = rangeEnd.getFullYear();
      const endMonth = rangeEnd.getMonth() + 1;
      let monthlyStatsQuery = supabase
        .from('sales_monthly_stats')
        .select('year, month, total_sales')
        .eq('user_id', profile.id);
      if (!isAllTime) {
        if (startYear === endYear) {
          monthlyStatsQuery = monthlyStatsQuery
            .eq('year', startYear)
            .gte('month', startMonth)
            .lte('month', endMonth);
        } else {
          monthlyStatsQuery = monthlyStatsQuery
            .gte('year', startYear)
            .lte('year', endYear);
        }
      }

      // Parallel data fetching (all queries run simultaneously)
      const [
        myLeadsResult,
        closedLeadsThisMonthResult,
        proposalsThisMonthResult,
        activePipelineProposalsResult,
        contactsThisMonthResult,
        connectionsThisMonthResult,
        recentConnectionsResult,
        recentLeadsResult,
        recentProposalsForActivityResult,
        fishbowlCountResult,
        allRepsResult,
        profileDataResult,
        salesOrdersResult,
        allTimeSalesOrdersResult,
        allTimeApprovedProposalsResult,
        historicalQueryResult,
        monthlyStatsResult,
        importedHistoricalResult
      ] = await Promise.all([
        // My open leads for pipeline value
        supabase
          .from('leads')
          .select('estimated_value, status, priority, company_name, contact_name, created_at, last_contact_date')
          .eq('assigned_to', profile.id)
          .in('status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation']),

        // Deals closed (filtered by range or all time)
        closedLeadsQuery,

        // Proposals (filtered by range or all time)
        proposalsQuery,

        // Active pipeline proposals — always all-time snapshot (no date filter)
        supabase
          .from('proposals')
          .select('id, status, total')
          .eq('created_by', profile.id)
          .in('status', ['designing', 'ready_to_submit', 'sent', 'viewed']),

        // Contacts added (filtered by range or all time)
        contactsQuery,

        // Connections logged (filtered by range or all time)
        connectionsQuery,

        // Recent connections for activity feed
        supabase
          .from('connections')
          .select('id, connection_type, connection_date, notes, contact:contacts!proposals_contact_id_fkey(full_name, company_name)')
          .eq('user_id', profile.id)
          .order('connection_date', { ascending: false })
          .limit(10),

        // Recent leads for activity feed
        supabase
          .from('leads')
          .select('id, company_name, contact_name, status, estimated_value, created_at, updated_at')
          .or(`created_by.eq.${profile.id},assigned_to.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(10),

        // Recent proposals for activity feed
        supabase
          .from('proposals')
          .select('id, proposal_number, status, total, created_at, updated_at, contact:contacts!proposals_contact_id_fkey(full_name, company_name)')
          .eq('created_by', profile.id)
          .order('created_at', { ascending: false })
          .limit(10),

        // Fishbowl count — scoped to this org
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id)
          .eq('is_fishbowl', true)
          .or('status.eq.unclaimed,assigned_to.is.null'),

        // All reps points for ranking — scoped to this org only
        supabase
          .from('profiles')
          .select('id, points_earned')
          .eq('organization_id', profile.organization_id)
          .gt('points_earned', 0)
          .order('points_earned', { ascending: false }),

        // Get fresh profile data to ensure we have the latest sales target
        supabase
          .from('profiles')
          .select('monthly_sales_target, current_annual_quota')
          .eq('id', profile.id)
          .maybeSingle(),

        // Sales orders (filtered by range or all time)
        salesOrdersQuery,

        // All-time sales orders count (for approval rate)
        allTimeSalesOrdersQuery,

        // All-time approved proposals count (for approval rate)
        allTimeProposalsQuery,

        // Historical yearly sales (runs in parallel, not sequentially)
        historicalQuery,

        // Monthly sales stats for the selected range (manual + calculated totals)
        monthlyStatsQuery,

        // Imported historical data from sales_history_monthly (fills pre-live years)
        importedHistoricalQuery
      ]);

      const myLeads = myLeadsResult.data || [];
      const closedLeads = closedLeadsThisMonthResult.data || [];
      const proposals = proposalsThisMonthResult.data || [];
      const activePipelineProposals = activePipelineProposalsResult.data || [];
      const freshProfileData = profileDataResult.data;
      const salesOrders = salesOrdersResult.data || [];

      // Build unified activity feed
      const unifiedActivities: UnifiedActivity[] = [];

      // Add connections
      (recentConnectionsResult.data || []).forEach((conn: any) => {
        unifiedActivities.push({
          id: `conn-${conn.id}`,
          type: 'connection',
          created_at: conn.connection_date,
          title: `${conn.connection_type.replace('_', ' ')} connection`,
          description: conn.contact?.full_name || conn.contact?.company_name || 'Contact',
          metadata: { connectionType: conn.connection_type, notes: conn.notes }
        });
      });

      // Add leads (only newly created ones)
      (recentLeadsResult.data || []).forEach((lead: any) => {
        unifiedActivities.push({
          id: `lead-${lead.id}`,
          type: 'lead_created',
          created_at: lead.created_at,
          title: 'Created lead',
          description: `${lead.contact_name || lead.company_name} - ${formatCurrency(parseFloat(lead.estimated_value || '0'))}`,
          metadata: { status: lead.status }
        });
      });

      // Add proposals
      (recentProposalsForActivityResult.data || []).forEach((proposal: any) => {
        unifiedActivities.push({
          id: `proposal-${proposal.id}`,
          type: 'proposal_created',
          created_at: proposal.created_at,
          title: `Created proposal ${proposal.proposal_number}`,
          description: proposal.contact?.full_name || proposal.contact?.company_name || 'Customer',
          metadata: { status: proposal.status, total: proposal.total }
        });
      });

      // Sort by date and take top 10
      const sortedActivities = unifiedActivities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      // Pipeline Value = all currently active proposals (always a real-time snapshot, not date-filtered)
      const pipelineValue = activePipelineProposals.reduce((sum, p) => {
        return sum + parseFloat(p.total || '0');
      }, 0);

      // Proposals out with customers = sent/viewed from the live pipeline
      const proposalsOut = activePipelineProposals.filter(p =>
        ['sent', 'viewed'].includes(p.status)
      ).length;

      // Count deals closed this month
      const dealsClosedThisMonth = closedLeads.length;

      // Calculate conversion rate
      const wonDeals = closedLeads.filter(l => l.status === 'closed_won').length;
      const lostDeals = closedLeads.filter(l => l.status === 'closed_lost').length;
      const conversionRate = (wonDeals + lostDeals) > 0
        ? Math.round((wonDeals / (wonDeals + lostDeals)) * 100)
        : 0;

      // Calculate monthly revenue from SALES ORDERS (the source of truth for booked revenue)
      // Sales orders represent approved/contracted work
      const salesOrdersRevenue = salesOrders.reduce((sum, so) => {
        return sum + parseFloat(so.contract_total || '0');
      }, 0);

      // Also count approved proposals as revenue (in case sales orders aren't yet created)
      const wonProposalsForRevenue = proposals.filter(p =>
        p.status === 'approved' || p.status === 'approved_pending_action'
      );
      const approvedProposalRevenue = wonProposalsForRevenue.reduce((sum, p) => {
        return sum + parseFloat(p.total || '0');
      }, 0);

      // Sum sales_monthly_stats for the range (source of truth, includes manually-entered totals)
      const monthlyStatsRows = monthlyStatsResult.data || [];
      const monthlyStatsTotal = monthlyStatsRows.reduce((sum: number, row: any) => {
        return sum + parseFloat(row.total_sales || '0');
      }, 0);

      // Monthly revenue priority: sales_monthly_stats (manual + calculated) -> sales_orders -> approved proposals
      const monthlyRevenue = monthlyStatsTotal > 0
        ? monthlyStatsTotal
        : salesOrders.length > 0
          ? salesOrdersRevenue
          : approvedProposalRevenue;

      // Sales order breakdowns
      const salesOrdersActive = salesOrders.filter(so =>
        ['pending_deposit', 'planning', 'in_progress'].includes(so.status)
      ).length;
      const salesOrdersCompleted = salesOrders.filter(so => so.status === 'completed').length;

      // Proposal approval rate (all-time: total approved proposals / total proposals sent)
      const allTimeSalesOrdersCount = allTimeSalesOrdersResult.count || 0;
      const allTimeApprovedCount = allTimeApprovedProposalsResult.count || 0;
      const proposalApprovalRate = allTimeApprovedCount > 0
        ? Math.round((allTimeSalesOrdersCount / Math.max(allTimeApprovedCount, allTimeSalesOrdersCount)) * 100)
        : 0;

      // Calculate average deal size from sales orders (or approved proposals)
      const dealCount = salesOrders.length > 0 ? salesOrders.length : wonProposalsForRevenue.length;
      const averageDealSize = dealCount > 0 ? monthlyRevenue / dealCount : 0;

      // Declined & cancelled proposals in the period
      const proposalsDeclined = proposals.filter(p => p.status === 'declined').length;
      const proposalsCancelled = proposals.filter(p => p.status === 'cancelled').length;

      // Win rate: approved / (approved + declined + cancelled + expired) — closed universe only
      const approvedCount = wonProposalsForRevenue.length;
      const closedUniverse = approvedCount + proposalsDeclined + proposalsCancelled + (proposals.filter(p => p.status === 'expired').length);
      const winRate = closedUniverse > 0
        ? Math.round((approvedCount / closedUniverse) * 100)
        : 0;

      // Build decline reason breakdown for rep's own data
      const declinedAndCancelled = proposals.filter(p =>
        p.status === 'declined' || p.status === 'cancelled'
      );
      const reasonMap = new Map<string, DeclineBreakdown>();
      declinedAndCancelled.forEach(p => {
        const r = p.decline_reason || 'other';
        if (!reasonMap.has(r)) {
          reasonMap.set(r, { reason: r, count: 0, byCustomer: 0, byRep: 0 });
        }
        const entry = reasonMap.get(r)!;
        entry.count++;
        if (p.declined_by === 'customer') entry.byCustomer++;
        else entry.byRep++;
      });
      const breakdown = Array.from(reasonMap.values()).sort((a, b) => b.count - a.count);

      // Get monthly target from the new anniversary-year quota system, falling back to legacy monthly_sales_target
      const annualQuota = parseFloat(freshProfileData?.current_annual_quota || '0');
      const monthlyTarget = annualQuota > 0
        ? annualQuota / 12
        : parseFloat(freshProfileData?.monthly_sales_target || '0');
      const targetProgress = monthlyTarget > 0
        ? Math.round((monthlyRevenue / monthlyTarget) * 100)
        : 0;

      // Identify hot leads (high priority or high value)
      const hotLeads = myLeads
        .filter(lead => {
          const value = parseFloat(lead.estimated_value || '0');
          return lead.priority === 'critical' || lead.priority === 'high' || value >= 5000;
        })
        .sort((a, b) => parseFloat(b.estimated_value || '0') - parseFloat(a.estimated_value || '0'))
        .slice(0, 5);

      // Identify stale leads (no activity in 7+ days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const staleLeads = myLeads
        .filter(lead => {
          const lastContact = lead.last_contact_date || lead.created_at;
          return new Date(lastContact) < sevenDaysAgo;
        })
        .slice(0, 5);

      // Calculate team rank
      const allReps = allRepsResult.data || [];
      const myRank = allReps.findIndex(rep => rep.id === profile.id) + 1;
      const teamRank = myRank > 0 ? { rank: myRank, total: allReps.length } : null;

      // Process historical data (already fetched in parallel above)
      const rawHistoricalData = historicalQueryResult.data;

      // Build year totals from live yearly_sales_performance
      let historicalData: { year: number; total_revenue: string }[] = [];
      if (effectiveHistoricalViewEarly === 'company') {
        const byYear = new Map<number, number>();
        (rawHistoricalData || []).forEach(r => {
          const prev = byYear.get(r.year) || 0;
          byYear.set(r.year, prev + parseFloat(r.total_revenue));
        });
        historicalData = Array.from(byYear.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([year, total]) => ({ year, total_revenue: String(total) }));
      } else {
        historicalData = rawHistoricalData || [];
      }

      // Merge imported historical data for years not already covered by live data
      const liveYears = new Set(historicalData.map(r => r.year));
      const importedRows = importedHistoricalResult.data || [];
      const importedByYear = new Map<number, number>();
      importedRows.forEach((r: { stat_year: number; invoice_total: number }) => {
        const prev = importedByYear.get(r.stat_year) || 0;
        importedByYear.set(r.stat_year, prev + parseFloat(String(r.invoice_total)));
      });
      importedByYear.forEach((total, year) => {
        if (!liveYears.has(year)) {
          historicalData.push({ year, total_revenue: String(total) });
        }
      });
      // Re-sort after merge
      historicalData.sort((a, b) => a.year - b.year);

      // Process historical data with year-over-year growth calculations
      const processedHistoricalData: YearlySalesRecord[] = (historicalData || []).map((record, index) => {
        const isImported = !liveYears.has(record.year);
        if (index === 0) {
          return {
            year: record.year,
            total_revenue: parseFloat(record.total_revenue),
            yoy_growth: undefined,
            yoy_direction: 'neutral' as const,
            isHistoricalImport: isImported
          };
        }

        const previousRecord = historicalData[index - 1];
        const currentRevenue = parseFloat(record.total_revenue);
        const previousRevenue = parseFloat(previousRecord.total_revenue);
        const growthPercent = previousRevenue > 0
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
          : 0;

        return {
          year: record.year,
          total_revenue: currentRevenue,
          yoy_growth: Math.round(growthPercent * 10) / 10,
          yoy_direction: growthPercent > 0 ? 'up' as const : growthPercent < 0 ? 'down' as const : 'neutral' as const,
          isHistoricalImport: isImported
        };
      });

      // Calculate year comparison (2026 YTD vs 2025 full year)
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;
      const lastYearRecord = processedHistoricalData.find(record => record.year === lastYear);

      let calculatedYearComparison: YearComparison | null = null;
      if (lastYearRecord) {
        const currentYTD = monthlyRevenue; // This is already calculated for the current period
        const lastYearTotal = lastYearRecord.total_revenue;
        const differencePercent = lastYearTotal > 0
          ? ((currentYTD - lastYearTotal) / lastYearTotal) * 100
          : 0;

        calculatedYearComparison = {
          current_year: currentYear,
          current_ytd: currentYTD,
          previous_year: lastYear,
          previous_total: lastYearTotal,
          difference_percent: Math.round(differencePercent * 10) / 10,
          direction: differencePercent > 0 ? 'up' : differencePercent < 0 ? 'down' : 'neutral'
        };
      }

      setHistoricalSales(processedHistoricalData);
      setYearComparison(calculatedYearComparison);

      const proposalsExpired = proposals.filter(p => p.status === 'expired').length;

      setMetrics({
        pipelineValue,
        dealsClosedThisMonth,
        proposalsOut,
        conversionRate,
        monthlyRevenue,
        contactsAdded: contactsThisMonthResult.count || 0,
        connectionsLogged: connectionsThisMonthResult.count || 0,
        proposalsCreated: proposals.length,
        proposalsExpired,
        proposalsDeclined,
        proposalsCancelled,
        averageDealSize,
        winRate,
        daysToClose: 0,
        monthlyTarget,
        targetProgress,
        salesOrdersCount: salesOrders.length,
        salesOrdersRevenue,
        salesOrdersActive,
        salesOrdersCompleted,
        proposalApprovalRate
      });
      setDeclineBreakdown(breakdown);

      setHotLeads(hotLeads);
      setStaleLeads(staleLeads);
      setRecentActivities(sortedActivities);
      setRecentProposals(proposals.slice(0, 5));
      setFishbowlCount(fishbowlCountResult.count || 0);
      setTeamRank(teamRank);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  function getActivityIcon(type: string, connectionType?: string) {
    // For connection type activities, show specific icons
    if (type === 'connection' && connectionType) {
      const connectionIcons: Record<string, any> = {
        call: Phone,
        email: Mail,
        meeting: Calendar,
        site_visit: MapPin,
        casual_conversation: MessageSquare,
        other: Activity
      };
      return connectionIcons[connectionType] || Activity;
    }

    // For other activity types
    const icons: Record<string, any> = {
      connection: MessageSquare,
      proposal_created: FileText,
      proposal_updated: Edit,
      lead_created: Plus,
      lead_updated: Activity
    };
    return icons[type] || Activity;
  }

  function getActivityColor(type: string, connectionType?: string) {
    // For connection type activities, show specific colors
    if (type === 'connection' && connectionType) {
      const connectionColors: Record<string, string> = {
        call: 'text-blue-600 bg-blue-50',
        email: 'text-indigo-600 bg-indigo-50',
        meeting: 'text-green-600 bg-green-50',
        site_visit: 'text-cyan-600 bg-cyan-50',
        casual_conversation: 'text-teal-600 bg-teal-50',
        other: 'text-gray-600 bg-gray-50'
      };
      return connectionColors[connectionType] || 'text-gray-600 bg-gray-50';
    }

    // For other activity types
    const colors: Record<string, string> = {
      connection: 'text-teal-600 bg-teal-50',
      proposal_created: 'text-emerald-600 bg-emerald-50',
      proposal_updated: 'text-blue-600 bg-blue-50',
      lead_created: 'text-orange-600 bg-orange-50',
      lead_updated: 'text-gray-600 bg-gray-50'
    };
    return colors[type] || 'text-gray-600 bg-gray-50';
  }

  function getDaysRemaining(): number {
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysLeft = Math.ceil((lastDayOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft;
  }

  function getDateRangeLabel(): string {
    switch (dateRange) {
      case 'last_month': return 'Last Month';
      case 'this_quarter': return 'This Quarter';
      case 'this_year': return 'This Year';
      case 'all_time': return 'All Time';
      case 'this_month':
      default: return 'This Month';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading your dashboard...</div>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining();
  const gapToGoal = Math.max(0, metrics.monthlyTarget - metrics.monthlyRevenue);

  return (
    <div className="space-y-6">
      {/* Header with Date Range and Refresh */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">My Sales Dashboard</h1>
            <p className="text-gray-300">Your personal performance center</p>
          </div>
          <button
            onClick={loadDashboardData}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 sm:w-auto w-full"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'this_month', label: 'This Month' },
            { value: 'last_month', label: 'Last Month' },
            { value: 'this_quarter', label: 'This Quarter' },
            { value: 'this_year', label: 'This Year' },
            { value: 'all_time', label: 'All Time' }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleDateRangeChange(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                dateRange === option.value
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Check-In Banner */}
      <WeeklyCheckInBanner onNavigateToProposal={onProposalClick} />

      {/* Manager Team Compliance (admin/manager only) */}
      {profile && ['admin', 'manager'].includes(profile.role) && (
        <ManagerCheckInCompliance />
      )}

      {/* Monthly Goal Hero Card */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 rounded-xl p-4 sm:p-6 text-white shadow-lg">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-1 flex items-center gap-2">
              <Target className="w-5 h-5" />
              {getDateRangeLabel()} Goal Progress
            </h2>
            {(dateRange === 'this_month' || dateRange === 'last_month') && (
              <p className="text-blue-100 text-sm">{daysRemaining} days remaining</p>
            )}
          </div>
          {teamRank && (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2">
              <div className="text-2xl font-bold">#{teamRank.rank}</div>
              <div className="text-xs text-blue-100">of {teamRank.total}</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <div className="text-xs sm:text-sm text-blue-100 mb-1">Sales Orders — {getDateRangeLabel()}</div>
            <div className="text-xl sm:text-3xl font-bold tabular-nums">{formatCurrency(metrics.salesOrdersRevenue)}</div>
            <div className="text-xs text-blue-200 opacity-75 mt-0.5">{metrics.salesOrdersCount} orders</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-blue-100 mb-1">Proposals Out</div>
            <div className="text-xl sm:text-3xl font-bold tabular-nums">{formatCurrency(metrics.pipelineValue)}</div>
            <div className="text-xs text-blue-200 opacity-75 mt-0.5">{metrics.proposalsOut} proposals</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-blue-100 mb-1">Monthly Target</div>
            <div className="text-xl sm:text-3xl font-bold tabular-nums">{formatCurrency(metrics.monthlyTarget)}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-blue-100 mb-1">Gap to Goal</div>
            <div className="text-xl sm:text-3xl font-bold tabular-nums">{formatCurrency(gapToGoal)}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-blue-100">Progress</span>
            <span className="font-bold">{metrics.targetProgress}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-green-400 to-emerald-500 h-3 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
              style={{ width: `${Math.min(metrics.targetProgress, 100)}%` }}
            >
              {metrics.targetProgress >= 10 && (
                <Sparkles className="w-3 h-3 text-white" />
              )}
            </div>
          </div>
        </div>

        {/* Motivational Message */}
        {metrics.targetProgress >= 100 && (
          <div className="bg-green-500/30 backdrop-blur-sm rounded-lg p-3 flex items-center gap-2">
            <Award className="w-5 h-5 text-green-200" />
            <span className="font-semibold">Goal Achieved! Keep up the excellent work!</span>
          </div>
        )}
        {metrics.targetProgress >= 75 && metrics.targetProgress < 100 && (
          <div className="bg-yellow-500/30 backdrop-blur-sm rounded-lg p-3 flex items-center gap-2">
            <Flame className="w-5 h-5 text-yellow-200" />
            <span className="font-semibold">You're almost there! Push to close the gap.</span>
          </div>
        )}
        {metrics.targetProgress < 75 && metrics.targetProgress >= 50 && (
          <div className="bg-blue-500/30 backdrop-blur-sm rounded-lg p-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-200" />
            <span className="font-semibold">Halfway there! Keep the momentum going.</span>
          </div>
        )}
        {metrics.targetProgress < 50 && (
          <div className="bg-orange-500/30 backdrop-blur-sm rounded-lg p-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-200" />
            <span className="font-semibold">Time to accelerate! Focus on high-value opportunities.</span>
          </div>
        )}
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-7 h-7 sm:w-8 sm:h-8 opacity-80" />
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 opacity-60" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold mb-1 tabular-nums">{formatCurrency(metrics.pipelineValue)}</div>
          <div className="text-xs sm:text-sm text-green-100">Pipeline Value</div>
          <div className="text-xs text-green-200 mt-1 opacity-80">{metrics.proposalsOut} out with customers</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8 opacity-80" />
            <span className="text-xl sm:text-2xl font-bold opacity-60">{metrics.salesOrdersCount}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold mb-1 tabular-nums">{formatCurrency(metrics.salesOrdersRevenue)}</div>
          <div className="text-xs sm:text-sm text-blue-100">Sales Orders Revenue</div>
          <div className="text-xs text-blue-200 mt-1 opacity-80">{metrics.salesOrdersActive} active · {metrics.salesOrdersCompleted} completed</div>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 opacity-80" />
            <span className="text-xl sm:text-2xl font-bold opacity-60">{metrics.proposalsCreated}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold mb-1">{metrics.proposalsOut}</div>
          <div className="text-xs sm:text-sm text-teal-100">Proposals Out</div>
          <div className="text-xs text-teal-200 mt-1 opacity-80">{metrics.proposalsCreated} created this period</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 opacity-80" />
            <span className="text-xl sm:text-2xl font-bold opacity-60">{metrics.winRate}%</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold mb-1 tabular-nums">{formatCurrency(metrics.averageDealSize)}</div>
          <div className="text-xs sm:text-sm text-orange-100">Avg Deal Size</div>
          <div className="text-xs text-orange-200 mt-1 opacity-80">{metrics.conversionRate}% lead conversion</div>
        </div>
      </div>

      {/* Monthly Sales Progress Graph */}
      <MonthlySalesStats />

      {/* Team Sales Comparison — visible to admin/manager/sales_manager/finance */}
      <StaffSalesComparison />

      {/* Proposals & Sales Orders Volume */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Activity & Volume — {getDateRangeLabel()}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Proposals</div>
            <div className="text-2xl font-bold text-white tabular-nums">{metrics.proposalsCreated}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" />Created</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">With Customer</div>
            <div className="text-2xl font-bold text-blue-400 tabular-nums">{metrics.proposalsOut}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Eye className="w-3 h-3" />Sent/Viewed</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Win Rate</div>
            <div className={`text-2xl font-bold tabular-nums ${metrics.winRate >= 50 ? 'text-green-400' : metrics.winRate >= 25 ? 'text-yellow-400' : 'text-gray-300'}`}>
              {metrics.winRate}%
            </div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Won / Closed</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Sales Orders</div>
            <div className="text-2xl font-bold text-white tabular-nums">{metrics.salesOrdersCount}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><ShoppingCart className="w-3 h-3" />Booked</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Orders</div>
            <div className="text-2xl font-bold text-teal-400 tabular-nums">{metrics.salesOrdersActive}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><ClipboardList className="w-3 h-3" />In Progress</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Contracted</div>
            <div className="text-lg font-bold text-green-400 tabular-nums leading-tight">{formatCurrency(metrics.salesOrdersRevenue)}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />Revenue</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Expired</div>
            <div className={`text-2xl font-bold tabular-nums ${metrics.proposalsExpired > 0 ? 'text-orange-400' : 'text-gray-500'}`}>{metrics.proposalsExpired}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />Proposals</div>
          </div>
          <div className="bg-rose-950/30 rounded-lg p-3 border border-rose-900/40">
            <div className="text-xs text-rose-400/70 uppercase tracking-wide mb-1">Declined</div>
            <div className={`text-2xl font-bold tabular-nums ${(metrics.proposalsDeclined + metrics.proposalsCancelled) > 0 ? 'text-rose-400' : 'text-gray-500'}`}>
              {metrics.proposalsDeclined + metrics.proposalsCancelled}
            </div>
            <div className="text-xs text-rose-400/50 mt-1 flex items-center gap-1">
              <Ban className="w-3 h-3" />
              {metrics.proposalsDeclined} declined · {metrics.proposalsCancelled} cancelled
            </div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Contacts</div>
            <div className="text-2xl font-bold text-white tabular-nums">{metrics.contactsAdded}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Users className="w-3 h-3" />Added</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Connections</div>
            <div className="text-2xl font-bold text-white tabular-nums">{metrics.connectionsLogged}</div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" />Logged</div>
          </div>
        </div>

        {/* Volume bar: proposal funnel */}
        {metrics.proposalsCreated > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Proposal Funnel</div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                <span className="text-xs text-gray-400">{metrics.proposalsCreated} created</span>
              </div>
              <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-400">{metrics.proposalsOut} with customer</span>
              </div>
              <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-xs text-gray-400">{metrics.salesOrdersCount} sales orders</span>
              </div>
              {metrics.proposalsExpired > 0 && (
                <>
                  <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <span className="text-xs text-orange-400">{metrics.proposalsExpired} expired</span>
                  </div>
                </>
              )}
              {(metrics.proposalsDeclined + metrics.proposalsCancelled) > 0 && (
                <>
                  <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="text-xs text-rose-400">{metrics.proposalsDeclined + metrics.proposalsCancelled} lost</span>
                  </div>
                </>
              )}
              {metrics.proposalsCreated > 0 && (
                <span className="ml-auto text-xs font-medium tabular-nums" style={{
                  color: metrics.winRate >= 50 ? '#4ade80' : metrics.winRate >= 25 ? '#facc15' : '#9ca3af'
                }}>
                  {metrics.winRate}% win rate
                </span>
              )}
            </div>
            {/* Funnel bar */}
            <div className="mt-2 space-y-1.5">
              <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gray-500 rounded-full" style={{ width: '100%' }} />
              </div>
              <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all duration-700"
                  style={{ width: `${metrics.proposalsCreated > 0 ? Math.min(100, (metrics.proposalsOut / metrics.proposalsCreated) * 100) : 0}%` }}
                />
              </div>
              <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-700"
                  style={{ width: `${metrics.proposalsCreated > 0 ? Math.min(100, (metrics.salesOrdersCount / metrics.proposalsCreated) * 100) : 0}%` }}
                />
              </div>
              {metrics.proposalsExpired > 0 && (
                <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500 rounded-full transition-all duration-700"
                    style={{ width: `${metrics.proposalsCreated > 0 ? Math.min(100, (metrics.proposalsExpired / metrics.proposalsCreated) * 100) : 0}%` }}
                  />
                </div>
              )}
              {(metrics.proposalsDeclined + metrics.proposalsCancelled) > 0 && (
                <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-rose-600 rounded-full transition-all duration-700"
                    style={{ width: `${metrics.proposalsCreated > 0 ? Math.min(100, ((metrics.proposalsDeclined + metrics.proposalsCancelled) / metrics.proposalsCreated) * 100) : 0}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Decline / Lost Deals Breakdown */}
      {declineBreakdown.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-rose-900/40 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Ban className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-white">Lost Deals Breakdown — {getDateRangeLabel()}</h2>
            <span className="ml-auto text-xs text-gray-500">
              {metrics.proposalsDeclined} declined · {metrics.proposalsCancelled} cancelled
            </span>
          </div>
          <div className="space-y-2">
            {declineBreakdown.map((item) => {
              const total = metrics.proposalsDeclined + metrics.proposalsCancelled;
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              const label = REASON_LABELS[item.reason] || item.reason;
              const isSensitive = item.reason === 'dont_want_rep' || item.reason === 'dont_want_company';
              return (
                <div key={item.reason} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className={`font-medium ${isSensitive ? 'text-rose-300' : 'text-gray-300'}`}>
                      {label}
                      {isSensitive && <span className="ml-1.5 text-xs text-rose-500/70">(private)</span>}
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      {item.byCustomer > 0 && (
                        <span className="text-blue-400">{item.byCustomer} customer</span>
                      )}
                      {item.byRep > 0 && (
                        <span className="text-gray-400">{item.byRep} rep</span>
                      )}
                      <span className="text-white font-bold tabular-nums w-6 text-right">{item.count}</span>
                    </div>
                  </div>
                  <div className="relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${isSensitive ? 'bg-rose-600' : 'bg-rose-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {metrics.winRate > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center gap-3">
              <div className="text-xs text-gray-500">Win Rate (closed universe)</div>
              <div className={`text-sm font-bold tabular-nums ${metrics.winRate >= 50 ? 'text-green-400' : metrics.winRate >= 25 ? 'text-yellow-400' : 'text-rose-400'}`}>
                {metrics.winRate}%
              </div>
              <div className="flex-1 relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${metrics.winRate >= 50 ? 'bg-green-500' : metrics.winRate >= 25 ? 'bg-yellow-500' : 'bg-rose-500'}`}
                  style={{ width: `${metrics.winRate}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Performance Section */}
      {(historicalSales.length > 0 || isAdmin) && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Historical Performance
              {isAdmin && (
                <span className="text-xs font-normal text-gray-400 ml-1">
                  — {historicalView === 'company' ? 'Company-wide' : 'My Numbers'}
                </span>
              )}
            </h2>
            {isAdmin && (
              <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
                <button
                  onClick={() => setHistoricalView('personal')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    historicalView === 'personal'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  My Numbers
                </button>
                <button
                  onClick={() => setHistoricalView('company')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    historicalView === 'company'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Company-wide
                </button>
              </div>
            )}
          </div>
          {historicalSales.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No historical data available{historicalView === 'company' ? ' company-wide' : ' for your account'} yet.
            </div>
          ) : null}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Historical Year Cards */}
            {historicalSales.map((record, index) => (
              <div
                key={record.year}
                className={`rounded-lg p-4 hover:bg-gray-900 transition-colors ${
                  record.isHistoricalImport
                    ? 'bg-gray-900/30 border border-dashed border-gray-600/50'
                    : 'bg-gray-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-400">{record.year}</div>
                  {record.isHistoricalImport && (
                    <span className="text-xs text-gray-500 bg-gray-700/50 rounded px-1.5 py-0.5 leading-tight">
                      Imported
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-white mb-3">
                  {formatCurrency(record.total_revenue)}
                </div>
                {record.yoy_growth !== undefined && record.yoy_direction !== 'neutral' ? (
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                    record.yoy_direction === 'up'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {record.yoy_direction === 'up' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span>{Math.abs(record.yoy_growth)}%</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-gray-700/50 text-gray-400">
                    <span>Baseline</span>
                  </div>
                )}
              </div>
            ))}

            {/* Year Comparison Card (2026 YTD vs 2025) */}
            {yearComparison && (
              <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-lg p-4 border-2 border-blue-500/30 hover:border-blue-500/50 transition-colors">
                <div className="text-sm text-blue-300 mb-2 font-medium">
                  {yearComparison.current_year} YTD vs {yearComparison.previous_year}
                </div>
                <div className="text-xl font-bold text-white mb-1">
                  {formatCurrency(yearComparison.current_ytd)}
                </div>
                <div className="text-xs text-gray-400 mb-3">
                  vs {formatCurrency(yearComparison.previous_total)}
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                  yearComparison.direction === 'up'
                    ? 'bg-green-500/20 text-green-400'
                    : yearComparison.direction === 'down'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-700/50 text-gray-400'
                }`}>
                  {yearComparison.direction === 'up' ? (
                    <>
                      <TrendingUp className="w-3 h-3" />
                      <span>+{yearComparison.difference_percent}%</span>
                    </>
                  ) : yearComparison.direction === 'down' ? (
                    <>
                      <TrendingDown className="w-3 h-3" />
                      <span>{yearComparison.difference_percent}%</span>
                    </>
                  ) : (
                    <span>0%</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Opportunities */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Hot Opportunities
            </h3>
            <span className="text-sm text-gray-400">{hotLeads.length} leads</span>
          </div>
          <div className="space-y-3">
            {hotLeads.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No hot leads at the moment</p>
            ) : (
              hotLeads.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="bg-gray-900/50 rounded-lg p-3 hover:bg-gray-900 transition-colors cursor-pointer border border-transparent hover:border-orange-500"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white text-sm">{lead.contact_name}</h4>
                      <p className="text-xs text-gray-400">{lead.company_name}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      lead.priority === 'critical'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {lead.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-green-400">
                      {formatCurrency(parseFloat(lead.estimated_value || '0'))}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stale Leads Needing Attention */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Needs Attention
            </h3>
            <span className="text-sm text-gray-400">{staleLeads.length} stale</span>
          </div>
          <div className="space-y-3">
            {staleLeads.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">All leads are up to date!</p>
            ) : (
              staleLeads.map(lead => {
                const lastContact = lead.last_contact_date || lead.created_at;
                const daysAgo = Math.floor((new Date().getTime() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="bg-gray-900/50 rounded-lg p-3 hover:bg-gray-900 transition-colors cursor-pointer border border-transparent hover:border-yellow-500"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-white text-sm">{lead.contact_name}</h4>
                        <p className="text-xs text-gray-400">{lead.company_name}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">
                        {daysAgo}d ago
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Last contact: {daysAgo} days ago</span>
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity and Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </h3>
          <div className="space-y-2">
            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-3">No recent activity</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => window.location.href = '?tab=connections'}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Log a connection
                  </button>
                  <span className="text-gray-600">•</span>
                  <button
                    onClick={() => window.location.href = '?tab=pipeline'}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Create a lead
                  </button>
                </div>
              </div>
            ) : (
              recentActivities.map(activity => {
                const Icon = getActivityIcon(activity.type, activity.metadata?.connectionType);
                const colorClasses = getActivityColor(activity.type, activity.metadata?.connectionType);
                const timeAgo = new Date(activity.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                });

                // Extract the actual ID from the prefixed ID
                const actualId = activity.id.split('-').slice(1).join('-');

                const handleActivityClick = () => {
                  if (activity.type === 'connection') {
                    window.location.href = '?tab=connections';
                  } else if (activity.type === 'lead_created' || activity.type === 'lead_updated') {
                    setSelectedLeadId(actualId);
                  } else if (activity.type === 'proposal_created' || activity.type === 'proposal_updated') {
                    window.location.href = `?tab=proposals&id=${actualId}`;
                  }
                };

                return (
                  <button
                    key={activity.id}
                    onClick={handleActivityClick}
                    className="w-full flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer border border-transparent hover:border-blue-500/50"
                  >
                    <div className={`p-2 rounded-lg ${colorClasses} flex-shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm text-white font-medium">
                        {activity.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{activity.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{timeAgo}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          {/* Fishbowl Leads */}
          <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg p-4 text-white shadow-md">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-6 h-6 opacity-80" />
              <span className="text-3xl font-bold">{fishbowlCount}</span>
            </div>
            <div className="text-sm mb-2">Fishbowl Leads</div>
            <button
              onClick={() => {
                window.location.href = '?tab=fishbowl';
              }}
              className="text-xs text-teal-100 hover:text-white flex items-center gap-1 transition-colors"
            >
              Claim leads <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Recent Proposals */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Recent Proposals
            </h4>
            <div className="space-y-2">
              {recentProposals.slice(0, 3).map(proposal => (
                <button
                  key={proposal.id}
                  onClick={() => {
                    window.location.href = `?tab=proposals&id=${proposal.id}`;
                  }}
                  className="w-full flex items-center justify-between text-xs p-2 rounded-lg hover:bg-gray-900/50 transition-colors cursor-pointer border border-transparent hover:border-blue-500/50"
                >
                  <div className="flex flex-col flex-1 mr-2">
                    <span className="text-white font-medium truncate">
                      {proposal.proposal_number}
                    </span>
                    {proposal.contact && (
                      <span className="text-gray-500 text-xs truncate">
                        {proposal.contact.full_name || proposal.contact.company_name}
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded font-medium text-xs whitespace-nowrap ${
                    proposal.status === 'approved' || proposal.status === 'approved_pending_action'
                      ? 'bg-green-500/20 text-green-400'
                      : proposal.status === 'sent' || proposal.status === 'viewed'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {proposal.status.replace('_', ' ')}
                  </span>
                </button>
              ))}
              {recentProposals.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No proposals yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lead Detail Modal */}
      {selectedLeadId && (
        <LeadDetail
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}
