import { useState, useEffect } from 'react';
import {
  Target, TrendingUp, DollarSign, Calendar, Users, Save, AlertCircle,
  CheckCircle, Percent, RefreshCw, Settings, ChevronDown, ChevronUp, Award
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SalesRep {
  id: string;
  full_name: string;
  email: string;
  role: string;
  sales_rep_start_date: string | null;
  quota_mode: 'base_plus_escalation' | 'custom_plus_escalation';
  custom_base_quota: number | null;
  custom_escalation_percentage: number | null;
  current_annual_quota: number | null;
  quota_last_calculated_at: string | null;
}

interface RepEdit {
  start_date: string;
  custom_base_quota: string;
  custom_escalation_percentage: string;
  use_custom_base: boolean;
}

interface QuotaBreakdownYear {
  year_number: number;
  calendar_year: number;
  window_start: string;
  window_end: string;
  quota: number;
  actual_revenue: number;
  rule: string;
}

interface QuotaResult {
  current_year_number: number;
  current_annual_quota: number;
  current_monthly_quota: number;
  base_quota_used: number;
  escalation_percentage: number;
  breakdown: QuotaBreakdownYear[];
}

interface OrgDefaults {
  id: string;
  profit_goal_percentage: number;
  default_base_annual_quota: number;
  default_quota_escalation_percentage: number;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function yearsOfService(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diff = today.getFullYear() - start.getFullYear()
    - (today < new Date(today.getFullYear(), start.getMonth(), start.getDate()) ? 1 : 0);
  return Math.max(1, diff + 1);
}

// Compute projected quota table purely on the frontend (for display only — DB is authoritative)
function projectYears(base: number, rate: number, count: number): { year: number; quota: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    year: i + 1,
    quota: Math.round(base * Math.pow(1 + rate / 100, i)),
  }));
}

const HIGHLIGHT_YEARS = [1, 2, 3, 5, 10, 15, 20, 25, 30];

export function SalesTargetManagement() {
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, RepEdit>>({});
  const [quotas, setQuotas] = useState<Record<string, QuotaResult>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  const [org, setOrg] = useState<OrgDefaults | null>(null);
  const [profitGoal, setProfitGoal] = useState('40');
  const [orgBaseQuota, setOrgBaseQuota] = useState('500000');
  const [orgEscalation, setOrgEscalation] = useState('5');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [recalcingAll, setRecalcingAll] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    await loadOrg();
    await loadSalesReps();
    setLoading(false);
  }

  async function loadOrg() {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, profit_goal_percentage, default_base_annual_quota, default_quota_escalation_percentage')
      .limit(1)
      .maybeSingle();
    if (error) { console.error(error); return; }
    if (data) {
      setOrg(data as OrgDefaults);
      setProfitGoal((data.profit_goal_percentage ?? 40).toString());
      setOrgBaseQuota((data.default_base_annual_quota ?? 500000).toString());
      setOrgEscalation((data.default_quota_escalation_percentage ?? 5).toString());
    }
  }

  async function loadSalesReps() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, sales_rep_start_date, quota_mode, custom_base_quota, custom_escalation_percentage, current_annual_quota, quota_last_calculated_at')
      .in('role', ['sales', 'admin', 'manager', 'sales_manager'])
      .eq('is_active', true)
      .order('full_name');
    if (error) { console.error(error); return; }

    const reps = (data || []) as SalesRep[];
    setSalesReps(reps);

    const initialEdits: Record<string, RepEdit> = {};
    reps.forEach(rep => {
      initialEdits[rep.id] = {
        start_date: rep.sales_rep_start_date
          ? new Date(rep.sales_rep_start_date + 'T12:00:00').toISOString().split('T')[0]
          : '',
        use_custom_base: rep.quota_mode === 'custom_plus_escalation' && rep.custom_base_quota != null,
        custom_base_quota: rep.custom_base_quota != null ? rep.custom_base_quota.toString() : '',
        custom_escalation_percentage: rep.custom_escalation_percentage != null ? rep.custom_escalation_percentage.toString() : '',
      };
    });
    setEdits(initialEdits);

    await Promise.all(reps.map(rep => loadQuotaPreview(rep.id)));
  }

  async function loadQuotaPreview(userId: string) {
    const { data, error } = await supabase.rpc('calculate_sales_quota', {
      p_user_id: userId,
      p_as_of_date: new Date().toISOString().split('T')[0],
    });
    if (error) { console.error('calc quota error', error); return; }
    if (data && !('error' in data)) {
      setQuotas(prev => ({ ...prev, [userId]: data as QuotaResult }));
    }
  }

  async function saveOrgDefaults() {
    if (!org) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase.from('organizations').update({
        profit_goal_percentage: parseFloat(profitGoal) || 40,
        default_base_annual_quota: parseFloat(orgBaseQuota) || 500000,
        default_quota_escalation_percentage: parseFloat(orgEscalation) || 5,
      }).eq('id', org.id);
      if (error) throw error;
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
      await loadOrg();
      await supabase.rpc('recalculate_all_sales_quotas');
      await loadSalesReps();
    } catch (e) {
      console.error(e);
      alert('Failed to save goal model.');
    } finally {
      setSavingOrg(false);
    }
  }

  async function recalcAll() {
    setRecalcingAll(true);
    try {
      await supabase.rpc('recalculate_all_sales_quotas');
      await loadSalesReps();
    } catch (e) {
      console.error(e);
    } finally {
      setRecalcingAll(false);
    }
  }

  function handleEditChange(repId: string, field: keyof RepEdit, value: string | boolean) {
    setEdits(prev => ({ ...prev, [repId]: { ...prev[repId], [field]: value } }));
    setSuccessIds(prev => { const s = new Set(prev); s.delete(repId); return s; });
    setErrorMessages(prev => { const n = { ...prev }; delete n[repId]; return n; });
  }

  async function saveRep(repId: string) {
    const edit = edits[repId];
    if (!edit) return;
    setSavingIds(prev => new Set(prev).add(repId));
    setErrorMessages(prev => { const n = { ...prev }; delete n[repId]; return n; });
    try {
      const updatePayload: Record<string, unknown> = {
        sales_rep_start_date: edit.start_date || null,
        quota_mode: edit.use_custom_base ? 'custom_plus_escalation' : 'base_plus_escalation',
        custom_base_quota: edit.use_custom_base && edit.custom_base_quota !== ''
          ? parseFloat(edit.custom_base_quota) : null,
        custom_escalation_percentage: edit.custom_escalation_percentage !== ''
          ? parseFloat(edit.custom_escalation_percentage) : null,
      };
      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', repId);
      if (error) throw error;
      await supabase.rpc('recalculate_sales_quota_for_user', { p_user_id: repId });
      await loadQuotaPreview(repId);
      await loadSalesReps();
      setSuccessIds(prev => new Set(prev).add(repId));
      setTimeout(() => setSuccessIds(prev => { const s = new Set(prev); s.delete(repId); return s; }), 3000);
    } catch (e) {
      console.error(e);
      setErrorMessages(prev => ({ ...prev, [repId]: 'Failed to save. Please try again.' }));
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(repId); return s; });
    }
  }

  // Preview model: live-updating before save
  function previewBase(repId: string): number {
    const edit = edits[repId];
    const orgBase = parseFloat(orgBaseQuota) || 500000;
    if (!edit) return orgBase;
    return edit.use_custom_base && edit.custom_base_quota !== ''
      ? parseFloat(edit.custom_base_quota) || orgBase
      : orgBase;
  }

  function previewRate(repId: string): number {
    const edit = edits[repId];
    const orgEsc = parseFloat(orgEscalation) || 5;
    if (!edit) return orgEsc;
    return edit.custom_escalation_percentage !== ''
      ? parseFloat(edit.custom_escalation_percentage) || orgEsc
      : orgEsc;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading sales targets...</div>
      </div>
    );
  }

  const orgBase = parseFloat(orgBaseQuota) || 500000;
  const orgEsc = parseFloat(orgEscalation) || 5;

  // Milestone projections for the org goal model
  const milestoneProjections = HIGHLIGHT_YEARS.map(yr => ({
    year: yr,
    quota: Math.round(orgBase * Math.pow(1 + orgEsc / 100, yr - 1)),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">Sales Rep Goal System</h2>
              <p className="text-blue-100 text-sm">
                Start date-driven quotas — compound annual growth, automatic calculation
              </p>
            </div>
          </div>
          <button
            onClick={recalcAll}
            disabled={recalcingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${recalcingAll ? 'animate-spin' : ''}`} />
            Recalculate All
          </button>
        </div>
      </div>

      {/* Goal Model Configuration */}
      <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Goal Model</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Sets the quota trajectory for all reps. Individual reps can override the base amount or growth rate below.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Starting Annual Quota (Year 1)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number" min="0" step="1000"
                value={orgBaseQuota}
                onChange={(e) => { setOrgBaseQuota(e.target.value); setOrgSaved(false); }}
                className="w-full pl-7 pr-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Annual Growth Rate
            </label>
            <div className="relative">
              <input
                type="number" min="0" max="100" step="0.1"
                value={orgEscalation}
                onChange={(e) => { setOrgEscalation(e.target.value); setOrgSaved(false); }}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Profit Margin Goal
            </label>
            <div className="relative">
              <input
                type="number" min="0" max="100" step="1"
                value={profitGoal}
                onChange={(e) => { setProfitGoal(e.target.value); setOrgSaved(false); }}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
            </div>
          </div>
        </div>

        {/* Milestone projections preview */}
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">Quota Trajectory Preview</span>
            <span className="text-xs text-blue-600 ml-auto">Formula: {formatCurrency(orgBase)} × (1 + {orgEsc}%)^(year−1)</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {milestoneProjections.map(({ year, quota }) => (
              <div key={year} className="bg-white rounded-lg p-2 border border-blue-100 text-center shadow-sm">
                <p className="text-xs text-gray-500 font-medium">Yr {year}</p>
                <p className="text-xs font-bold text-blue-700 mt-0.5">{formatCurrency(quota)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveOrgDefaults}
            disabled={savingOrg}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              orgSaved ? 'bg-green-600 text-white'
                : savingOrg ? 'bg-gray-300 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {orgSaved ? <><CheckCircle className="w-4 h-4" /> Saved</>
              : savingOrg ? <><Save className="w-4 h-4 animate-spin" /> Saving...</>
              : <><Save className="w-4 h-4" /> Save Goal Model</>}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">How it works: </span>
            Each rep's quota is calculated automatically from their start date using the goal model above.
            Set a start date, save, and the system calculates their current annual quota instantly.
            Quotas update each anniversary year — no manual entry needed.
          </div>
        </div>
      </div>

      {/* Rep cards */}
      <div className="space-y-4">
        {salesReps.map(rep => {
          const edit = edits[rep.id];
          if (!edit) return null;
          const quota = quotas[rep.id];
          const isSaving = savingIds.has(rep.id);
          const isSuccess = successIds.has(rep.id);
          const errorMessage = errorMessages[rep.id];
          const isExpanded = expandedReps.has(rep.id);

          const currentYearNum = quota?.current_year_number ?? (
            edit.start_date ? yearsOfService(edit.start_date) : null
          );

          const liveBase = previewBase(rep.id);
          const liveRate = previewRate(rep.id);
          const liveCurrentQuota = currentYearNum
            ? Math.round(liveBase * Math.pow(1 + liveRate / 100, currentYearNum - 1))
            : null;

          const projected30 = edit.start_date ? projectYears(liveBase, liveRate, 30) : [];

          return (
            <div key={rep.id} className="bg-white rounded-lg shadow-sm border-2 border-gray-200 hover:border-blue-200 transition-colors">
              <div className="p-6">
                {/* Rep header */}
                <div className="flex items-start justify-between mb-5 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900 truncate">{rep.full_name}</h3>
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {rep.role.charAt(0).toUpperCase() + rep.role.slice(1).replace('_', ' ')}
                      </span>
                      {currentYearNum && edit.start_date && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                          <Award className="w-3 h-3" />
                          Year {currentYearNum} of service
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{rep.email}</p>
                  </div>
                  <button
                    onClick={() => saveRep(rep.id)}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all flex-shrink-0 ${
                      isSuccess ? 'bg-green-600 text-white'
                        : isSaving ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isSuccess ? <><CheckCircle className="w-4 h-4" /> Saved</>
                      : isSaving ? <><Save className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save</>}
                  </button>
                </div>

                {errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{errorMessage}</p>
                  </div>
                )}

                {/* Configuration row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  {/* Start Date — primary field */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        Sales Start Date
                        <span className="text-xs text-blue-600 font-normal">(drives quota calculation)</span>
                      </div>
                    </label>
                    <input
                      type="date"
                      value={edit.start_date}
                      onChange={(e) => handleEditChange(rep.id, 'start_date', e.target.value)}
                      className="w-full px-3 py-2 border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50/30"
                    />
                    {edit.start_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        Anniversary: {new Date(edit.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} each year
                      </p>
                    )}
                  </div>

                  {/* Custom base toggle + input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-500" />
                        Starting Quota Override
                      </div>
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edit.use_custom_base}
                          onChange={(e) => handleEditChange(rep.id, 'use_custom_base', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-xs text-gray-600">Use custom starting quota</span>
                      </label>
                      {edit.use_custom_base ? (
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number" min="0" step="1000"
                            value={edit.custom_base_quota}
                            onChange={(e) => handleEditChange(rep.id, 'custom_base_quota', e.target.value)}
                            placeholder={orgBase.toString()}
                            className="w-full pl-7 pr-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </div>
                      ) : (
                        <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm text-gray-600">
                          Using org default: {formatCurrency(orgBase)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Growth rate override */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <div className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-gray-500" />
                        Growth Rate Override
                      </div>
                    </label>
                    <div className="relative">
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={edit.custom_escalation_percentage}
                        onChange={(e) => handleEditChange(rep.id, 'custom_escalation_percentage', e.target.value)}
                        placeholder={`${orgEsc}% (org default)`}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Leave blank to use org rate ({orgEsc}%)</p>
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 border-t-2 border-gray-100">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Annual Quota</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {liveCurrentQuota != null
                        ? formatCurrency(liveCurrentQuota)
                        : quota
                          ? formatCurrency(quota.current_annual_quota)
                          : edit.start_date ? '—' : 'No start date'}
                    </p>
                    {currentYearNum && (
                      <p className="text-xs text-gray-600 mt-1">Year {currentYearNum} quota</p>
                    )}
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Monthly Quota</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {liveCurrentQuota != null
                        ? formatCurrency(Math.round(liveCurrentQuota / 12))
                        : quota
                          ? formatCurrency(quota.current_monthly_quota)
                          : '—'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Annual ÷ 12</p>
                  </div>

                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Next Year Quota</p>
                    {edit.start_date && currentYearNum ? (
                      <>
                        <p className="text-2xl font-bold text-slate-700">
                          {formatCurrency(Math.round(liveBase * Math.pow(1 + liveRate / 100, currentYearNum)))}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">Year {currentYearNum + 1} projection</p>
                      </>
                    ) : (
                      <p className="text-2xl font-bold text-slate-400">—</p>
                    )}
                  </div>
                </div>

                {/* Expand / collapse full trajectory */}
                {edit.start_date && (
                  <button
                    onClick={() => setExpandedReps(prev => {
                      const s = new Set(prev);
                      s.has(rep.id) ? s.delete(rep.id) : s.add(rep.id);
                      return s;
                    })}
                    className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    {isExpanded
                      ? <><ChevronUp className="w-4 h-4" /> Hide 30-Year Trajectory</>
                      : <><ChevronDown className="w-4 h-4" /> View 30-Year Trajectory</>}
                  </button>
                )}
              </div>

              {/* 30-year trajectory table */}
              {isExpanded && edit.start_date && (
                <div className="border-t-2 border-gray-100 p-6 pt-4 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-gray-600" />
                    <h4 className="text-sm font-bold text-gray-900">30-Year Quota Trajectory</h4>
                    <span className="text-xs text-gray-500 ml-auto">
                      Based on {formatCurrency(liveBase)} base × {liveRate}% annual growth
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr className="text-left text-xs uppercase text-gray-500">
                          <th className="py-2 px-3">Year</th>
                          <th className="py-2 px-3">Anniversary Window</th>
                          <th className="py-2 px-3">Annual Quota</th>
                          <th className="py-2 px-3">Monthly Quota</th>
                          <th className="py-2 px-3">Actual Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projected30.map(({ year, quota: projQuota }) => {
                          const isCurrent = year === currentYearNum;
                          const isPast = currentYearNum != null && year < currentYearNum;
                          const breakdownRow = quota?.breakdown?.find(b => b.year_number === year);
                          const actualRevenue = breakdownRow?.actual_revenue ?? 0;

                          // Compute window dates from start_date
                          const start = new Date(edit.start_date + 'T12:00:00');
                          const winStart = new Date(start);
                          winStart.setFullYear(start.getFullYear() + year - 1);
                          const winEnd = new Date(start);
                          winEnd.setFullYear(start.getFullYear() + year);
                          winEnd.setDate(winEnd.getDate() - 1);

                          return (
                            <tr
                              key={year}
                              className={`border-b border-gray-100 ${
                                isCurrent ? 'bg-blue-50 font-semibold'
                                  : isPast ? 'bg-gray-50 text-gray-500'
                                  : ''
                              }`}
                            >
                              <td className="py-2 px-3">
                                <span className={`inline-flex items-center gap-1 ${isCurrent ? 'text-blue-700' : ''}`}>
                                  Yr {year}
                                  {isCurrent && (
                                    <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium">Now</span>
                                  )}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-gray-500 text-xs">
                                {winStart.toLocaleDateString()} – {winEnd.toLocaleDateString()}
                              </td>
                              <td className="py-2 px-3 text-blue-700 font-semibold">{formatCurrency(projQuota)}</td>
                              <td className="py-2 px-3 text-gray-700">{formatCurrency(Math.round(projQuota / 12))}</td>
                              <td className="py-2 px-3">
                                {actualRevenue > 0 ? (
                                  <span className={actualRevenue >= projQuota ? 'text-green-600 font-semibold' : 'text-gray-700'}>
                                    {formatCurrency(actualRevenue)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {salesReps.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-gray-200">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No sales representatives found</p>
        </div>
      )}
    </div>
  );
}
