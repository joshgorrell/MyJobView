import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  TrendingUp,
  User,
  Calendar,
  AlertCircle,
  CheckCircle,
  Play,
  Pause,
  Save,
  Shield,
  X,
  History,
  Info,
  DollarSign
} from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { UserSelector } from '../Shared/UserSelector';
import ConfirmModal from '../ui/ConfirmModal';

interface TestTuneStatusPanelProps {
  salesOrderId: string;
  salesOrderStatus?: string;
  initialLeadTechId?: string | null;
  onUpdate?: () => void;
}

interface TestTuneData {
  test_tune_status: string | null;
  test_tune_start_date: string | null;
  test_tune_end_date: string | null;
  lead_technician_id: string | null;
  lead_tech_name: string | null;
  estimated_labor_hours: number;
  field_hours_used: number;
  total_labor_revenue: number;
  global_min_effective_labor_rate: number;
  per_job_override: number | null;
  per_job_override_reason: string | null;
  labor_burden_rate: number;
  bonus_tiers: Array<{ min_hours?: number; max_hours?: number; min_pct?: number; max_pct?: number; percentage: number }>;
  bonus_tier_type: string;
  tech_bonus_percentage: number;
  pm_bonus_percentage: number;
}

interface ELROverrideLog {
  id: string;
  old_override: number | null;
  new_override: number | null;
  reason: string;
  changed_at: string;
  changer_name?: string;
}

export function TestTuneStatusPanel({
  salesOrderId,
  salesOrderStatus,
  initialLeadTechId,
  onUpdate
}: TestTuneStatusPanelProps) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<TestTuneData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

  const [showELROverride, setShowELROverride] = useState(false);
  const [elrOverrideValue, setElrOverrideValue] = useState('');
  const [elrOverrideReason, setElrOverrideReason] = useState('');
  const [savingELR, setSavingELR] = useState(false);
  const [elrLog, setElrLog] = useState<ELROverrideLog[]>([]);
  const [showELRLog, setShowELRLog] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const canEdit = profile?.role === 'admin' || profile?.role === 'finance' ||
    profile?.role === 'sales_manager' || profile?.role === 'production_manager';
  const canOverrideELR = profile?.role === 'admin' || profile?.role === 'finance' ||
    profile?.role === 'sales_manager';

  const isProjectComplete = salesOrderStatus === 'complete' || salesOrderStatus === 'completed' || salesOrderStatus === 'closed';

  useEffect(() => {
    loadTestTuneData();
  }, [salesOrderId]);

  async function loadTestTuneData() {
    try {
      setLoading(true);

      const [orderResult, settingsResult] = await Promise.all([
        supabase
          .from('sales_orders')
          .select(`
            test_tune_status,
            test_tune_start_date,
            test_tune_end_date,
            lead_technician_id,
            min_effective_labor_rate_override,
            min_effective_labor_rate_override_reason,
            lead_tech:profiles!sales_orders_lead_technician_id_fkey(full_name),
            proposal:proposals(
              line_items:proposal_line_items(labor_hours, unit_price, quantity)
            )
          `)
          .eq('id', salesOrderId)
          .maybeSingle(),
        supabase
          .from('test_tune_settings')
          .select('min_effective_labor_rate, default_labor_burden_rate, bonus_tiers_jsonb, bonus_tier_type, tech_bonus_percentage, pm_bonus_percentage')
          .maybeSingle()
      ]);

      if (orderResult.error) throw orderResult.error;

      const orderData = orderResult.data;
      const globalRate = settingsResult.data?.min_effective_labor_rate ?? 100;
      const burdenRate = settingsResult.data?.default_labor_burden_rate ?? 75;
      const bonusTiers = settingsResult.data?.bonus_tiers_jsonb ?? [];
      const bonusTierType = settingsResult.data?.bonus_tier_type ?? 'flat_hours';
      const techBonusPct = settingsResult.data?.tech_bonus_percentage ?? 65;
      const pmBonusPct = settingsResult.data?.pm_bonus_percentage ?? 35;

      if (orderData) {
        const lineItems = (orderData as any).proposal?.line_items || [];
        const estimatedHours = lineItems.reduce(
          (sum: number, item: any) => sum + (item.labor_hours || 0),
          0
        );
        const totalLaborRevenue = lineItems.reduce(
          (sum: number, item: any) => sum + ((item.unit_price || 0) * (item.quantity || 1)),
          0
        );

        const { data: workOrders } = await supabase
          .from('work_orders')
          .select('actual_hours')
          .eq('sales_order_id', salesOrderId)
          .eq('status', 'completed');

        const fieldHours = workOrders?.reduce((sum, wo) => sum + (wo.actual_hours || 0), 0) || 0;

        const override = (orderData as any).min_effective_labor_rate_override;
        const overrideReason = (orderData as any).min_effective_labor_rate_override_reason;

        setData({
          test_tune_status: orderData.test_tune_status,
          test_tune_start_date: orderData.test_tune_start_date,
          test_tune_end_date: orderData.test_tune_end_date,
          lead_technician_id: orderData.lead_technician_id,
          lead_tech_name: (orderData as any).lead_tech?.full_name || null,
          estimated_labor_hours: estimatedHours,
          field_hours_used: fieldHours,
          total_labor_revenue: totalLaborRevenue,
          global_min_effective_labor_rate: globalRate,
          per_job_override: override ?? null,
          per_job_override_reason: overrideReason ?? null,
          labor_burden_rate: burdenRate,
          bonus_tiers: bonusTiers,
          bonus_tier_type: bonusTierType,
          tech_bonus_percentage: techBonusPct,
          pm_bonus_percentage: pmBonusPct
        });

        setSelectedTechId(orderData.lead_technician_id);
        if (override != null) {
          setElrOverrideValue(String(override));
        }
      }
    } catch (error) {
      console.error('Error loading Test & Tune data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadELRLog() {
    try {
      const { data: rows } = await supabase
        .from('test_tune_elr_override_log')
        .select('*, changer:profiles!changed_by(full_name)')
        .eq('sales_order_id', salesOrderId)
        .order('changed_at', { ascending: false })
        .limit(20);

      setElrLog(
        (rows || []).map((r: any) => ({
          ...r,
          changer_name: r.changer?.full_name || 'Unknown'
        }))
      );
    } catch (err) {
      console.error('Error loading ELR log:', err);
    }
  }

  async function handleSaveELROverride() {
    if (!elrOverrideReason.trim()) {
      alert('A reason is required for the per-job threshold override.');
      return;
    }

    const overrideValue = elrOverrideValue === '' ? null : parseFloat(elrOverrideValue);
    if (elrOverrideValue !== '' && (isNaN(overrideValue as number) || (overrideValue as number) < 0)) {
      alert('Please enter a valid rate (or leave blank to clear the override).');
      return;
    }

    try {
      setSavingELR(true);

      const { error } = await supabase.rpc('set_job_elr_override', {
        p_sales_order_id: salesOrderId,
        p_override_rate: overrideValue,
        p_reason: elrOverrideReason.trim()
      });

      if (error) throw error;

      await loadTestTuneData();
      setElrOverrideReason('');
      setShowELROverride(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error saving ELR override:', error);
      alert('Failed to save threshold override.');
    } finally {
      setSavingELR(false);
    }
  }

  async function handleClearELROverride() {
    if (!elrOverrideReason.trim()) {
      alert('A reason is required even when clearing an override.');
      return;
    }

    try {
      setSavingELR(true);

      const { error } = await supabase.rpc('set_job_elr_override', {
        p_sales_order_id: salesOrderId,
        p_override_rate: null,
        p_reason: elrOverrideReason.trim()
      });

      if (error) throw error;

      await loadTestTuneData();
      setElrOverrideValue('');
      setElrOverrideReason('');
      setShowELROverride(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error clearing ELR override:', error);
      alert('Failed to clear threshold override.');
    } finally {
      setSavingELR(false);
    }
  }

  async function handleStartTestTune() {
    if (!selectedTechId) {
      alert('Please assign a Lead Technician before starting Test & Tune tracking.');
      return;
    }

    try {
      setSaving(true);

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 90);

      const { error } = await supabase
        .from('sales_orders')
        .update({
          test_tune_status: 'active',
          test_tune_start_date: startDate.toISOString(),
          test_tune_end_date: endDate.toISOString(),
          lead_technician_id: selectedTechId
        })
        .eq('id', salesOrderId);

      if (error) throw error;

      await loadTestTuneData();
      setEditMode(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error starting Test & Tune:', error);
      alert('Failed to start Test & Tune tracking.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePauseTestTune() {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('sales_orders')
        .update({ test_tune_status: 'paused' })
        .eq('id', salesOrderId);

      if (error) throw error;

      await loadTestTuneData();
      onUpdate?.();
    } catch (error) {
      console.error('Error pausing Test & Tune:', error);
      alert('Failed to pause Test & Tune tracking.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeTestTune() {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('sales_orders')
        .update({ test_tune_status: 'active' })
        .eq('id', salesOrderId);

      if (error) throw error;

      await loadTestTuneData();
      onUpdate?.();
    } catch (error) {
      console.error('Error resuming Test & Tune:', error);
      alert('Failed to resume Test & Tune tracking.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAssignment() {
    if (!selectedTechId) {
      alert('Please select a Lead Technician.');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('sales_orders')
        .update({ lead_technician_id: selectedTechId })
        .eq('id', salesOrderId);

      if (error) throw error;

      await loadTestTuneData();
      setEditMode(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Failed to save Lead Technician assignment.');
    } finally {
      setSaving(false);
    }
  }

  function calculateProjectedBonus(hoursRemaining: number): { techBonus: number; pmBonus: number; totalBonus: number; tierPct: number } | null {
    if (!data || hoursRemaining <= 0) return null;

    const { bonus_tiers, bonus_tier_type, estimated_labor_hours, labor_burden_rate, tech_bonus_percentage, pm_bonus_percentage } = data;

    if (!bonus_tiers || bonus_tiers.length === 0) return null;

    const savingsAmount = hoursRemaining * labor_burden_rate;

    let tierPct = 0;
    for (const tier of bonus_tiers) {
      if (bonus_tier_type === 'pct_of_estimated') {
        const pctSaved = estimated_labor_hours > 0 ? (hoursRemaining / estimated_labor_hours) * 100 : 0;
        const min = tier.min_pct ?? tier.min_hours ?? 0;
        const max = tier.max_pct ?? tier.max_hours ?? Infinity;
        if (pctSaved >= min && (max === null || pctSaved <= max)) {
          tierPct = tier.percentage;
        }
      } else {
        const min = tier.min_hours ?? 0;
        const max = tier.max_hours ?? null;
        if (hoursRemaining >= min && (max === null || hoursRemaining <= max)) {
          tierPct = tier.percentage;
        }
      }
    }

    if (tierPct === 0) return null;

    const totalBonus = savingsAmount * (tierPct / 100);
    return {
      totalBonus,
      techBonus: totalBonus * (tech_bonus_percentage / 100),
      pmBonus: totalBonus * (pm_bonus_percentage / 100),
      tierPct
    };
  }

  if (loading) {
    return (
      <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-600 rounded w-1/3" />
      </div>
    );
  }

  if (!data) return null;

  const isActive = data.test_tune_status === 'active';
  const isPaused = data.test_tune_status === 'paused';
  const isCompleted = data.test_tune_status === 'completed';
  const isTracking = isActive || isPaused;
  const hasStarted = isTracking || isCompleted;

  const daysRemaining = data.test_tune_end_date
    ? Math.max(0, Math.ceil((new Date(data.test_tune_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const laborTarget = data.estimated_labor_hours * 0.95;
  const progressPercent = laborTarget > 0 ? Math.min(100, (data.field_hours_used / laborTarget) * 100) : 0;
  const hoursRemaining = Math.max(0, laborTarget - data.field_hours_used);
  const effectiveLaborRate = data.estimated_labor_hours > 0
    ? data.total_labor_revenue / data.estimated_labor_hours
    : 0;

  const effectiveThreshold = data.per_job_override ?? data.global_min_effective_labor_rate;
  const salesRepIneligible = effectiveLaborRate > 0 && effectiveLaborRate < effectiveThreshold;
  const hasOverride = data.per_job_override != null;

  const projectedBonus = calculateProjectedBonus(hoursRemaining);

  return (
    <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Award className={`w-5 h-5 ${isActive ? 'text-blue-400' : isCompleted ? 'text-teal-400' : 'text-gray-400'}`} />
          <div className="text-left">
            <h3 className="text-lg font-semibold text-white">Test & Tune Performance Tracking</h3>
            <p className="text-sm text-gray-400">
              {isActive && `Active — ${daysRemaining} days remaining`}
              {isPaused && 'Paused — Can be resumed'}
              {isCompleted && 'Completed — Bonus calculated'}
              {!hasStarted && isProjectComplete && 'Project complete — Ready to start tracking'}
              {!hasStarted && !isProjectComplete && 'Pre-completion — Assign Lead Tech now, tracking starts at completion'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isProjectComplete && !hasStarted && (
            <span className="px-2.5 py-1 bg-gray-600/40 text-gray-400 text-xs font-medium rounded-full border border-gray-500/40 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Estimates Only
            </span>
          )}
          {hasOverride && (
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full flex items-center gap-1">
              <Shield className="w-3 h-3" />
              ELR Override
            </span>
          )}
          {isActive && (
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-medium rounded-full flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Active
            </span>
          )}
          {isPaused && (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm font-medium rounded-full flex items-center gap-1">
              <Pause className="w-3.5 h-3.5" />
              Paused
            </span>
          )}
          {isCompleted && (
            <span className="px-3 py-1 bg-teal-500/20 text-teal-400 text-sm font-medium rounded-full flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-600/50">

          {/* ============================================================ */}
          {/* PRE-COMPLETION: Running estimates notice + simplified view   */}
          {/* ============================================================ */}
          {!isProjectComplete && !hasStarted && (
            <>
              <div className="mt-4 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
                <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-300">
                  <span className="font-semibold">Running estimates only.</span> All figures shown below are projections based on the proposal. The official 90-day tracking period starts automatically when this project is marked <span className="font-semibold">Complete</span>.
                </div>
              </div>

              {data.estimated_labor_hours > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                      <Target className="w-3.5 h-3.5" />
                      Est. Labor Hours
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {data.estimated_labor_hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                      <Target className="w-3.5 h-3.5" />
                      Field Target (95%)
                    </div>
                    <div className="text-sm font-semibold text-blue-400">
                      {laborTarget.toFixed(1)}h
                    </div>
                  </div>
                  {projectedBonus && canEdit && (
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                        <DollarSign className="w-3.5 h-3.5" />
                        Potential Bonus
                      </div>
                      <div className="text-sm font-semibold text-green-400">
                        ~${projectedBonus.totalBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">if on-target at Day 90</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================ */}
          {/* POST-COMPLETION ACTIVE TRACKING                              */}
          {/* ============================================================ */}
          {isTracking && (
            <>
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Start Date
                  </div>
                  <div className="text-sm font-medium text-white">
                    {data.test_tune_start_date ? new Date(data.test_tune_start_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    Days Remaining
                  </div>
                  <div className={`text-sm font-medium ${daysRemaining < 30 ? 'text-yellow-400' : 'text-white'}`}>
                    {daysRemaining} days
                  </div>
                </div>

                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Target className="w-3.5 h-3.5" />
                    Labor Target
                  </div>
                  <div className="text-sm font-medium text-white">
                    {laborTarget.toFixed(1)}h
                  </div>
                </div>

                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Hours Used
                  </div>
                  <div className={`text-sm font-medium ${data.field_hours_used > laborTarget ? 'text-red-400' : 'text-green-400'}`}>
                    {data.field_hours_used.toFixed(1)}h
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-400">Labor Usage Progress</span>
                  <span className="text-white font-medium">{progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      progressPercent < 80 ? 'bg-green-500' : progressPercent < 100 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
              </div>

              {projectedBonus && canEdit && (
                <div className="bg-gray-700/30 border border-gray-600/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-gray-300">Projected Bonus Pool</span>
                    <span className="text-xs text-gray-500 ml-auto">{projectedBonus.tierPct}% tier</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Total Pool</div>
                      <div className="font-semibold text-green-400">
                        ${projectedBonus.totalBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Tech Share ({data.tech_bonus_percentage}%)</div>
                      <div className="font-semibold text-white">
                        ${projectedBonus.techBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">PM Share ({data.pm_bonus_percentage}%)</div>
                      <div className="font-semibold text-white">
                        ${projectedBonus.pmBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-600/30 text-xs text-gray-500 flex items-center gap-1.5">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    Based on {hoursRemaining.toFixed(1)}h remaining under target — final amount calculated at Day 90
                  </div>
                </div>
              )}

              {effectiveLaborRate > 0 && (
                <div className={`rounded-lg p-3 border ${
                  salesRepIneligible
                    ? 'bg-orange-500/10 border-orange-500/40'
                    : 'bg-gray-700/30 border-gray-600/30'
                }`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Effective Labor Rate</span>
                    <span className={`font-semibold ${salesRepIneligible ? 'text-orange-400' : 'text-white'}`}>
                      {formatCurrency(effectiveLaborRate)}/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                    <span>
                      Threshold: ${effectiveThreshold}/hr
                      {hasOverride && (
                        <span className="ml-1.5 text-orange-400 font-medium">(per-job override)</span>
                      )}
                    </span>
                  </div>
                  {salesRepIneligible && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-orange-400">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        Below the ${effectiveThreshold}/hr threshold — Sales Rep bonus ineligible on this job
                      </span>
                    </div>
                  )}
                  {hasOverride && data.per_job_override_reason && (
                    <div className="mt-2 text-xs text-gray-500 border-t border-gray-600/30 pt-2">
                      Override reason: <span className="text-gray-400 italic">{data.per_job_override_reason}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================ */}
          {/* Per-Job ELR Threshold Override (visible to authorized roles) */}
          {/* ============================================================ */}
          {canOverrideELR && (
            <div className="bg-gray-800/40 border border-gray-600/40 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowELROverride(!showELROverride)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Per-Job ELR Threshold Override
                  </span>
                  {hasOverride && (
                    <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                      Active: ${data.per_job_override}/hr
                    </span>
                  )}
                  {!hasOverride && (
                    <span className="text-xs text-gray-500">
                      Global: ${data.global_min_effective_labor_rate}/hr
                    </span>
                  )}
                </div>
                {showELROverride ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {showELROverride && (
                <div className="px-4 pb-4 border-t border-gray-600/30 pt-3 space-y-3">
                  <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                    <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-300">
                      Override the minimum Effective Labor Rate threshold for <strong>this job only</strong>.
                      The global default is ${data.global_min_effective_labor_rate}/hr. This override
                      affects Sales Rep bonus eligibility only — Tech and PM bonuses are not affected.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Override Threshold ($/hr)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={elrOverrideValue}
                          onChange={(e) => setElrOverrideValue(e.target.value)}
                          placeholder={`Default: ${data.global_min_effective_labor_rate}`}
                          step="5"
                          min="0"
                          className="w-full pl-7 pr-10 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/hr</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Leave blank to clear (restore global default)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Reason <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={elrOverrideReason}
                        onChange={(e) => setElrOverrideReason(e.target.value)}
                        placeholder="e.g., Approved exception per management..."
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveELROverride}
                      disabled={savingELR || !elrOverrideReason.trim()}
                      className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingELR ? 'Saving...' : 'Save Override'}
                    </button>
                    {hasOverride && (
                      <button
                        onClick={() => setConfirmModal({ title: 'Clear ELR Override', message: 'Clear the per-job override? The job will use the global threshold.', onConfirm: handleClearELROverride })}
                        disabled={savingELR || !elrOverrideReason.trim()}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear Override
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setShowELRLog(!showELRLog);
                        if (!showELRLog) await loadELRLog();
                      }}
                      className="flex items-center gap-1.5 ml-auto text-xs text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" />
                      {showELRLog ? 'Hide' : 'View'} History
                    </button>
                  </div>

                  {showELRLog && (
                    <div className="mt-2">
                      {elrLog.length === 0 ? (
                        <p className="text-xs text-gray-500 py-2">No override history for this job.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border border-gray-600 rounded-lg overflow-hidden">
                            <thead className="bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">Date</th>
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">Old</th>
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">New</th>
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">Changed By</th>
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">Reason</th>
                              </tr>
                            </thead>
                            <tbody>
                              {elrLog.map((row, i) => (
                                <tr key={row.id} className={i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}>
                                  <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                                    {new Date(row.changed_at).toLocaleDateString()}
                                  </td>
                                  <td className="px-3 py-2 text-gray-400">
                                    {row.old_override != null ? `$${row.old_override}/hr` : 'Global'}
                                  </td>
                                  <td className="px-3 py-2 text-white font-medium">
                                    {row.new_override != null ? `$${row.new_override}/hr` : 'Cleared'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-300">{row.changer_name}</td>
                                  <td className="px-3 py-2 text-gray-400 max-w-xs truncate">{row.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lead Technician Assignment */}
          <div className="bg-gray-700/30 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">Lead Technician Assignment</span>
                {!isProjectComplete && (
                  <span className="text-xs text-gray-500">(assign before completion)</span>
                )}
              </div>
              {canEdit && !isCompleted && !editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {editMode ? (
              <div className="space-y-3">
                <UserSelector
                  selectedUserId={selectedTechId}
                  onSelect={(id) => setSelectedTechId(id)}
                  roleFilter={['technician', 'production_manager', 'service_manager']}
                  label=""
                  placeholder="Select Lead Technician..."
                  showClearButton={false}
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveAssignment}
                    disabled={saving || !selectedTechId}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Assignment'}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setSelectedTechId(data.lead_technician_id);
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {data.lead_tech_name ? (
                  <>
                    <span className="text-white font-medium">{data.lead_tech_name}</span>
                    <span className="text-gray-500 text-sm">(Lead Technician)</span>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-yellow-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">
                      {isProjectComplete ? 'Not assigned — Required to start tracking' : 'Not assigned — Assign before marking project complete'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Control buttons — only shown after project is complete */}
          {canEdit && !isCompleted && isProjectComplete && (
            <div className="flex items-center gap-3 pt-2">
              {!isTracking && (
                <button
                  onClick={handleStartTestTune}
                  disabled={saving || !selectedTechId}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {saving ? 'Starting...' : 'Start Test & Tune'}
                </button>
              )}

              {isActive && (
                <button
                  onClick={() => setConfirmModal({ title: 'Pause Test & Tune', message: 'Are you sure you want to pause Test & Tune tracking?', onConfirm: handlePauseTestTune })}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  {saving ? 'Pausing...' : 'Pause Tracking'}
                </button>
              )}

              {isPaused && (
                <button
                  onClick={handleResumeTestTune}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {saving ? 'Resuming...' : 'Resume Tracking'}
                </button>
              )}
            </div>
          )}

          <div className="text-xs text-gray-400 bg-gray-700/30 rounded p-3">
            <p className="mb-1">
              <strong className="text-gray-300">How it works:</strong> The 90-day clock starts when the project is marked Complete. Post-completion work orders (punchlist items, callbacks, etc.) count toward field labor.
            </p>
            <p>
              Bonuses are only paid when Field Labor finishes below the Field Target at Day 90. Additional post-completion labor reduces the potential bonus pool.
            </p>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
