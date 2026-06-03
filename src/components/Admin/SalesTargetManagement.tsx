import { useState, useEffect } from 'react';
import { Target, TrendingUp, DollarSign, Calendar, Users, Save, AlertCircle, CheckCircle, Percent, RefreshCw, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type QuotaMode = 'base_plus_escalation' | 'custom_plus_escalation';

interface SalesRep {
  id: string;
  full_name: string;
  email: string;
  role: string;
  sales_rep_start_date: string | null;
  quota_mode: QuotaMode;
  custom_base_quota: number | null;
  custom_escalation_percentage: number | null;
  current_annual_quota: number | null;
  quota_last_calculated_at: string | null;
}

interface RepEdit {
  start_date: string;
  quota_mode: QuotaMode;
  custom_base_quota: string;
  custom_escalation_percentage: string;
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
  rolling_average_years: number;
  breakdown: QuotaBreakdownYear[];
}

interface OrgDefaults {
  id: string;
  profit_goal_percentage: number;
  default_base_annual_quota: number;
  default_quota_escalation_percentage: number;
  default_quota_rolling_average_years: number;
}

export function SalesTargetManagement() {
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, RepEdit>>({});
  const [quotas, setQuotas] = useState<Record<string, QuotaResult>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});

  const [org, setOrg] = useState<OrgDefaults | null>(null);
  const [profitGoal, setProfitGoal] = useState('40');
  const [orgBaseQuota, setOrgBaseQuota] = useState('500000');
  const [orgEscalation, setOrgEscalation] = useState('5');
  const [orgRollingYears, setOrgRollingYears] = useState('3');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [recalcingAll, setRecalcingAll] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await loadOrg();
    await loadSalesReps();
    setLoading(false);
  }

  async function loadOrg() {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, profit_goal_percentage, default_base_annual_quota, default_quota_escalation_percentage, default_quota_rolling_average_years')
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(error);
      return;
    }
    if (data) {
      setOrg(data as OrgDefaults);
      setProfitGoal((data.profit_goal_percentage ?? 40).toString());
      setOrgBaseQuota((data.default_base_annual_quota ?? 500000).toString());
      setOrgEscalation((data.default_quota_escalation_percentage ?? 5).toString());
      setOrgRollingYears((data.default_quota_rolling_average_years ?? 3).toString());
    }
  }

  async function loadSalesReps() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, sales_rep_start_date, quota_mode, custom_base_quota, custom_escalation_percentage, current_annual_quota, quota_last_calculated_at')
      .in('role', ['sales', 'admin', 'manager', 'sales_manager'])
      .eq('is_active', true)
      .order('full_name');

    if (error) {
      console.error(error);
      return;
    }

    const reps = (data || []) as SalesRep[];
    setSalesReps(reps);

    const initialEdits: Record<string, RepEdit> = {};
    reps.forEach(rep => {
      initialEdits[rep.id] = {
        start_date: rep.sales_rep_start_date
          ? new Date(rep.sales_rep_start_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        quota_mode: rep.quota_mode || 'base_plus_escalation',
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
    if (error) {
      console.error('calc quota error', error);
      return;
    }
    if (data && !('error' in data)) {
      setQuotas(prev => ({ ...prev, [userId]: data as QuotaResult }));
    }
  }

  async function saveOrgDefaults() {
    if (!org) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          profit_goal_percentage: parseFloat(profitGoal) || 40,
          default_base_annual_quota: parseFloat(orgBaseQuota) || 500000,
          default_quota_escalation_percentage: parseFloat(orgEscalation) || 5,
          default_quota_rolling_average_years: Math.max(1, parseInt(orgRollingYears) || 3),
        })
        .eq('id', org.id);
      if (error) throw error;
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
      await loadOrg();
      await supabase.rpc('recalculate_all_sales_quotas');
      await loadSalesReps();
    } catch (e) {
      console.error(e);
      alert('Failed to save org defaults.');
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

  function handleEditChange(repId: string, field: keyof RepEdit, value: string) {
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
        sales_rep_start_date: edit.start_date,
        quota_mode: edit.quota_mode,
        custom_base_quota: edit.quota_mode === 'custom_plus_escalation' && edit.custom_base_quota !== ''
          ? parseFloat(edit.custom_base_quota)
          : null,
        custom_escalation_percentage: edit.custom_escalation_percentage !== ''
          ? parseFloat(edit.custom_escalation_percentage)
          : null,
      };

      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', repId);
      if (error) throw error;

      await supabase.rpc('recalculate_sales_quota_for_user', { p_user_id: repId });
      await loadQuotaPreview(repId);
      await loadSalesReps();

      setSuccessIds(prev => new Set(prev).add(repId));
      setTimeout(() => {
        setSuccessIds(prev => { const s = new Set(prev); s.delete(repId); return s; });
      }, 3000);
    } catch (e) {
      console.error(e);
      setErrorMessages(prev => ({ ...prev, [repId]: 'Failed to save. Please try again.' }));
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(repId); return s; });
    }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  function ruleLabel(rule: string): string {
    if (rule === 'base') return 'Base (Year 1)';
    if (rule.startsWith('escalation_') && rule.endsWith('_fallback')) return 'Escalation (no history)';
    if (rule.startsWith('escalation_')) return 'Escalation';
    if (rule.startsWith('rolling_')) return 'Rolling Avg';
    return rule;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading sales targets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">Sales Target Management</h2>
              <p className="text-blue-100 text-sm">Anniversary-year quotas with configurable base and escalation</p>
            </div>
          </div>
          <button
            onClick={recalcAll}
            disabled={recalcingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${recalcingAll ? 'animate-spin' : ''}`} />
            Recalculate All
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">How the quota is calculated:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Year 1</strong> uses the base quota (org default or the rep's custom base).</li>
              <li><strong>Years 2 &amp; 3</strong> escalate the prior year's quota by the configured percentage.</li>
              <li><strong>Year 4+</strong> uses the greater of escalation or the trailing 3-year revenue average (falls back to escalation when history is missing).</li>
              <li>All years are measured from the rep's <strong>start date</strong> (anniversary, not calendar).</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Organization Defaults</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profit Margin Goal (%)</label>
            <input
              type="number" min="0" max="100" step="1"
              value={profitGoal}
              onChange={(e) => { setProfitGoal(e.target.value); setOrgSaved(false); }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Annual Quota ($)</label>
            <input
              type="number" min="0" step="1000"
              value={orgBaseQuota}
              onChange={(e) => { setOrgBaseQuota(e.target.value); setOrgSaved(false); }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Escalation (% / yr)</label>
            <input
              type="number" min="0" max="100" step="0.1"
              value={orgEscalation}
              onChange={(e) => { setOrgEscalation(e.target.value); setOrgSaved(false); }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rolling Avg Window (yrs)</label>
            <input
              type="number" min="1" max="10" step="1"
              value={orgRollingYears}
              onChange={(e) => { setOrgRollingYears(e.target.value); setOrgSaved(false); }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
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
              : <><Save className="w-4 h-4" /> Save Defaults</>}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {salesReps.map(rep => {
          const edit = edits[rep.id];
          if (!edit) return null;
          const quota = quotas[rep.id];
          const isSaving = savingIds.has(rep.id);
          const isSuccess = successIds.has(rep.id);
          const errorMessage = errorMessages[rep.id];

          const orgBase = parseFloat(orgBaseQuota) || 500000;
          const orgEsc = parseFloat(orgEscalation) || 5;
          const effectiveBase = edit.quota_mode === 'custom_plus_escalation' && edit.custom_base_quota !== ''
            ? parseFloat(edit.custom_base_quota)
            : orgBase;
          const effectiveEsc = edit.custom_escalation_percentage !== ''
            ? parseFloat(edit.custom_escalation_percentage)
            : orgEsc;

          return (
            <div key={rep.id} className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{rep.full_name}</h3>
                  <p className="text-sm text-gray-600">{rep.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                      {rep.role.charAt(0).toUpperCase() + rep.role.slice(1)}
                    </span>
                    {rep.quota_last_calculated_at && (
                      <span className="text-xs text-gray-400">
                        Last calc: {new Date(rep.quota_last_calculated_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => saveRep(rep.id)}
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      Start Date (Anniversary)
                    </div>
                  </label>
                  <input
                    type="date"
                    value={edit.start_date}
                    onChange={(e) => handleEditChange(rep.id, 'start_date', e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-gray-500" />
                      Quota Mode
                    </div>
                  </label>
                  <select
                    value={edit.quota_mode}
                    onChange={(e) => handleEditChange(rep.id, 'quota_mode', e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="base_plus_escalation">Base + Escalation</option>
                    <option value="custom_plus_escalation">Custom + Escalation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      {edit.quota_mode === 'custom_plus_escalation' ? 'Custom Base Quota' : 'Org Base Quota (read-only)'}
                    </div>
                  </label>
                  {edit.quota_mode === 'custom_plus_escalation' ? (
                    <input
                      type="number" min="0" step="1000"
                      value={edit.custom_base_quota}
                      onChange={(e) => handleEditChange(rep.id, 'custom_base_quota', e.target.value)}
                      placeholder={orgBase.toString()}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <div className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-gray-700 font-semibold">
                      {formatCurrency(orgBase)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Percent className="w-4 h-4 text-gray-500" />
                      Escalation Override (%)
                    </div>
                  </label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={edit.custom_escalation_percentage}
                    onChange={(e) => handleEditChange(rep.id, 'custom_escalation_percentage', e.target.value)}
                    placeholder={`Org default: ${orgEsc}%`}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t-2 border-gray-100">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <p className="text-xs font-medium text-gray-600 mb-1">CURRENT ANNUAL QUOTA</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {quota ? formatCurrency(quota.current_annual_quota) : formatCurrency(rep.current_annual_quota || 0)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {quota ? `Year ${quota.current_year_number} of tenure` : 'Save to recalculate'}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                  <p className="text-xs font-medium text-gray-600 mb-1">MONTHLY QUOTA</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {quota ? formatCurrency(quota.current_monthly_quota) : formatCurrency((rep.current_annual_quota || 0) / 12)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Annual / 12</p>
                </div>

                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs font-medium text-gray-600 mb-1">EFFECTIVE SETTINGS</p>
                  <p className="text-sm font-semibold text-slate-700">Base: {formatCurrency(effectiveBase)}</p>
                  <p className="text-sm font-semibold text-slate-700">Escalation: {effectiveEsc}%</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Mode: {edit.quota_mode === 'custom_plus_escalation' ? 'Custom' : 'Base'} + Escalation
                  </p>
                </div>
              </div>

              {quota && quota.breakdown && quota.breakdown.length > 0 && (
                <div className="mt-6 pt-6 border-t-2 border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-gray-600" />
                    <h4 className="text-sm font-bold text-gray-900">Year-by-Year Breakdown</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 text-left text-xs uppercase text-gray-500">
                          <th className="py-2 pr-4">Year</th>
                          <th className="py-2 pr-4">Window</th>
                          <th className="py-2 pr-4">Quota</th>
                          <th className="py-2 pr-4">Actual Revenue</th>
                          <th className="py-2 pr-4">Rule Applied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quota.breakdown.map((row) => {
                          const isCurrent = row.year_number === quota.current_year_number;
                          return (
                            <tr key={row.year_number} className={`border-b border-gray-100 ${isCurrent ? 'bg-blue-50 font-semibold' : ''}`}>
                              <td className="py-2 pr-4">Yr {row.year_number}</td>
                              <td className="py-2 pr-4 text-gray-600">
                                {new Date(row.window_start).toLocaleDateString()} - {new Date(row.window_end).toLocaleDateString()}
                              </td>
                              <td className="py-2 pr-4 text-blue-700">{formatCurrency(row.quota)}</td>
                              <td className="py-2 pr-4 text-gray-700">
                                {row.actual_revenue > 0 ? formatCurrency(row.actual_revenue) : '-'}
                              </td>
                              <td className="py-2 pr-4">
                                <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                                  {ruleLabel(row.rule)}
                                </span>
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
