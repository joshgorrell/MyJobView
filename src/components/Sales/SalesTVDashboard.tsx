import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchTvDashboardData, fetchAllRepGoalProgress, type TvDashboardData, type RepGoalProgress } from '../../lib/salesKpis';
import {
  Wifi, WifiOff, Clock, TrendingUp, TrendingDown, DollarSign, Percent,
  Target, Award, Building2, Zap, FileText, BarChart3, ShoppingCart, Minus
} from 'lucide-react';

interface OfficeKpi {
  officeId: string;
  officeName: string;
  averageSale: number;
  averageMarginPct: number;
  orderCount: number;
}

const EMPTY_DATA: TvDashboardData = {
  averageSale: 0,
  averageMarginPct: 0,
  salesOrderCount: 0,
  monthlyRevenue: 0,
  pipelineValue: 0,
  proposalsOut: 0,
  proposalsCreated: 0,
  winRate: 0,
  conversionRate: 0,
  averageDealSize: 0,
  ytdTotal: 0,
  prevYearSamePeriod: 0,
  prevYearFull: 0,
  yoyPct: null,
  yoyDir: 'flat',
  monthlyTrend: [],
  yearlyBreakdown: [],
};

export default function SalesTVDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<TvDashboardData>(EMPTY_DATA);
  const [repProgress, setRepProgress] = useState<RepGoalProgress[]>([]);
  const [officeKpis, setOfficeKpis] = useState<OfficeKpi[]>([]);
  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadOrg = useCallback(async () => {
    if (!profile?.organization_id) return;
    const { data } = await supabase
      .from('organizations')
      .select('name, logo_url')
      .eq('id', profile.organization_id)
      .maybeSingle();
    if (data) {
      setOrgName(data.name || '');
      setOrgLogo(data.logo_url || '');
    }
  }, [profile?.organization_id]);

  const loadAllData = useCallback(async () => {
    try {
      if (!profile?.organization_id) return;
      const orgId = profile.organization_id;

      const [tvData, reps] = await Promise.all([
        fetchTvDashboardData(orgId),
        fetchAllRepGoalProgress(orgId),
      ]);

      setData(tvData);
      setRepProgress(reps);
      setIsConnected(true);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('TV Dashboard load error:', err);
      setIsConnected(false);
    }
  }, [profile?.organization_id]);

  const loadOfficeKpis = useCallback(async () => {
    try {
      if (!profile?.organization_id) return;

      const { data: offices } = await supabase
        .from('company_offices')
        .select('id, name')
        .order('name');

      if (!offices || offices.length === 0) return;

      const { fetchSalesKpis } = await import('../../lib/salesKpis');
      const results: OfficeKpi[] = [];
      for (const office of offices) {
        const kpis = await fetchSalesKpis({ type: 'office', officeId: office.id }, 'this_month');
        if (kpis.salesOrderCount > 0) {
          results.push({
            officeId: office.id,
            officeName: office.name,
            averageSale: kpis.averageSale,
            averageMarginPct: kpis.averageMarginPct,
            orderCount: kpis.salesOrderCount,
          });
        }
      }
      setOfficeKpis(results);
    } catch (err) {
      console.error('Office KPIs load error:', err);
    }
  }, [profile?.organization_id]);

  useEffect(() => {
    loadOrg();
    loadAllData();
    loadOfficeKpis();
    const interval = setInterval(() => {
      loadAllData();
      loadOfficeKpis();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadOrg, loadAllData, loadOfficeKpis]);

  function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  function formatCompact(v: number) {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return formatCurrency(v);
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  const marginColor = data.averageMarginPct >= 40 ? 'text-green-400' : data.averageMarginPct >= 25 ? 'text-amber-400' : 'text-red-400';
  const marginBg = data.averageMarginPct >= 40 ? 'from-green-500/20 to-green-600/10 border-green-500/30' : data.averageMarginPct >= 25 ? 'from-amber-500/20 to-amber-600/10 border-amber-500/30' : 'from-red-500/20 to-red-600/10 border-red-500/30';

  const yoyColor = data.yoyDir === 'up' ? 'text-green-400' : data.yoyDir === 'down' ? 'text-red-400' : 'text-gray-400';
  const yoyBg = data.yoyDir === 'up' ? 'from-green-500/20 to-green-600/10 border-green-500/30' : data.yoyDir === 'down' ? 'from-red-500/20 to-red-600/10 border-red-500/30' : 'from-gray-500/20 to-gray-600/10 border-gray-500/30';

  const trendMax = Math.max(...data.monthlyTrend.map(m => m.total), 1);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0d1224] to-[#0a0e1a] text-white overflow-hidden">
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.5; box-shadow: 0 0 20px currentColor; }
          50% { opacity: 1; box-shadow: 0 0 40px currentColor; }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes countUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .card-animate { animation: slideIn 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
        .stat-glow { animation: glow 3s ease-in-out infinite; }
        .live-dot::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: inherit;
          animation: pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          opacity: 0;
        }
        .gradient-animate {
          background-size: 200% 200%;
          animation: gradientShift 8s ease infinite;
        }
        .count-animate { animation: countUp 0.6s ease-out; }
        .glass-effect {
          background: rgba(17, 24, 39, 0.5);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          {orgLogo ? (
            <img src={orgLogo} alt={orgName} className="h-10 w-10 rounded-lg object-contain" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">{orgName || 'Sales Dashboard'}</h1>
            <p className="text-xs text-gray-400">Sales Performance KPIs & Goal Progress</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{formatTime(currentTime)}</div>
            <div className="text-xs text-gray-400">{formatDate(currentTime)}</div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 live-dot" />
                </div>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-400 font-medium">LIVE</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400 font-medium">OFFLINE</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-72px)] overflow-y-auto scrollbar-hide p-6 space-y-6">

        {/* Top KPI Row — 4 tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Monthly Revenue */}
          <div className="glass-effect rounded-2xl p-6 card-animate gradient-animate">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 flex items-center justify-center border border-emerald-500/30">
                  <DollarSign className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-200">Monthly Revenue</h2>
                  <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US', { month: 'long' })}</p>
                </div>
              </div>
            </div>
            <div className="text-4xl font-bold tabular-nums count-animate" key={data.monthlyRevenue}>
              {formatCurrency(data.monthlyRevenue)}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {data.salesOrderCount} sales orders
            </div>
          </div>

          {/* Pipeline Value */}
          <div className="glass-effect rounded-2xl p-6 card-animate">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-600/20 flex items-center justify-center border border-blue-500/30">
                  <ShoppingCart className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-200">Pipeline Value</h2>
                  <p className="text-xs text-gray-500">Active proposals</p>
                </div>
              </div>
            </div>
            <div className="text-4xl font-bold tabular-nums count-animate text-blue-400" key={data.pipelineValue}>
              {formatCurrency(data.pipelineValue)}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {data.proposalsOut} out with customers
            </div>
          </div>

          {/* YTD Total with YoY */}
          <div className={`glass-effect rounded-2xl p-6 card-animate bg-gradient-to-br ${yoyBg}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                  <BarChart3 className="w-7 h-7 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-200">YTD Sales</h2>
                  <p className="text-xs text-gray-500">{new Date().getFullYear()} Year-to-Date</p>
                </div>
              </div>
            </div>
            <div className="text-4xl font-bold tabular-nums count-animate" key={data.ytdTotal}>
              {formatCurrency(data.ytdTotal)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {data.yoyPct !== null ? (
                <div className={`flex items-center gap-1 text-sm font-medium ${yoyColor}`}>
                  {data.yoyDir === 'up' ? <TrendingUp className="w-4 h-4" /> : data.yoyDir === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {data.yoyPct > 0 ? '+' : ''}{data.yoyPct}% vs {new Date().getFullYear() - 1}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No prior year data</div>
              )}
            </div>
          </div>

          {/* Win Rate */}
          <div className="glass-effect rounded-2xl p-6 card-animate">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/20 flex items-center justify-center border border-amber-500/30">
                  <Target className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-200">Win Rate</h2>
                  <p className="text-xs text-gray-500">All-time proposals</p>
                </div>
              </div>
            </div>
            <div className="text-4xl font-bold tabular-nums count-animate text-amber-400" key={data.winRate}>
              {data.winRate}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Avg deal: {formatCurrency(data.averageDealSize)}
            </div>
          </div>
        </div>

        {/* Second KPI Row — Average Sale, Margin, Proposals Created, Conversion */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Average Sale */}
          <div className="glass-effect rounded-2xl p-5 card-animate">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium text-gray-300">Average Sale</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-emerald-400">{formatCurrency(data.averageSale)}</div>
            <div className="text-xs text-gray-500 mt-1">This month</div>
          </div>

          {/* Average Profit Margin */}
          <div className={`glass-effect rounded-2xl p-5 card-animate bg-gradient-to-br ${marginBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Percent className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-gray-300">Avg Profit Margin</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${marginColor}`}>{data.averageMarginPct.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">
              {data.averageMarginPct >= 40 ? 'Above target' : data.averageMarginPct >= 25 ? 'Near target' : 'Below target'}
            </div>
          </div>

          {/* Proposals Created */}
          <div className="glass-effect rounded-2xl p-5 card-animate">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-teal-400" />
              <span className="text-sm font-medium text-gray-300">Proposals Created</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-teal-400">{data.proposalsCreated}</div>
            <div className="text-xs text-gray-500 mt-1">This month</div>
          </div>

          {/* Conversion Rate */}
          <div className="glass-effect rounded-2xl p-5 card-animate">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-orange-400" />
              <span className="text-sm font-medium text-gray-300">Conversion Rate</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-orange-400">{data.conversionRate}%</div>
            <div className="text-xs text-gray-500 mt-1">Approved vs active</div>
          </div>
        </div>

        {/* 24-Month Trend Bar Chart */}
        {data.monthlyTrend.length > 0 && (
          <div className="glass-effect rounded-2xl p-6 card-animate">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-200">24-Month Sales Trend</h2>
              <span className="text-xs text-gray-500 ml-2">Includes manual uploads</span>
            </div>
            <div className="flex items-end gap-0.5 h-32">
              {data.monthlyTrend.map((bar, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${bar.label}: ${formatCurrency(bar.total)}`}>
                  <div
                    className={`w-full rounded-sm transition-all duration-300 ${
                      bar.isCurrentMonth
                        ? 'bg-blue-500'
                        : bar.total > 0
                        ? 'bg-emerald-500/60 hover:bg-emerald-400'
                        : 'bg-gray-700/40'
                    }`}
                    style={{ height: `${Math.max((bar.total / trendMax) * 100, bar.total > 0 ? 3 : 0)}%` }}
                  />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                    <div className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
                      <div className="font-semibold">{bar.label}</div>
                      <div>{formatCurrency(bar.total)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/60 inline-block" /> Sales</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Current month</span>
            </div>
          </div>
        )}

        {/* Year-over-Year Breakdown */}
        {data.yearlyBreakdown.length > 0 && (
          <div className="glass-effect rounded-2xl p-6 card-animate">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-gray-200">Year-over-Year Performance</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {data.yearlyBreakdown.map(card => (
                <div key={card.year} className="rounded-xl bg-white/5 p-4 border border-white/5">
                  <div className="text-xs text-gray-400 mb-1">{card.year}</div>
                  <div className="text-lg font-bold text-white tabular-nums">{formatCompact(card.total)}</div>
                  {card.yoy !== null ? (
                    <div className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded mt-1.5 ${
                      card.dir === 'up' ? 'bg-green-500/20 text-green-400' :
                      card.dir === 'down' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {card.dir === 'up' ? <TrendingUp className="w-3 h-3" /> : card.dir === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
                      {card.yoy > 0 ? '+' : ''}{card.yoy}%
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 mt-1.5">Baseline</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rep Goal Progress Leaderboard */}
        <div className="glass-effect rounded-2xl p-6 card-animate">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-gray-200">Sales Goal Progress</h2>
            </div>
            <span className="text-xs text-gray-500">YTD vs Annual Quota (includes manual uploads)</span>
          </div>

          {repProgress.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No sales reps with quotas configured</p>
            </div>
          ) : (
            <div className="space-y-3">
              {repProgress.map((rep, idx) => {
                const progressClamped = Math.min(rep.quotaProgress, 100);
                const barColor = rep.quotaProgress >= 100 ? 'from-green-400 to-green-500' : rep.quotaProgress >= 75 ? 'from-blue-400 to-blue-500' : rep.quotaProgress >= 50 ? 'from-amber-400 to-amber-500' : 'from-red-400 to-red-500';
                const textColor = rep.quotaProgress >= 100 ? 'text-green-400' : rep.quotaProgress >= 75 ? 'text-blue-400' : rep.quotaProgress >= 50 ? 'text-amber-400' : 'text-red-400';

                return (
                  <div key={rep.repId} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : idx === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/40' : idx === 2 ? 'bg-orange-700/20 text-orange-500 border border-orange-700/40' : 'text-gray-500'}`}>
                      {idx + 1}
                    </div>

                    {/* Name + quota */}
                    <div className="w-40 flex-shrink-0">
                      <div className="text-sm font-semibold text-white truncate">{rep.repName}</div>
                      <div className="text-xs text-gray-500">Quota: {formatCurrency(rep.annualQuota)}</div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex-1">
                      <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                          style={{ width: `${progressClamped}%` }}
                        />
                      </div>
                    </div>

                    {/* YTD Sales */}
                    <div className="w-32 text-right">
                      <div className="text-sm font-bold tabular-nums text-white">{formatCurrency(rep.ytdSales)}</div>
                      <div className="text-xs text-gray-500">YTD</div>
                    </div>

                    {/* Progress % */}
                    <div className={`w-16 text-right ${textColor}`}>
                      <span className="text-lg font-bold tabular-nums">{rep.quotaProgress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Office Breakdown */}
        {officeKpis.length > 0 && (
          <div className="glass-effect rounded-2xl p-6 card-animate">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-200">Office Breakdown</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {officeKpis.map(office => (
                <div key={office.officeId} className="rounded-xl bg-white/5 p-4 border border-white/5">
                  <div className="text-sm font-semibold text-gray-300 truncate mb-3">{office.officeName}</div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-500">Avg Sale</div>
                      <div className="text-lg font-bold tabular-nums text-emerald-400">{formatCurrency(office.averageSale)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Avg Margin</div>
                      <div className={`text-lg font-bold tabular-nums ${office.averageMarginPct >= 40 ? 'text-green-400' : office.averageMarginPct >= 25 ? 'text-amber-400' : 'text-red-400'}`}>
                        {office.averageMarginPct.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">{office.orderCount} orders</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3" />
            <span>Auto-refreshing every 30 seconds</span>
          </div>
          <div>Last updated: {lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</div>
        </div>
      </div>
    </div>
  );
}
