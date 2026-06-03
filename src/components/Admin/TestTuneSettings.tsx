import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Award,
  Save,
  DollarSign,
  Percent,
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  Calendar,
  History,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Shield,
  TrendingUp,
  Info,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface TestTuneSettings {
  id: string;
  pm_allocation_percentage: number;
  tier_1_min_hours: number;
  tier_1_max_hours: number;
  tier_1_percentage: number;
  tier_2_min_hours: number;
  tier_2_max_hours: number;
  tier_2_percentage: number;
  tier_3_min_hours: number;
  tier_3_percentage: number;
  default_labor_burden_rate: number;
  tech_bonus_percentage: number;
  pm_bonus_percentage: number;
  test_tune_period_days: number;
  auto_evaluate_enabled: boolean;
  notification_roles: string[];
  min_effective_labor_rate: number;
  max_bonus_pool_per_project: number | null;
  max_monthly_bonus_payout: number | null;
  min_project_size_for_bonus: number | null;
}

interface SettingsHistoryRow {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  changed_at: string;
  effective_date: string | null;
  reason: string | null;
  changed_by_name?: string;
}

interface CustomTier {
  min_hours: number;
  max_hours: number | null;
  min_pct: number;
  max_pct: number | null;
  percentage: number;
}

type TierMode = 'flat_hours' | 'pct_of_estimated';

function HistoryTable({ fieldName, refresh }: { fieldName: string; refresh: number }) {
  const [rows, setRows] = useState<SettingsHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [fieldName, refresh]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('test_tune_settings_history')
      .select('*, changed_by_profile:profiles!changed_by(full_name)')
      .eq('field_name', fieldName)
      .order('changed_at', { ascending: false })
      .limit(10);

    setRows(
      (data || []).map((r: any) => ({
        ...r,
        changed_by_name: r.changed_by_profile?.full_name || 'System'
      }))
    );
    setLoading(false);
  }

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Loading history...</div>;
  }

  if (rows.length === 0) {
    return <div className="text-xs text-gray-500 py-2">No history recorded yet.</div>;
  }

  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">Date</th>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">Old Value</th>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">New Value</th>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">Effective</th>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">Changed By</th>
            <th className="px-3 py-2 text-left text-gray-600 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-2 text-gray-700">{new Date(r.changed_at).toLocaleDateString()}</td>
              <td className="px-3 py-2 text-gray-500">{r.old_value ?? '—'}</td>
              <td className="px-3 py-2 text-gray-900 font-medium">{r.new_value}</td>
              <td className="px-3 py-2 text-gray-700">{r.effective_date ? new Date(r.effective_date).toLocaleDateString() : '—'}</td>
              <td className="px-3 py-2 text-gray-700">{r.changed_by_name}</td>
              <td className="px-3 py-2 text-gray-600">{r.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryToggle({ label, fieldName, refresh }: { label: string; fieldName: string; refresh: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <History className="w-3.5 h-3.5" />
        {open ? 'Hide' : 'View'} {label} History
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && <HistoryTable fieldName={fieldName} refresh={refresh} />}
    </div>
  );
}

export function TestTuneSettings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<TestTuneSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<TestTuneSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Effective dates and reasons per section
  const [burdenEffectiveDate, setBurdenEffectiveDate] = useState('');
  const [burdenReason, setBurdenReason] = useState('');
  const [pmAllocEffectiveDate, setPmAllocEffectiveDate] = useState('');
  const [pmAllocReason, setPmAllocReason] = useState('');
  const [splitEffectiveDate, setSplitEffectiveDate] = useState('');
  const [splitReason, setSplitReason] = useState('');
  const [tierEffectiveDate, setTierEffectiveDate] = useState('');
  const [tierReason, setTierReason] = useState('');
  const [salesRateReason, setSalesRateReason] = useState('');

  // Custom tiers state (built from settings tier_1/2/3 fields)
  const [tiers, setTiers] = useState<CustomTier[]>([]);
  const [tierMode, setTierMode] = useState<TierMode>('flat_hours');

  // Caps toggles
  const [capProjectEnabled, setCapProjectEnabled] = useState(false);
  const [capMonthlyEnabled, setCapMonthlyEnabled] = useState(false);
  const [capMinSizeEnabled, setCapMinSizeEnabled] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('test_tune_settings')
        .select('*')
        .single();

      if (error) throw error;

      if (data) {
        const s: TestTuneSettings = {
          id: data.id,
          pm_allocation_percentage: data.pm_allocation_percentage ?? 5,
          tier_1_min_hours: data.tier_1_min_hours ?? 1,
          tier_1_max_hours: data.tier_1_max_hours ?? 5,
          tier_1_percentage: data.tier_1_percentage ?? 20,
          tier_2_min_hours: data.tier_2_min_hours ?? 6,
          tier_2_max_hours: data.tier_2_max_hours ?? 10,
          tier_2_percentage: data.tier_2_percentage ?? 30,
          tier_3_min_hours: data.tier_3_min_hours ?? 11,
          tier_3_percentage: data.tier_3_percentage ?? 35,
          default_labor_burden_rate: data.default_labor_burden_rate ?? 75,
          tech_bonus_percentage: data.tech_bonus_percentage ?? 65,
          pm_bonus_percentage: data.pm_bonus_percentage ?? 35,
          test_tune_period_days: data.test_tune_period_days ?? 90,
          auto_evaluate_enabled: data.auto_evaluate_enabled ?? true,
          notification_roles: data.notification_roles ?? [],
          min_effective_labor_rate: data.min_effective_labor_rate ?? 100,
          max_bonus_pool_per_project: data.max_bonus_pool_per_project ?? null,
          max_monthly_bonus_payout: data.max_monthly_bonus_payout ?? null,
          min_project_size_for_bonus: data.min_project_size_for_bonus ?? null,
        };
        setSettings(s);
        setOriginalSettings(JSON.parse(JSON.stringify(s)));
        // Read tier mode
        const mode: TierMode = (data as any).bonus_tier_type === 'pct_of_estimated' ? 'pct_of_estimated' : 'flat_hours';
        setTierMode(mode);

        // Prefer bonus_tiers_jsonb (supports unlimited tiers) if present; fall back to 3-tier columns
        const rawTiers = (data as any).bonus_tiers_jsonb;
        if (Array.isArray(rawTiers) && rawTiers.length > 0) {
          setTiers(rawTiers.map((t: any) => ({
            min_hours: Number(t.min_hours) || 0,
            max_hours: t.max_hours != null ? Number(t.max_hours) : null,
            min_pct: Number(t.min_pct) || 0,
            max_pct: t.max_pct != null ? Number(t.max_pct) : null,
            percentage: Number(t.percentage) || 0,
          })));
        } else {
          setTiers([
            { min_hours: s.tier_1_min_hours, max_hours: s.tier_1_max_hours, min_pct: 5, max_pct: 10, percentage: s.tier_1_percentage },
            { min_hours: s.tier_2_min_hours, max_hours: s.tier_2_max_hours, min_pct: 10, max_pct: 20, percentage: s.tier_2_percentage },
            { min_hours: s.tier_3_min_hours, max_hours: null, min_pct: 20, max_pct: null, percentage: s.tier_3_percentage },
          ]);
        }
        setCapProjectEnabled(s.max_bonus_pool_per_project != null);
        setCapMonthlyEnabled(s.max_monthly_bonus_payout != null);
        setCapMinSizeEnabled(s.min_project_size_for_bonus != null);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function writeHistory(fieldName: string, oldValue: string | null, newValue: string, effectiveDate: string, reason: string) {
    try {
      await supabase.from('test_tune_settings_history').insert({
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        changed_by: profile?.id,
        effective_date: effectiveDate || null,
        reason: reason || null
      });
    } catch (err) {
      console.error('Failed to write settings history:', err);
    }
  }

  async function handleSave() {
    if (!settings || !originalSettings) return;

    setSaving(true);
    setSaved(false);

    try {
      // Always write all tiers to bonus_tiers_jsonb (supports unlimited tiers)
      // Also mirror first 3 tiers to legacy columns for backward compat
      const t1 = tiers[0] ?? { min_hours: 1, max_hours: 5, percentage: 20 };
      const t2 = tiers[1] ?? { min_hours: 6, max_hours: 10, percentage: 30 };
      const t3 = tiers[2] ?? { min_hours: 11, max_hours: null, percentage: 35 };

      const updatedSettings = {
        ...settings,
        tier_1_min_hours: t1.min_hours,
        tier_1_max_hours: t1.max_hours ?? 5,
        tier_1_percentage: t1.percentage,
        tier_2_min_hours: t2.min_hours,
        tier_2_max_hours: t2.max_hours ?? 10,
        tier_2_percentage: t2.percentage,
        tier_3_min_hours: t3.min_hours,
        tier_3_percentage: t3.percentage,
        on_target_bonus_amount: 0,
        max_bonus_pool_per_project: capProjectEnabled ? settings.max_bonus_pool_per_project : null,
        max_monthly_bonus_payout: capMonthlyEnabled ? settings.max_monthly_bonus_payout : null,
        min_project_size_for_bonus: capMinSizeEnabled ? settings.min_project_size_for_bonus : null,
      };

      const { error } = await supabase
        .from('test_tune_settings')
        .update({
          pm_allocation_percentage: updatedSettings.pm_allocation_percentage,
          tier_1_min_hours: updatedSettings.tier_1_min_hours,
          tier_1_max_hours: updatedSettings.tier_1_max_hours,
          tier_1_percentage: updatedSettings.tier_1_percentage,
          tier_2_min_hours: updatedSettings.tier_2_min_hours,
          tier_2_max_hours: updatedSettings.tier_2_max_hours,
          tier_2_percentage: updatedSettings.tier_2_percentage,
          tier_3_min_hours: updatedSettings.tier_3_min_hours,
          tier_3_percentage: updatedSettings.tier_3_percentage,
          bonus_tiers_jsonb: tiers,
          bonus_tier_type: tierMode,
          default_labor_burden_rate: updatedSettings.default_labor_burden_rate,
          tech_bonus_percentage: updatedSettings.tech_bonus_percentage,
          pm_bonus_percentage: updatedSettings.pm_bonus_percentage,
          test_tune_period_days: updatedSettings.test_tune_period_days,
          auto_evaluate_enabled: updatedSettings.auto_evaluate_enabled,
          notification_roles: updatedSettings.notification_roles,
          on_target_bonus_amount: 0,
          min_effective_labor_rate: updatedSettings.min_effective_labor_rate,
          max_bonus_pool_per_project: updatedSettings.max_bonus_pool_per_project,
          max_monthly_bonus_payout: updatedSettings.max_monthly_bonus_payout,
          min_project_size_for_bonus: updatedSettings.min_project_size_for_bonus,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (error) throw error;

      // Write history for changed fields
      const o = originalSettings;

      if (updatedSettings.default_labor_burden_rate !== o.default_labor_burden_rate) {
        await writeHistory('default_labor_burden_rate', String(o.default_labor_burden_rate), String(updatedSettings.default_labor_burden_rate), burdenEffectiveDate, burdenReason);
      }
      if (updatedSettings.pm_allocation_percentage !== o.pm_allocation_percentage) {
        await writeHistory('pm_allocation_percentage', String(o.pm_allocation_percentage), String(updatedSettings.pm_allocation_percentage), pmAllocEffectiveDate, pmAllocReason);
      }
      if (updatedSettings.tech_bonus_percentage !== o.tech_bonus_percentage || updatedSettings.pm_bonus_percentage !== o.pm_bonus_percentage) {
        await writeHistory('bonus_split', `${o.tech_bonus_percentage}/${o.pm_bonus_percentage}`, `${updatedSettings.tech_bonus_percentage}/${updatedSettings.pm_bonus_percentage}`, splitEffectiveDate, splitReason);
      }
      if (
        updatedSettings.tier_1_min_hours !== o.tier_1_min_hours || updatedSettings.tier_1_percentage !== o.tier_1_percentage ||
        updatedSettings.tier_2_min_hours !== o.tier_2_min_hours || updatedSettings.tier_2_percentage !== o.tier_2_percentage ||
        updatedSettings.tier_3_min_hours !== o.tier_3_min_hours || updatedSettings.tier_3_percentage !== o.tier_3_percentage
      ) {
        await writeHistory('bonus_tiers', 'previous tier structure', JSON.stringify(tiers), tierEffectiveDate, tierReason);
      }
      if (updatedSettings.min_effective_labor_rate !== o.min_effective_labor_rate) {
        await writeHistory('min_effective_labor_rate', String(o.min_effective_labor_rate), String(updatedSettings.min_effective_labor_rate), '', salesRateReason);
      }

      setOriginalSettings(JSON.parse(JSON.stringify(updatedSettings)));
      setHistoryRefresh(h => h + 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      // Reset reason fields
      setBurdenReason('');
      setPmAllocReason('');
      setSplitReason('');
      setTierReason('');
      setSalesRateReason('');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function updateSettings(updates: Partial<TestTuneSettings>) {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  }

  function updateTier(index: number, updates: Partial<CustomTier>) {
    setTiers(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
  }

  function addTier() {
    const lastTier = tiers[tiers.length - 1];
    const newMinHours = lastTier ? (lastTier.max_hours ?? lastTier.min_hours) + 1 : 1;
    const newMinPct = lastTier ? (lastTier.max_pct ?? lastTier.min_pct) + 5 : 5;
    setTiers(prev => [
      ...prev.slice(0, -1).map(t => t),
      { ...prev[prev.length - 1], max_hours: newMinHours - 1, max_pct: newMinPct - 1 },
      { min_hours: newMinHours, max_hours: null, min_pct: newMinPct, max_pct: null, percentage: 40 }
    ]);
  }

  function removeTier(index: number) {
    if (tiers.length <= 1) return;
    setTiers(prev => {
      const next = prev.filter((_, i) => i !== index);
      // Make last tier open-ended
      next[next.length - 1] = { ...next[next.length - 1], max_hours: null };
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Settings not found. Please contact support.</p>
      </div>
    );
  }

  const totalPercentage = settings.tech_bonus_percentage + settings.pm_bonus_percentage;
  const percentageValid = Math.abs(totalPercentage - 100) < 0.01;

  const tierColors = [
    { bg: 'bg-green-50', border: 'border-green-200', ring: 'focus:ring-green-500', label: 'text-green-900' },
    { bg: 'bg-blue-50', border: 'border-blue-200', ring: 'focus:ring-blue-500', label: 'text-blue-900' },
    { bg: 'bg-amber-50', border: 'border-amber-200', ring: 'focus:ring-amber-500', label: 'text-amber-900' },
    { bg: 'bg-rose-50', border: 'border-rose-200', ring: 'focus:ring-rose-500', label: 'text-rose-900' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-white">Test & Tune Performance Settings</h2>
            <p className="text-sm text-gray-300">Configure bonus tiers, calculation parameters, and eligibility rules</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !percentageValid}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>

      {/* Bonus Rule Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <strong>90-Day Test & Tune Bonus Rule:</strong>
            <ul className="mt-2 space-y-1 ml-4 list-disc">
              <li>Bonus is <strong>only paid</strong> when Field Labor is strictly below Field Target</li>
              <li>Field Target = Total Estimated Labor &times; 95%</li>
              <li>Bonus Pool = (Field Target &minus; Field Labor Used) &times; Labor Burden Rate &times; Tier %</li>
              <li><strong>No bonus</strong> is paid when on target (0 hours saved) or over target</li>
              <li>Labor Burden Rate is cost-based, never the revenue/sales rate</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 1: PM Allocation */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">PM Allocation</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Percentage of total estimated labor hours allocated to the Project Manager for non-performance tracking. Default: 5%.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PM Allocation %</label>
            <div className="relative">
              <input
                type="number"
                value={settings.pm_allocation_percentage}
                onChange={(e) => updateSettings({ pm_allocation_percentage: parseFloat(e.target.value) || 0 })}
                step="0.5"
                min="0"
                max="50"
                className="w-full pr-8 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Effective Date (optional)</label>
            <input
              type="date"
              value={pmAllocEffectiveDate}
              onChange={(e) => setPmAllocEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Change (optional)</label>
          <input
            type="text"
            value={pmAllocReason}
            onChange={(e) => setPmAllocReason(e.target.value)}
            placeholder="e.g., Updated per Q2 review..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <HistoryToggle label="PM Allocation" fieldName="pm_allocation_percentage" refresh={historyRefresh} />
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: Labor Burden Rate */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Labor Burden Rate</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Cost-based rate per labor hour used to calculate savings value for bonus calculation. <strong>Never use revenue rate.</strong> Default: $75/hr.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rate per Hour</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={settings.default_labor_burden_rate}
                onChange={(e) => updateSettings({ default_labor_burden_rate: parseFloat(e.target.value) || 0 })}
                step="5"
                min="0"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Effective Date (optional)</label>
            <input
              type="date"
              value={burdenEffectiveDate}
              onChange={(e) => setBurdenEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Change (optional)</label>
          <input
            type="text"
            value={burdenReason}
            onChange={(e) => setBurdenReason(e.target.value)}
            placeholder="e.g., Annual cost review adjustment..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <HistoryToggle label="Labor Burden Rate" fieldName="default_labor_burden_rate" refresh={historyRefresh} />
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: Bonus Split */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Bonus Split Configuration</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Configure how bonuses are split between Lead Technician and Project Manager. Must total 100%.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead Tech Percentage</label>
            <div className="relative">
              <input
                type="number"
                value={settings.tech_bonus_percentage}
                onChange={(e) => updateSettings({ tech_bonus_percentage: parseFloat(e.target.value) || 0 })}
                step="5"
                min="0"
                max="100"
                className="w-full pr-8 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PM Percentage</label>
            <div className="relative">
              <input
                type="number"
                value={settings.pm_bonus_percentage}
                onChange={(e) => updateSettings({ pm_bonus_percentage: parseFloat(e.target.value) || 0 })}
                step="5"
                min="0"
                max="100"
                className="w-full pr-8 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
            </div>
          </div>
        </div>

        {!percentageValid && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              Total must equal 100%. Current total: {totalPercentage}%
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Effective Date (optional)</label>
            <input
              type="date"
              value={splitEffectiveDate}
              onChange={(e) => setSplitEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Change (optional)</label>
            <input
              type="text"
              value={splitReason}
              onChange={(e) => setSplitReason(e.target.value)}
              placeholder="e.g., Updated per management review..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <HistoryToggle label="Bonus Split" fieldName="bonus_split" refresh={historyRefresh} />
      </div>

      {/* ============================================================ */}
      {/* SECTION 4: Performance Bonus Tiers */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Performance Bonus Tiers</h3>
          </div>
          <button
            onClick={addTier}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Tier
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Bonus percentages applied to labor savings when Field Labor is below the 95% target. The last tier has no maximum (open-ended). A minimum of 1 tier is required.
        </p>

        {/* Tier Mode Toggle */}
        <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-900">Tier Threshold Method</span>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Choose how tier thresholds are measured. <strong>Percentage of estimated hours</strong> scales fairly across job sizes — a small job and a large job are evaluated proportionally.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTierMode('flat_hours')}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                tierMode === 'flat_hours'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                tierMode === 'flat_hours' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              }`}>
                {tierMode === 'flat_hours' && <div className="w-full h-full rounded-full bg-white scale-[0.4] transform" />}
              </div>
              <div>
                <p className={`text-sm font-medium ${tierMode === 'flat_hours' ? 'text-blue-900' : 'text-gray-900'}`}>
                  Flat Hours Saved
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Thresholds are a fixed number of hours (e.g., save 5+ hours = Tier 1). Does not adjust for job size.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTierMode('pct_of_estimated')}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                tierMode === 'pct_of_estimated'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                tierMode === 'pct_of_estimated' ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {tierMode === 'pct_of_estimated' && <div className="w-full h-full rounded-full bg-white scale-[0.4] transform" />}
              </div>
              <div>
                <p className={`text-sm font-medium ${tierMode === 'pct_of_estimated' ? 'text-green-900' : 'text-gray-900'}`}>
                  % of Estimated Hours
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Thresholds are a percentage of estimated labor (e.g., save 10%+ = Tier 1). Scales with job size.
                </p>
              </div>
            </button>
          </div>
          {tierMode === 'pct_of_estimated' && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Info className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">
                <strong>Example:</strong> A job with 100 estimated hours and a 10% min threshold requires saving at least 10 hours to qualify. A 40-hour job would only need to save 4 hours for the same tier — proportionally equal effort.
              </p>
            </div>
          )}
          {tierMode === 'flat_hours' && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                <strong>Example:</strong> A 5-hour minimum threshold applies equally to all jobs regardless of size. A 10-hour job saving 5 hours hits the same tier as a 200-hour job saving 5 hours.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {tiers.map((tier, index) => {
            const isLast = index === tiers.length - 1;
            const colors = tierColors[index % tierColors.length];
            const isPct = tierMode === 'pct_of_estimated';
            return (
              <div key={index} className={`p-4 ${colors.bg} border ${colors.border} rounded-lg`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`font-medium ${colors.label}`}>
                    Tier {index + 1}
                    {isLast && <span className="ml-2 text-xs font-normal text-gray-500">(open-ended — no max)</span>}
                  </h4>
                  {tiers.length > 1 && (
                    <button
                      onClick={() => removeTier(index)}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <div className={`grid ${isLast ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
                  {isPct ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Min % of Est. Hours
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={tier.min_pct}
                            onChange={(e) => updateTier(index, { min_pct: parseFloat(e.target.value) || 0 })}
                            step="1"
                            min="0"
                            max="100"
                            className="w-full pr-8 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                        </div>
                      </div>
                      {!isLast && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Max % of Est. Hours
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              value={tier.max_pct ?? ''}
                              onChange={(e) => updateTier(index, { max_pct: e.target.value ? parseFloat(e.target.value) : null })}
                              step="1"
                              min="0"
                              max="100"
                              className="w-full pr-8 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Min Hours Saved</label>
                        <input
                          type="number"
                          value={tier.min_hours}
                          onChange={(e) => updateTier(index, { min_hours: parseFloat(e.target.value) || 0 })}
                          step="0.5"
                          min="0"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      {!isLast && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Max Hours Saved</label>
                          <input
                            type="number"
                            value={tier.max_hours ?? ''}
                            onChange={(e) => updateTier(index, { max_hours: e.target.value ? parseFloat(e.target.value) : null })}
                            step="0.5"
                            min="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Bonus %</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={tier.percentage}
                        onChange={(e) => updateTier(index, { percentage: parseFloat(e.target.value) || 0 })}
                        step="1"
                        min="0"
                        max="100"
                        className="w-full pr-8 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                    </div>
                  </div>
                </div>
                {isLast && (
                  <p className="text-xs text-gray-500 mt-2">
                    {isPct
                      ? 'Applies to all savings above minimum percentage — no upper limit.'
                      : 'Applies to all savings above minimum — no upper limit.'}
                  </p>
                )}
                {!isLast && isPct && (
                  <p className="text-xs text-gray-500 mt-2">
                    Applies when hours saved fall between {tier.min_pct}% and {tier.max_pct ?? '—'}% of estimated labor.
                  </p>
                )}
                {!isLast && !isPct && (
                  <p className="text-xs text-gray-500 mt-2">
                    Applies when {tier.min_hours}–{tier.max_hours ?? '—'} hours are saved below target.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Effective Date (optional)</label>
            <input
              type="date"
              value={tierEffectiveDate}
              onChange={(e) => setTierEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Change (optional)</label>
            <input
              type="text"
              value={tierReason}
              onChange={(e) => setTierReason(e.target.value)}
              placeholder="e.g., Updated tier thresholds per annual review..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <HistoryToggle label="Bonus Tier" fieldName="bonus_tiers" refresh={historyRefresh} />
      </div>

      {/* ============================================================ */}
      {/* SECTION 5: Sales Effective Labor Rate Threshold */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">Sales Effective Labor Rate Threshold</h3>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-orange-900">
              <strong>Sales Discipline Rule:</strong> If Effective Labor Rate (Total Labor Revenue &divide; Estimated Hours) falls below this threshold, the Sales Rep is <strong>ineligible for their sales bonus/accelerator</strong> on that job. This rule does <strong>not</strong> affect the Lead Tech or PM performance bonus.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Effective Labor Rate</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={settings.min_effective_labor_rate}
                onChange={(e) => updateSettings({ min_effective_labor_rate: parseFloat(e.target.value) || 0 })}
                step="5"
                min="0"
                className="w-full pl-8 pr-16 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">/hr</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Default: $100/hr</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Change (optional)</label>
            <input
              type="text"
              value={salesRateReason}
              onChange={(e) => setSalesRateReason(e.target.value)}
              placeholder="e.g., Aligned with pricing policy update..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
          <strong>Example:</strong> If a job has $12,000 in labor revenue and 150 estimated hours, the effective rate is $80/hr. With a threshold of $100/hr, the sales rep would be marked ineligible for their sales bonus on that job. The Lead Tech and PM bonus proceeds normally.
        </div>

        <HistoryToggle label="Sales Rate Threshold" fieldName="min_effective_labor_rate" refresh={historyRefresh} />
      </div>

      {/* ============================================================ */}
      {/* SECTION 6: Optional Bonus Caps */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Optional Bonus Caps</h3>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          All caps are optional. Leave disabled for no cap. When enabled, caps apply prospectively to new evaluations.
        </p>

        <div className="space-y-4">
          {/* Cap 1: Max per project */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setCapProjectEnabled(!capProjectEnabled)}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {capProjectEnabled
                    ? <ToggleRight className="w-6 h-6 text-blue-600" />
                    : <ToggleLeft className="w-6 h-6" />}
                </button>
                <label className="text-sm font-medium text-gray-900">Maximum Bonus Pool per Project</label>
              </div>
              {capProjectEnabled && (
                <div className="relative max-w-xs ml-9">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.max_bonus_pool_per_project ?? ''}
                    onChange={(e) => updateSettings({ max_bonus_pool_per_project: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="e.g. 2000"
                    step="100"
                    min="0"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cap 2: Max monthly payout */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setCapMonthlyEnabled(!capMonthlyEnabled)}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {capMonthlyEnabled
                    ? <ToggleRight className="w-6 h-6 text-blue-600" />
                    : <ToggleLeft className="w-6 h-6" />}
                </button>
                <label className="text-sm font-medium text-gray-900">Maximum Total Monthly Bonus Payout</label>
              </div>
              {capMonthlyEnabled && (
                <div className="relative max-w-xs ml-9">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.max_monthly_bonus_payout ?? ''}
                    onChange={(e) => updateSettings({ max_monthly_bonus_payout: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="e.g. 5000"
                    step="100"
                    min="0"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cap 3: Min project size */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setCapMinSizeEnabled(!capMinSizeEnabled)}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {capMinSizeEnabled
                    ? <ToggleRight className="w-6 h-6 text-blue-600" />
                    : <ToggleLeft className="w-6 h-6" />}
                </button>
                <label className="text-sm font-medium text-gray-900">Minimum Project Size for Bonus Eligibility</label>
              </div>
              <p className="text-xs text-gray-500 ml-9 mb-2">Projects below this contract value will be ineligible for bonuses.</p>
              {capMinSizeEnabled && (
                <div className="relative max-w-xs ml-9">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.min_project_size_for_bonus ?? ''}
                    onChange={(e) => updateSettings({ min_project_size_for_bonus: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="e.g. 5000"
                    step="500"
                    min="0"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 7: Program Settings */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Program Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Test & Tune Period (Days)
            </label>
            <input
              type="number"
              value={settings.test_tune_period_days}
              onChange={(e) => updateSettings({ test_tune_period_days: parseInt(e.target.value) || 90 })}
              step="1"
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Default: 90 days</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="auto-evaluate"
              checked={settings.auto_evaluate_enabled}
              onChange={(e) => updateSettings({ auto_evaluate_enabled: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="auto-evaluate" className="text-sm font-medium text-gray-700">
              Enable Automatic Day 90 Evaluation
            </label>
          </div>
          <p className="text-xs text-gray-600 ml-7">
            When enabled, bonuses will be automatically calculated on Day 90 and queued for approval.
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 8: Full Settings Change History */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <button
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          id="full-history-toggle"
          aria-expanded="false"
          onClick={(e) => {
            const section = document.getElementById('full-history-section');
            const btn = e.currentTarget;
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            if (section) section.style.display = expanded ? 'none' : 'block';
          }}
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Full Settings Change History</h3>
          </div>
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </button>
        <div id="full-history-section" style={{ display: 'none' }} className="px-6 pb-6 border-t border-gray-200 pt-4">
          <AllHistoryTable refresh={historyRefresh} />
        </div>
      </div>
    </div>
  );
}

function AllHistoryTable({ refresh }: { refresh: number }) {
  const [rows, setRows] = useState<SettingsHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    load();
  }, [refresh, page]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('test_tune_settings_history')
      .select('*, changed_by_profile:profiles!changed_by(full_name)')
      .order('changed_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setRows(
      (data || []).map((r: any) => ({
        ...r,
        changed_by_name: r.changed_by_profile?.full_name || 'System'
      }))
    );
    setLoading(false);
  }

  if (loading) return <div className="text-sm text-gray-500 py-4">Loading...</div>;
  if (rows.length === 0 && page === 0) return <div className="text-sm text-gray-500 py-4">No history recorded yet.</div>;

  const fieldLabels: Record<string, string> = {
    default_labor_burden_rate: 'Labor Burden Rate',
    pm_allocation_percentage: 'PM Allocation %',
    bonus_split: 'Bonus Split (Tech/PM)',
    bonus_tiers: 'Bonus Tier Structure',
    min_effective_labor_rate: 'Min Effective Labor Rate',
    max_bonus_pool_per_project: 'Max Bonus Pool/Project',
    max_monthly_bonus_payout: 'Max Monthly Bonus',
    min_project_size_for_bonus: 'Min Project Size',
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Date</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Setting</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Old Value</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">New Value</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Effective</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Changed By</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(r.changed_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-gray-900 font-medium">{fieldLabels[r.field_name] || r.field_name}</td>
                <td className="px-3 py-2 text-gray-500">{r.old_value ?? '—'}</td>
                <td className="px-3 py-2 text-gray-900">{r.new_value}</td>
                <td className="px-3 py-2 text-gray-700">{r.effective_date ? new Date(r.effective_date).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2 text-gray-700">{r.changed_by_name}</td>
                <td className="px-3 py-2 text-gray-600">{r.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={rows.length < PAGE_SIZE}
          className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
