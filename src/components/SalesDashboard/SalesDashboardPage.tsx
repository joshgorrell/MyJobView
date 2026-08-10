import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useSalesDashboard, useSalesLeaderboard } from '../../hooks/useSalesDashboard';
import { computeGoalProgress, computeAttentionItems } from '../../lib/salesDashboardCalculations';
import type { DashboardTab, SalesDashboardResult } from '../../lib/salesDashboardTypes';
import { AnnualGoalHero } from './AnnualGoalHero';
import { SalesKpiGrid } from './SalesKpiGrid';
import { SalesTrendChart } from './SalesTrendChart';
import { SalesGoalLeaderboard } from './SalesGoalLeaderboard';
import { SalesAttentionList } from './SalesAttentionList';
import { ManagerRepSelector } from './ManagerRepSelector';
import { DashboardSkeleton } from './DashboardSkeleton';
import { RefreshCw, AlertCircle, LayoutDashboard, TrendingUp, FileText, Users, Activity, History, BarChart3, Sunrise } from 'lucide-react';
import { DailyRecap } from './DailyRecap';

export interface SalesRepAIContext {
  repName: string;
  thisMonthTotal: number;
  ytdTotal: number;
  prevYearFull: number;
  ytdVsPriorPct: number | null;
  ytdVsPriorDir: 'up' | 'down' | 'flat';
  rolling3Pct: number | null;
  rolling3Dir: string;
  rolling12Pct: number | null;
  rolling12Dir: string;
  careerAvg: number;
  annualQuota: number;
  quotaProgress: number | null;
  allTimeTotal: number;
}

interface SalesDashboardPageProps {
  onProposalClick?: (proposalId: string) => void;
  onRepContextChange?: (ctx: SalesRepAIContext | null) => void;
  onNavigateToTab?: (tab: string) => void;
}

const TAB_CONFIG: { key: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'daily_recap', label: 'Daily Recap', icon: Sunrise },
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
  { key: 'pipeline', label: 'Pipeline', icon: BarChart3 },
  { key: 'proposals', label: 'Proposals', icon: FileText },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'history', label: 'History', icon: History },
];

export function SalesDashboardPage({ onProposalClick, onRepContextChange, onNavigateToTab }: SalesDashboardPageProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('daily_recap');
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  const isManager = profile?.role
    ? ['admin', 'manager', 'sales_manager'].includes(profile.role)
    : false;

  // For regular reps: always show their own data. For managers: default to self.
  const effectiveRepId = isManager
    ? (selectedRepId || profile?.id || null)
    : (profile?.id || null);

  const isManagerView = isManager && selectedRepId !== null && selectedRepId !== profile?.id;

  const { data, loading, error, refresh } = useSalesDashboard({
    repId: effectiveRepId,
    isManagerView,
  });

  const { data: leaderboardData, loading: leaderboardLoading } = useSalesLeaderboard();

  // Emit AI context when data changes
  useEffect(() => {
    if (!onRepContextChange || !data) return;

    const goal = computeGoalProgress(data);
    const currentMonth = data.monthlyTrend[0]?.total ?? 0;

    onRepContextChange({
      repName: data.repDisplayName,
      thisMonthTotal: currentMonth,
      ytdTotal: data.ytdTotal ?? data.bookedSales.total,
      prevYearFull: data.prevYearTotal ?? data.bookedSales.prevTotal,
      ytdVsPriorPct: (data.prevYearTotal ?? data.bookedSales.prevTotal) > 0
        ? Math.round((((data.ytdTotal ?? data.bookedSales.total) - (data.prevYearTotal ?? data.bookedSales.prevTotal)) / (data.prevYearTotal ?? data.bookedSales.prevTotal)) * 100)
        : null,
      ytdVsPriorDir: (data.ytdTotal ?? data.bookedSales.total) > (data.prevYearTotal ?? data.bookedSales.prevTotal) ? 'up' : (data.ytdTotal ?? data.bookedSales.total) < (data.prevYearTotal ?? data.bookedSales.prevTotal) ? 'down' : 'flat',
      rolling3Pct: null,
      rolling3Dir: 'flat',
      rolling12Pct: null,
      rolling12Dir: 'flat',
      careerAvg: data.bookedSales.avgSale,
      annualQuota: goal.annualQuota,
      quotaProgress: goal.hasQuota ? goal.pctAchieved : null,
      allTimeTotal: data.allTimeTotal ?? data.bookedSales.total,
    });
  }, [data, onRepContextChange]);

  const attentionItems = useMemo(() => {
    if (!data) return [];
    return computeAttentionItems(data);
  }, [data]);

  const handleNavigate = useCallback((tab: string) => {
    setActiveTab(tab as DashboardTab);
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Failed to load dashboard</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={refresh}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-sm text-gray-500">No dashboard data available.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Sales Dashboard</h1>
          <p className="text-sm text-gray-300 mt-0.5">
            {isManagerView ? `Viewing: ${data.repDisplayName}` : data.repDisplayName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isManager && profile?.organization_id && (
            <ManagerRepSelector
              selectedRepId={selectedRepId}
              onSelectRep={setSelectedRepId}
              orgId={profile.organization_id}
            />
          )}
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto border-b border-gray-700">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-gray-300 hover:text-white hover:border-gray-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'daily_recap' && (
        <DailyRecap
          repId={effectiveRepId}
          isManagerView={isManagerView}
          onNavigate={(tab, _recordId) => {
            if (onNavigateToTab) {
              onNavigateToTab(tab);
            } else {
              handleNavigate(tab as any);
            }
          }}
        />
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <AnnualGoalHero data={data} />
          <SalesKpiGrid data={data} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SalesTrendChart data={data} />
            </div>
            <div>
              <SalesGoalLeaderboard data={leaderboardData} loading={leaderboardLoading} />
            </div>
          </div>
          <SalesAttentionList items={attentionItems} onNavigate={handleNavigate} />
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <AnnualGoalHero data={data} />
          <SalesTrendChart data={data} />
          <SalesKpiGrid data={data} />
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Pipeline Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Pipeline Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.pipeline.total >= 1000 ? `$${(data.pipeline.total / 1000).toFixed(0)}K` : `$${data.pipeline.total.toFixed(0)}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Active Proposals</p>
                <p className="text-2xl font-bold text-gray-900">{data.pipeline.count}</p>
              </div>
            </div>
          </div>
          <SalesKpiGrid data={data} />
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Proposals</h3>
          <p className="text-sm text-gray-500">
            Your proposals are being loaded. Use the main Proposals tab in the sidebar for the full list.
          </p>
          {onProposalClick && (
            <button
              onClick={() => onProposalClick('')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Go to Proposals
            </button>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Activity</h3>
          <p className="text-sm text-gray-500">
            Detailed activity tracking is available in the Sales Activity module.
          </p>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Sales History</h3>
          <SalesTrendChart data={data} />
        </div>
      )}
    </div>
  );
}
