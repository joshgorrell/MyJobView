import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Trophy,
  TrendingUp,
  Target,
  DollarSign,
  FileText,
  Award,
  Crown,
  Medal,
  Flame,
  Zap,
  Star,
  CheckCircle,
  Briefcase,
  Filter
} from 'lucide-react';

interface PerformanceMetrics {
  dealsClosed: number;
  revenue: number;
  proposalsOut: number;
  proposalsAccepted: number;
  conversionRate: number;
  avgDealSize: number;
  totalProposalValue: number;
  pipelineValue: number;
}

interface LeaderboardEntry {
  id: string;
  full_name: string;
  revenue: number;
  deals: number;
  proposalsSent: number;
  conversionRate: number;
  pipelineValue: number;
  rank: number;
}

type LeaderboardMode = 'won' | 'pipeline';
type StatusFilter = 'all' | 'exclude_draft' | 'only_active';

export function SalesPerformance() {
  const { profile } = useAuth();
  const [myMetrics, setMyMetrics] = useState<PerformanceMetrics>({
    dealsClosed: 0,
    revenue: 0,
    proposalsOut: 0,
    proposalsAccepted: 0,
    conversionRate: 0,
    avgDealSize: 0,
    totalProposalValue: 0,
    pipelineValue: 0
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<LeaderboardMode>('won');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('exclude_draft');

  useEffect(() => {
    if (!profile?.id) return;

    loadPerformanceData();

    const channel = supabase
      .channel('sales-performance')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'proposals'
      }, loadPerformanceData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sales_orders'
      }, loadPerformanceData)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile?.id, mode, statusFilter]);

  function getFilteredProposals(proposals: any[]) {
    const draftStatuses = ['draft', 'designing'];

    if (statusFilter === 'exclude_draft') {
      return proposals.filter(p => !draftStatuses.includes(p.status));
    } else if (statusFilter === 'only_active') {
      // Only active = sent, viewed, ready_to_submit (not draft, designing, approved, declined, expired)
      return proposals.filter(p =>
        ['sent', 'viewed', 'ready_to_submit'].includes(p.status)
      );
    }

    return proposals; // 'all' includes everything
  }

  async function loadPerformanceData() {
    try {
      if (!profile?.id || !profile?.organization_id) return;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Fetch all data in parallel — all scoped to the same organization
      const [
        myProposalsResult,
        orgProposalsResult,
        orgProfilesResult,
        mySalesOrdersResult,
        orgSalesOrdersResult
      ] = await Promise.all([
        // All proposals I created (all-time, for pipeline snapshot)
        supabase
          .from('proposals')
          .select('id, status, total, created_at, proposal_id')
          .eq('created_by', profile.id),

        // All proposals in this org (for leaderboard — only this org)
        supabase
          .from('proposals')
          .select('id, status, total, created_at, created_by, proposal_id')
          .eq('organization_id', profile.organization_id),

        // Only active sales reps/admins/managers in THIS org
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('organization_id', profile.organization_id)
          .or('role.eq.sales,role.eq.admin,role.eq.manager,role.eq.sales_manager')
          .eq('is_active', true),

        // My sales orders this month (source of truth for won revenue)
        supabase
          .from('sales_orders')
          .select('id, proposal_id, contract_total, created_at')
          .or(`sales_rep_id.eq.${profile.id},created_by.eq.${profile.id}`)
          .gte('created_at', startOfMonth.toISOString()),

        // All org sales orders this month (for leaderboard)
        supabase
          .from('sales_orders')
          .select('id, proposal_id, contract_total, created_at, created_by, sales_rep_id')
          .eq('organization_id', profile.organization_id)
          .gte('created_at', startOfMonth.toISOString())
      ]);

      const myProposals = myProposalsResult.data || [];
      const orgProposals = orgProposalsResult.data || [];
      const orgProfiles = orgProfilesResult.data || [];
      const mySalesOrders = mySalesOrdersResult.data || [];
      const orgSalesOrders = orgSalesOrdersResult.data || [];

      // ── MY METRICS ──────────────────────────────────────────────────────────

      // "Proposals Out" = proposals currently in sent/viewed status (all-time snapshot)
      // This matches exactly what the Sales Dashboard shows as "Proposals Out"
      const myProposalsOut = myProposals.filter(p =>
        ['sent', 'viewed'].includes(p.status)
      );
      const proposalsOut = myProposalsOut.length;

      // "Pipeline Value" = all active pipeline proposals (designing, ready, sent, viewed)
      // Same definition as Sales Dashboard pipeline value
      const myActivePipeline = myProposals.filter(p =>
        ['designing', 'ready_to_submit', 'sent', 'viewed'].includes(p.status)
      );
      const myPipelineValue = myActivePipeline.reduce((sum, p) => sum + parseFloat(p.total || '0'), 0);

      // Revenue = sum of contract_total from my sales orders this month
      // This matches exactly what Sales Dashboard shows as "Sales Orders Revenue"
      const myRevenue = mySalesOrders.reduce((sum, so) => sum + parseFloat(so.contract_total || '0'), 0);
      const dealsClosed = mySalesOrders.length;
      const avgDealSize = dealsClosed > 0 ? myRevenue / dealsClosed : 0;

      // Total value of all my proposals that are active this month
      const myMonthlyProposals = myProposals.filter(p =>
        new Date(p.created_at) >= startOfMonth
      );
      const totalProposalValue = myMonthlyProposals.reduce((sum, p) => sum + parseFloat(p.total || '0'), 0);

      // Conversion rate = won deals / proposals out (same denominator as dashboard win rate)
      const conversionRate = proposalsOut > 0
        ? Math.round((dealsClosed / proposalsOut) * 100)
        : 0;

      setMyMetrics({
        dealsClosed,
        revenue: myRevenue,
        proposalsOut,
        proposalsAccepted: dealsClosed,
        conversionRate,
        avgDealSize,
        totalProposalValue,
        pipelineValue: myPipelineValue
      });

      // ── LEADERBOARD ──────────────────────────────────────────────────────────

      // For each sales order, determine the owner (sales_rep_id takes priority, then created_by)

      // Revenue per person from sales orders this month
      const revenueByPerson = new Map<string, number>();
      const dealsByPerson = new Map<string, number>();
      orgSalesOrders.forEach(so => {
        const owner = so.sales_rep_id || so.created_by;
        if (!owner) return;
        revenueByPerson.set(owner, (revenueByPerson.get(owner) || 0) + parseFloat(so.contract_total || '0'));
        dealsByPerson.set(owner, (dealsByPerson.get(owner) || 0) + 1);
      });

      const leaderboardData = orgProfiles.map(person => {
        // proposalsSent for leaderboard = proposals currently out with customer (sent/viewed)
        // This matches the dashboard definition
        const personProposalsOut = orgProposals.filter(p =>
          p.created_by === person.id && ['sent', 'viewed'].includes(p.status)
        );

        const revenue = revenueByPerson.get(person.id) || 0;
        const deals = dealsByPerson.get(person.id) || 0;
        const proposalsSentCount = personProposalsOut.length;
        const rate = proposalsSentCount > 0
          ? Math.round((deals / proposalsSentCount) * 100)
          : 0;

        // Pipeline value for this person
        const personPipelineFiltered = getFilteredProposals(
          orgProposals.filter(p =>
            p.created_by === person.id &&
            ['designing', 'ready_to_submit', 'sent', 'viewed'].includes(p.status)
          )
        );
        const pipelineValue = personPipelineFiltered.reduce((sum, p) => sum + parseFloat(p.total || '0'), 0);

        return {
          id: person.id,
          full_name: person.full_name,
          revenue,
          deals,
          proposalsSent: proposalsSentCount,
          conversionRate: rate,
          pipelineValue,
          rank: 0
        };
      });

      if (mode === 'pipeline') {
        leaderboardData.sort((a, b) => b.pipelineValue - a.pipelineValue);
      } else {
        leaderboardData.sort((a, b) => b.revenue - a.revenue);
      }

      leaderboardData.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error('Error loading performance data:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-7 h-7 text-yellow-500" />;
      case 2:
        return <Medal className="w-7 h-7 text-gray-400" />;
      case 3:
        return <Medal className="w-7 h-7 text-orange-600" />;
      default:
        return null;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { color: 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600', text: 'Champion', icon: Flame, textColor: 'text-white' };
    if (rank === 2) return { color: 'bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500', text: 'Runner-up', icon: Star, textColor: 'text-white' };
    if (rank === 3) return { color: 'bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600', text: 'Bronze', icon: Zap, textColor: 'text-white' };
    if (rank <= 5) return { color: 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700', text: 'Top 5', icon: Award, textColor: 'text-white' };
    if (rank <= 10) return { color: 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700', text: 'Top 10', icon: TrendingUp, textColor: 'text-white' };
    return { color: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900', text: 'Competitor', icon: Target, textColor: 'text-white' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading performance data...</div>
      </div>
    );
  }

  const myRank = leaderboard.findIndex(entry => entry.id === profile?.id) + 1;
  const myLeaderboardEntry = leaderboard.find(entry => entry.id === profile?.id);
  const rankBadge = getRankBadge(myRank);
  const topPerformer = leaderboard[0];

  const displayValue = mode === 'pipeline' ? myMetrics.pipelineValue : myMetrics.revenue;
  const topPerformerValue = mode === 'pipeline' ? topPerformer?.pipelineValue : topPerformer?.revenue;
  const gapToFirst = topPerformer && myRank > 1 ? (topPerformerValue || 0) - displayValue : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
              Sales Performance Leaderboard
            </h2>
            <p className="text-sm text-gray-300">
              Compete with your team and track your ranking
            </p>
          </div>

          {/* Mode Toggle and Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700 flex-shrink-0">
              <button
                onClick={() => setMode('won')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-2 ${
                  mode === 'won'
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Won Deals</span>
                <span className="sm:hidden">Won</span>
              </button>
              <button
                onClick={() => setMode('pipeline')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-2 ${
                  mode === 'pipeline'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Pipeline
              </button>
            </div>

            {/* Status Filter (only show in pipeline mode) */}
            {mode === 'pipeline' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-medium flex-shrink-0"
              >
                <option value="all">All Proposals</option>
                <option value="exclude_draft">Exclude Drafts</option>
                <option value="only_active">Only Active (Sent/Viewed)</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* My Performance Banner - Enhanced with animations and effects */}
      <div className={`${rankBadge.color} ${rankBadge.textColor} rounded-2xl shadow-2xl p-8 relative overflow-hidden transform transition-all duration-300 hover:scale-[1.02] hover:shadow-3xl`}>
        {/* Animated background patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 animate-pulse">
            <Trophy className="w-40 h-40 transform rotate-12" />
          </div>
          <div className="absolute bottom-0 left-0 animate-pulse" style={{ animationDelay: '1s' }}>
            {rankBadge.icon && React.createElement(rankBadge.icon, { className: 'w-32 h-32 transform -rotate-12' })}
          </div>
        </div>

        {/* Shine effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 hover:opacity-20 transform -skew-x-12 transition-all duration-1000" style={{ animation: 'shine 3s infinite' }}></div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {myRank > 0 && (
                <div className="animate-bounce">
                  {getRankIcon(myRank)}
                </div>
              )}
              <div>
                <h3 className="text-3xl font-black tracking-tight">
                  {myRank > 0 ? `Rank #${myRank}` : 'Not Ranked'}
                </h3>
                {rankBadge.text && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-base font-semibold opacity-90">{rankBadge.text}</p>
                    {myRank === 1 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-white bg-opacity-30 animate-pulse">
                        🔥 On Fire
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {rankBadge.icon && (
              <div className="transform transition-transform duration-300 hover:rotate-12 hover:scale-110">
                {React.createElement(rankBadge.icon, { className: 'w-16 h-16 drop-shadow-lg' })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-4 transform transition-all duration-200 hover:bg-opacity-30 hover:scale-105">
              <p className="text-sm font-medium opacity-90 mb-2">
                {mode === 'pipeline' ? 'Pipeline Value' : 'Revenue'}
              </p>
              <p className="text-3xl font-black">{formatCurrency(displayValue)}</p>
            </div>
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-4 transform transition-all duration-200 hover:bg-opacity-30 hover:scale-105">
              <p className="text-sm font-medium opacity-90 mb-2">
                {mode === 'pipeline' ? 'Proposals Out' : 'Deals Closed'}
              </p>
              <p className="text-3xl font-black">
                {mode === 'pipeline' ? myMetrics.proposalsOut : myMetrics.dealsClosed}
              </p>
            </div>
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-4 transform transition-all duration-200 hover:bg-opacity-30 hover:scale-105">
              <p className="text-sm font-medium opacity-90 mb-2">Conversion</p>
              <p className="text-3xl font-black">{myMetrics.conversionRate}%</p>
            </div>
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-4 transform transition-all duration-200 hover:bg-opacity-30 hover:scale-105">
              <p className="text-sm font-medium opacity-90 mb-2">
                {mode === 'pipeline' ? 'Avg Pipeline' : 'Avg Deal'}
              </p>
              <p className="text-3xl font-black">
                {formatCurrency(mode === 'pipeline' ? myMetrics.pipelineValue / Math.max(1, myMetrics.proposalsOut) : myMetrics.avgDealSize)}
              </p>
            </div>
          </div>

          {myRank > 1 && gapToFirst > 0 && (
            <div className="mt-6 bg-white bg-opacity-25 backdrop-blur-sm rounded-xl p-4 border border-white border-opacity-30">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                <p className="text-sm font-semibold">
                  <strong className="text-lg">{formatCurrency(gapToFirst)}</strong> behind {topPerformer?.full_name || 'the leader'}
                </p>
              </div>
              <div className="mt-2 bg-white bg-opacity-20 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-full rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((displayValue / (displayValue + gapToFirst)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {myRank === 1 && (
            <div className="mt-6 bg-white bg-opacity-25 backdrop-blur-sm rounded-xl p-4 border border-white border-opacity-30 text-center">
              <p className="text-lg font-bold flex items-center justify-center gap-2">
                <Crown className="w-6 h-6 animate-pulse" />
                You're #1! Keep up the amazing work!
                <Crown className="w-6 h-6 animate-pulse" />
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats - Enhanced */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
            <FileText className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold">Proposals Out</h3>
            </div>
            <p className="text-5xl font-black mb-2">{myMetrics.proposalsOut}</p>
            <p className="text-sm opacity-90 font-medium">Currently with customers</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm">
                {mode === 'won' ? <TrendingUp className="w-7 h-7" /> : <DollarSign className="w-7 h-7" />}
              </div>
              <h3 className="text-lg font-bold">
                {mode === 'won' ? 'Win Rate' : 'Total Revenue'}
              </h3>
            </div>
            <p className="text-5xl font-black mb-2">
              {mode === 'won' ? `${myMetrics.conversionRate}%` : formatCurrency(myMetrics.revenue)}
            </p>
            <p className="text-sm opacity-90 font-medium">
              {mode === 'won' ? 'Proposal conversion' : 'Deals closed'}
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm">
                <Target className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold">
                {mode === 'won' ? 'Total Pipeline' : 'Active Pipeline'}
              </h3>
            </div>
            <p className="text-5xl font-black mb-2 truncate">
              {formatCurrency(mode === 'won' ? myMetrics.totalProposalValue : myMetrics.pipelineValue)}
            </p>
            <p className="text-sm opacity-90 font-medium">
              {statusFilter === 'all' ? 'All proposals' : statusFilter === 'exclude_draft' ? 'Excl. drafts' : 'Active only'}
            </p>
          </div>
        </div>
      </div>

      {/* Full Leaderboard - Enhanced */}
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-8">
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className={`p-2 sm:p-3 rounded-xl shadow-lg ${
            mode === 'pipeline'
              ? 'bg-gradient-to-br from-blue-400 to-blue-500'
              : 'bg-gradient-to-br from-yellow-400 to-amber-500'
          }`}>
            {mode === 'pipeline' ? <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-white" /> : <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg sm:text-2xl font-black text-gray-900 truncate">
              {mode === 'pipeline' ? 'Pipeline Rankings' : 'Sales Rankings'}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600">
              {mode === 'pipeline'
                ? statusFilter === 'all'
                  ? 'All active proposals'
                  : statusFilter === 'exclude_draft'
                  ? 'Excluding drafts'
                  : 'Sent/viewed only'
                : 'Won deals this month'}
            </p>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {leaderboard.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No leaderboard data available</p>
          ) : (
            leaderboard.map((entry, index) => {
              const isMe = entry.id === profile?.id;
              const badge = getRankBadge(entry.rank);

              return (
                <div
                  key={entry.id}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-5 rounded-xl transition-all duration-300 ${
                    isMe
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg border-2 border-blue-400'
                      : entry.rank === 1
                      ? 'bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-50 border-2 border-yellow-400 shadow-md'
                      : entry.rank === 2
                      ? 'bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 border-2 border-slate-400 shadow-md'
                      : entry.rank === 3
                      ? 'bg-gradient-to-r from-orange-50 via-orange-50 to-orange-100 border-2 border-orange-400 shadow-md'
                      : 'bg-white border-2 border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0">
                      {getRankIcon(entry.rank) ? (
                        <div className="transform transition-transform hover:scale-125">
                          {getRankIcon(entry.rank)}
                        </div>
                      ) : (
                        <div className={`flex items-center justify-center w-8 h-8 sm:w-12 sm:h-12 rounded-full font-bold text-sm sm:text-lg ${
                          isMe ? 'bg-white bg-opacity-30 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          #{entry.rank}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className={`font-black text-base sm:text-xl truncate ${isMe ? 'text-white' : 'text-gray-900'}`}>
                          {entry.full_name}
                        </p>
                        {isMe && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-white text-blue-600 animate-pulse flex-shrink-0">
                            You
                          </span>
                        )}
                        {badge.text && entry.rank <= 10 && !isMe && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                            entry.rank === 1 ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white' :
                            entry.rank === 2 ? 'bg-gradient-to-r from-slate-400 to-slate-500 text-white' :
                            entry.rank === 3 ? 'bg-gradient-to-r from-orange-400 to-orange-500 text-white' :
                            'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                          }`}>
                            {badge.text}
                          </span>
                        )}
                      </div>
                      <div className={`flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium ${
                        isMe ? 'text-white text-opacity-90' : 'text-gray-600'
                      }`}>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <Award className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">{entry.deals} deals</span>
                          <span className="sm:hidden">{entry.deals}</span>
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">{entry.proposalsSent} proposals</span>
                          <span className="sm:hidden">{entry.proposalsSent}</span>
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className={`flex items-center gap-1 flex-shrink-0 ${
                          entry.conversionRate >= 50
                            ? isMe ? 'text-green-200 font-bold' : 'text-green-600 font-bold'
                            : ''
                        }`}>
                          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                          {entry.conversionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right sm:text-right flex-shrink-0 self-end sm:self-auto">
                    <p className={`text-xl sm:text-3xl font-black ${
                      isMe ? 'text-white' : mode === 'pipeline' ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {formatCurrency(mode === 'pipeline' ? entry.pipelineValue : entry.revenue)}
                    </p>
                    {mode === 'pipeline' && (
                      <p className="text-xs mt-1 opacity-75">
                        Won: {formatCurrency(entry.revenue)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Competition Stats - Enhanced */}
      {leaderboard.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
              <Crown className="w-32 h-32 transform rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white bg-opacity-25 rounded-lg backdrop-blur-sm">
                  <Crown className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold">
                  {mode === 'pipeline' ? 'Top Pipeline' : 'Top Performer'}
                </h3>
              </div>
              <p className="text-xl font-bold mb-1">{topPerformer?.full_name}</p>
              <p className="text-4xl font-black">
                {formatCurrency(topPerformerValue || 0)}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 via-green-600 to-emerald-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="w-32 h-32 transform rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white bg-opacity-25 rounded-lg backdrop-blur-sm">
                  <TrendingUp className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold">Best Win Rate</h3>
              </div>
              {(() => {
                const bestConversion = leaderboard.reduce((best, entry) =>
                  entry.conversionRate > best.conversionRate ? entry : best
                , leaderboard[0]);
                return (
                  <>
                    <p className="text-xl font-bold mb-1">{bestConversion?.full_name}</p>
                    <p className="text-4xl font-black">
                      {bestConversion?.conversionRate}%
                    </p>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 via-rose-600 to-pink-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity">
              <Flame className="w-32 h-32 transform rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white bg-opacity-25 rounded-lg backdrop-blur-sm">
                  <Flame className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold">Most Active</h3>
              </div>
              {(() => {
                const mostActive = leaderboard.reduce((best, entry) =>
                  entry.proposalsSent > best.proposalsSent ? entry : best
                , leaderboard[0]);
                return (
                  <>
                    <p className="text-xl font-bold mb-1">{mostActive?.full_name}</p>
                    <p className="text-4xl font-black">
                      {mostActive?.proposalsSent} proposals
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
