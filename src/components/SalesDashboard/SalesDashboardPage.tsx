import { salesDashboardScope } from '../../lib/salesDashboardScope';
import { companySalesDashboard } from '../../lib/companySalesDashboard';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSalesDashboard, useSalesLeaderboard } from '../../hooks/useSalesDashboard';
import { computeGoalProgress, computeAttentionItems } from '../../lib/salesDashboardCalculations';
import type { DashboardTab } from '../../lib/salesDashboardTypes';
import { AnnualGoalHero } from './AnnualGoalHero';
import { SalesKpiGrid } from './SalesKpiGrid';
import { SalesTrendChart } from './SalesTrendChart';
import { MonthlySalesCompetition } from './MonthlySalesCompetition';
import { SalesGoalLeaderboard } from './SalesGoalLeaderboard';
import { SalesAttentionList } from './SalesAttentionList';
import { ManagerRepSelector } from './ManagerRepSelector';
import { DashboardSkeleton } from './DashboardSkeleton';
import { HotLeadsCard } from './HotLeadsCard';
import { StaleLeadsCard } from './StaleLeadsCard';
import { DeclineReasonsCard } from './DeclineReasonsCard';
import { PeriodStatsRow } from './PeriodStatsRow';
import { RecentProposalsCard } from './RecentProposalsCard';
import { RecentActivityCard } from './RecentActivityCard';
import { RefreshCw, AlertCircle, LayoutDashboard, FileText, Activity, BarChart3, Sunrise } from 'lucide-react';
import { DailyRecap } from './DailyRecap';
import { useSalesDashboardRecords } from '../../hooks/useSalesDashboardRecords';
import { buildSalesLists, periodBounds, SALES_LIST_LABELS, type SalesPeriod, type SalesListKey, type SalesRecord } from '../../lib/salesDashboardRecords';
import { SalesResultsSummary } from './SalesResultsSummary';
import { SalesRecordList } from './SalesRecordList';
import { SalesConnectionDetail } from './SalesConnectionDetail';
import { DailySalesTotalsPanel } from './DailySalesTotalsPanel';

export interface SalesRepAIContext {
  repId: string;
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
  onNavigateToTab?: (tab: string, recordId?: string) => void;
  onOpenRecord?: (record: SalesRecord) => void;
}

const TAB_CONFIG: { key: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'daily_recap', label: 'Daily Recap', icon: Sunrise },
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'pipeline', label: 'Pipeline', icon: BarChart3 },
  { key: 'proposals', label: 'Proposals', icon: FileText },
  { key: 'activity', label: 'Activity', icon: Activity },
];

export function SalesDashboardPage({ onProposalClick, onRepContextChange, onNavigateToTab, onOpenRecord }: SalesDashboardPageProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>(profile?.is_sales_rep ? 'daily_recap' : 'overview');
  const [period, setPeriod] = useState<SalesPeriod>('month');
  const [selectedList, setSelectedList] = useState<SalesListKey | null>(null);
  const [listSource, setListSource] = useState<'customer' | 'rep' | null>(null);
  const [listReason, setListReason] = useState<string | null>(null);
  const selectList = (key: SalesListKey) => { setListSource(null); setListReason(null); setSelectedList(key); };
  const [connectionRecord, setConnectionRecord] = useState<SalesRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRepId, setSelectedRepId] = useState<string | null | undefined>(undefined);

  const { repId: effectiveRepId, canSelectRep: isManager, allSales } = salesDashboardScope(profile, selectedRepId);
  const isManagerView = isManager && effectiveRepId !== null && effectiveRepId !== profile?.id;
  const canViewDashboard = isManager || profile?.is_sales_rep === true;

  const { data: repData, loading: repLoading, error: repError, refresh: refreshBase } = useSalesDashboard({
    repId: effectiveRepId,
    isManagerView,
  });

  const records = useSalesDashboardRecords(effectiveRepId, profile?.organization_id || undefined, refreshKey, allSales);
  const baseData = useMemo(() => allSales ? (records.source ? companySalesDashboard(records.source) : null) : repData, [allSales, records.source, repData]);
  const loading = allSales ? records.loading : repLoading;
  const baseError = allSales ? null : repError;
  const lists = useMemo(() => baseData && records.source ? buildSalesLists(records.source, period, baseData.quota) : null, [baseData, records.source, period]);
  const refresh = useCallback(() => { refreshBase(); setRefreshKey(n => n + 1); }, [refreshBase]);
  const error = baseError || records.error;
  useEffect(() => { if (allSales && period === 'quota') setPeriod('year'); setSelectedList(null); setConnectionRecord(null); }, [effectiveRepId, period, allSales]);
  const data = useMemo(() => {
    if (!baseData || !lists || !records.source) return baseData;
    const previousDate = new Date();
    const previousQuota = { ...baseData.quota };
    if (period === 'month' || period === 'quarter') {
      const day = previousDate.getDate(); previousDate.setDate(1); previousDate.setMonth(previousDate.getMonth() - (period === 'month' ? 1 : 3));
      previousDate.setDate(Math.min(day, new Date(previousDate.getFullYear(), previousDate.getMonth() + 1, 0).getDate()));
    } else {
      previousDate.setFullYear(previousDate.getFullYear() - 1);
      previousQuota.quotaStartDate = `${Number(baseData.quota.quotaStartDate.slice(0, 4)) - 1}${baseData.quota.quotaStartDate.slice(4)}`;
      previousQuota.quotaEndDate = `${Number(baseData.quota.quotaEndDate.slice(0, 4)) - 1}${baseData.quota.quotaEndDate.slice(4)}`;
    }
    const previous = buildSalesLists(records.source, period, previousQuota, previousDate);
    const closed = lists.closed.length;
    return { ...baseData,
      ...(allSales ? { runRate90Day: lists.runRate.reduce((sum, r) => sum + (r.amount || 0), 0) / 90 * 365 } : {}),
      closeRate: { ...baseData.closeRate, pct: closed ? Math.round(lists.won.length / closed * 1000) / 10 : 0, wonCount: lists.won.length, lostCount: lists.lost.length, prevPct: previous.closed.length ? Math.round(previous.won.length / previous.closed.length * 1000) / 10 : 0, prevWonCount: previous.won.length, prevLostCount: previous.lost.length },
      pipeline: { count: lists.pipeline.length, total: lists.pipeline.reduce((sum, r) => sum + (r.amount || 0), 0) },
      expiredProposalsCount: lists.stale.length,
      hotLeads: lists.hot.slice(0, 5).map(r => ({ id: r.id, companyName: r.customer, contactName: r.title, estimatedValue: r.amount || 0, priority: records.source!.leads.find(l => l.id === r.id)?.priority || 'high', status: r.status })),
      staleLeads: lists.staleLeads.slice(0, 5).map(r => ({ id: r.id, companyName: r.customer, contactName: r.title, estimatedValue: r.amount || 0, priority: '', lastContactDate: records.source!.leads.find(l => l.id === r.id)?.last_contact_date, daysSinceContact: r.detail === 'Never contacted' ? 999 : Math.floor((Date.now() - new Date(r.date).getTime()) / 86400000) })),
      declineReasons: [...new Set(lists.lost.map(r => r.reason || 'unknown'))].map(reason => ({ reason, count: lists.lost.filter(r => (r.reason || 'unknown') === reason).length, byCustomer: lists.lost.filter(r => (r.reason || 'unknown') === reason && records.source!.proposals.find(p => p.id === r.id)?.declined_by === 'customer').length, byRep: lists.lost.filter(r => (r.reason || 'unknown') === reason && records.source!.proposals.find(p => p.id === r.id)?.declined_by !== 'customer').length })),
      periodStats: { contactsAdded: lists.contacts.length, connectionsLogged: lists.connections.length, proposalsCreated: lists.created.length, proposalsExpired: lists.stale.length, proposalsDeclined: lists.lost.length },
      recentProposals: [...lists.created].slice(0, 5).map(r => ({ id: r.id, proposalNumber: r.title, status: r.status, total: r.amount || 0, customerName: r.customer, createdAt: r.date })),
      recentActivity: [...records.source.leads.filter(l => { const bounds = periodBounds(period, baseData.quota); return l.created_at.slice(0, 10) >= bounds.start && l.created_at.slice(0, 10) <= bounds.end; }).map(l => ({ id: l.id, kind: 'lead' as const, title: `Lead added: ${l.contact_name || l.company_name}`, customer: l.company_name || '', status: l.status, date: l.created_at })), ...lists.connections, ...lists.created.map(r => ({ ...r, title: `Created ${r.title}` })), ...lists.sent.map(r => ({ ...r, title: `Sent ${r.title}` })), ...lists.won.map(r => ({ ...r, title: `Won ${r.title}` })), ...lists.lost.map(r => ({ ...r, title: `Lost ${r.title}` }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((r, i) => ({ id: `${r.kind}-${r.id}-${i}`, recordId: r.id, recordKind: r.kind, type: (r.kind === 'connection' ? 'connection' : 'proposal_created') as 'connection' | 'proposal_created', createdAt: r.date, title: r.kind === 'connection' ? r.title : `${r.title} · ${r.status.replace(/_/g, ' ')}`, description: r.customer })),
    };
  }, [baseData, lists, records.source, allSales]);
  const openRecord = useCallback((record: SalesRecord) => {
    if (record.kind === 'connection') { setConnectionRecord(record); return; }
    if (record.kind === 'proposal' && onProposalClick) { onProposalClick(record.id); return; }
    onOpenRecord?.({ ...record, id: record.recordId || record.id });
  }, [onOpenRecord, onProposalClick]);
  const { data: leaderboardData, loading: leaderboardLoading } = useSalesLeaderboard(canViewDashboard && activeTab === 'overview');

  useEffect(() => {
    if (!onRepContextChange) return;
    if (allSales || !data) { onRepContextChange(null); return; }

    const goal = computeGoalProgress(data);
    const currentMonth = data.monthlyTrend[0]?.total ?? 0;

    onRepContextChange({
      repId: data.repId,
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
  }, [data, allSales, onRepContextChange]);

  const attentionItems = useMemo(() => {
    if (!data) return [];
    return computeAttentionItems(data);
  }, [data]);

  const handleNavigate = useCallback((tab: string) => {
    setActiveTab(tab === 'performance' ? 'overview' : tab as DashboardTab);
  }, []);

  const handleNavigateToProposals = useCallback(() => { setListSource(null); setListReason(null); setSelectedList('created'); }, []);

  const handleNavigateToActivity = useCallback(() => { setListSource(null); setListReason(null); setSelectedList('connections'); }, []);

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Sales Dashboard</h1>
          <p className="text-xs sm:text-sm text-gray-300 mt-0.5">
            {loading ? 'Loading sales data…' : isManagerView ? `Viewing: ${data?.repDisplayName}` : data?.repDisplayName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isManager && profile?.organization_id && (
            <ManagerRepSelector
              selectedRepId={effectiveRepId}
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
  );

  if (!canViewDashboard) {
    return <p className="px-4 py-6 text-sm text-gray-300">You do not have access to the Sales Dashboard.</p>;
  }

  if (loading || records.loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {header}
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
      {header}

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-gray-200">
        <label htmlFor="sales-period">Reporting period</label>
        <select id="sales-period" value={period} onChange={e => setPeriod(e.target.value as SalesPeriod)} className="rounded-lg border border-gray-600 bg-gray-800 p-2 text-white">
          <option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This calendar year</option>{!allSales && <option value="quota">This quota year</option>}
        </select>
        <span>{allSales ? 'Booked sales use the calendar year.' : 'Goals and booked sales use the quota year.'} Follow-up queues include all outstanding items.</span>
      </div>
      {connectionRecord ? <SalesConnectionDetail key={connectionRecord.id} record={connectionRecord} onBack={() => setConnectionRecord(null)} onSaved={refresh} /> : selectedList && lists ?
        <SalesRecordList key={`${selectedList}:${effectiveRepId}:${period}`} title={SALES_LIST_LABELS[selectedList]} subtitle={`${data.repDisplayName} · ${['stale', 'pipeline', 'followups', 'untouched', 'hot', 'staleLeads'].includes(selectedList) ? 'All outstanding items' : ['booked', 'runRate'].includes(selectedList) ? selectedList === 'booked' ? `${data.quota.quotaStartDate} to ${data.quota.quotaEndDate}` : 'Last 90 days' : `${periodBounds(period, data.quota).start} to ${periodBounds(period, data.quota).end}`}`} records={listReason ? lists[selectedList].filter(r => (r.reason || 'unknown') === listReason && (!listSource || (records.source?.proposals.find(p => p.id === r.id)?.declined_by === 'customer' ? 'customer' : 'rep') === listSource)) : lists[selectedList]} onBack={() => setSelectedList(null)} onOpen={openRecord} /> : <>
      {lists && <SalesResultsSummary allSales={allSales} lists={lists} onSelect={selectList} />}
      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-3 sm:mb-6 overflow-x-auto border-b border-gray-700 [scrollbar-width:thin] -mx-3 px-3 sm:mx-0 sm:px-0">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
        <div className="space-y-6">
          <DailySalesTotalsPanel key={effectiveRepId || "all"}
            repId={effectiveRepId}
            allSales={allSales}
            onUpdateReport={profile?.role === 'admin' ? () => onNavigateToTab?.('daily_sales_report_import') : undefined}
          />
          {allSales ? <p className="text-sm text-gray-300">Select a sales rep to view their daily recap and checklist.</p> : <DailyRecap
            repId={effectiveRepId}
            isManagerView={isManagerView}
            onNavigate={(tab, recordId) => {
              if (onNavigateToTab) {
                onNavigateToTab(tab, recordId);
              } else {
                handleNavigate(tab as any);
              }
            }}
          />}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <MonthlySalesCompetition key={`${profile?.organization_id}:${effectiveRepId || "all"}`} repId={effectiveRepId} onOrderClick={id => onOpenRecord?.({ id, kind: 'order', title: 'Sales order', customer: '', status: '', date: '' })} />
          {!allSales && <AnnualGoalHero data={data} teamRank={data.teamRank ?? null} />}
          <SalesKpiGrid data={data} onSelect={selectList} />
          {data.periodStats && <PeriodStatsRow stats={data.periodStats} onSelect={selectList} />}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SalesTrendChart data={data} />
            </div>
            <div>
              <SalesGoalLeaderboard data={leaderboardData} loading={leaderboardLoading} />
            </div>
          </div>
          <SalesAttentionList items={attentionItems} onNavigate={handleNavigate} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HotLeadsCard onLeadClick={id => onOpenRecord?.({ id, kind: 'lead', title: 'Lead', customer: '', status: '', date: '' })} leads={data.hotLeads ?? []} onNavigateToPipeline={() => selectList('hot')} />
            <StaleLeadsCard onLeadClick={id => onOpenRecord?.({ id, kind: 'lead', title: 'Lead', customer: '', status: '', date: '' })} leads={data.staleLeads ?? []} onNavigateToPipeline={() => selectList('staleLeads')} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentProposalsCard onProposalClick={onProposalClick} proposals={data.recentProposals ?? []} onNavigateToProposals={handleNavigateToProposals} />
            <RecentActivityCard onOpenRecord={openRecord} activities={data.recentActivity ?? []} onNavigateToActivity={handleNavigateToActivity} />
          </div>
          {(data.declineReasons ?? []).length > 0 && (
            <DeclineReasonsCard onReasonClick={(reason, source) => { setListSource(source || null); setListReason(reason); setSelectedList('lost'); }} reasons={data.declineReasons ?? []} />
          )}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Pipeline Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Pipeline Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.pipeline.total >= 1000 ? `$${(data.pipeline.total / 1000).toFixed(0)}K` : `$${data.pipeline.total.toFixed(0)}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Active Proposals</p>
                <button onClick={() => selectList('pipeline')} className="text-2xl font-bold text-blue-700 hover:underline">{data.pipeline.count}</button>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Close Rate</p>
                <p className="text-2xl font-bold text-gray-900">{data.closeRate.pct}%</p>
                <button onClick={() => selectList('closed')} className="text-xs text-blue-700 hover:underline mt-0.5">{data.closeRate.wonCount} won / {data.closeRate.wonCount + data.closeRate.lostCount} closed</button>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Run Rate (90d)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.runRate90Day >= 1000 ? `$${(data.runRate90Day / 1000).toFixed(0)}K` : `$${data.runRate90Day.toFixed(0)}`}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HotLeadsCard onLeadClick={id => onOpenRecord?.({ id, kind: 'lead', title: 'Lead', customer: '', status: '', date: '' })} leads={data.hotLeads ?? []} onNavigateToPipeline={() => selectList('hot')} />
            <StaleLeadsCard onLeadClick={id => onOpenRecord?.({ id, kind: 'lead', title: 'Lead', customer: '', status: '', date: '' })} leads={data.staleLeads ?? []} onNavigateToPipeline={() => selectList('staleLeads')} />
          </div>
          <RecentProposalsCard onProposalClick={onProposalClick} proposals={data.recentProposals ?? []} onNavigateToProposals={handleNavigateToProposals} />
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="space-y-6">
          <RecentProposalsCard onProposalClick={onProposalClick} proposals={data.recentProposals ?? []} onNavigateToProposals={handleNavigateToProposals} />
          {(data.declineReasons ?? []).length > 0 && (
            <DeclineReasonsCard onReasonClick={(reason, source) => { setListSource(source || null); setListReason(reason); setSelectedList('lost'); }} reasons={data.declineReasons ?? []} />
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-6">
          <RecentActivityCard onOpenRecord={openRecord} activities={data.recentActivity ?? []} onNavigateToActivity={handleNavigateToActivity} />
          {data.periodStats && <PeriodStatsRow stats={data.periodStats} onSelect={selectList} />}
        </div>
      )}
      </>}
    </div>
  );
}
