import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { Calendar, Lock, CheckCircle, AlertCircle, Clock, FileText, RefreshCw, RotateCcw } from 'lucide-react';

interface PayPeriod {
  id: string;
  period_start_date: string;
  period_end_date: string;
  pay_date: string | null;
  period_type: string;
  status: string;
  notes: string | null;
  last_refresh_at: string | null;
  last_segment_count: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'text-slate-600 bg-slate-100', icon: FileText },
  needs_review: { label: 'Needs Review', color: 'text-amber-700 bg-amber-100', icon: AlertCircle },
  payroll_approved: { label: 'Payroll Approved', color: 'text-blue-700 bg-blue-100', icon: CheckCircle },
  submitted: { label: 'Submitted', color: 'text-blue-700 bg-blue-100', icon: CheckCircle },
  processed: { label: 'Processed', color: 'text-green-700 bg-green-100', icon: CheckCircle },
  locked: { label: 'Locked', color: 'text-slate-700 bg-slate-200', icon: Lock },
};

// States visible in the progress bar. Submitted/Processed/Locked are shown as
// grayed-out future states — they require a payroll provider integration.
const VISIBLE_FLOW = ['draft', 'needs_review', 'payroll_approved'];
const FUTURE_STATES = ['submitted', 'processed', 'locked'];

// The admin can advance up to payroll_approved. Beyond that requires a provider.
const MAX_ADVANCEABLE_IDX = VISIBLE_FLOW.indexOf('payroll_approved');

export default function PayrollPeriodSummary({
  onPeriodSelect,
  onRefresh
}: {
  onPeriodSelect?: (id: string | null) => void;
  onRefresh?: () => void;
}) {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [advancing, setAdvancing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<any>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const refreshKeyRef = useRef(0);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pay_periods')
        .select('*')
        .order('period_start_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      setPeriods(data || []);
      if (data && data.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(data[0].id);
        onPeriodSelect?.(data[0].id);
      }
    } catch (err) {
      console.error('Error loading pay periods:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

  const loadReadiness = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      const { data, error } = await supabase.rpc('check_payroll_readiness', {
        p_pay_period_id: selectedPeriodId,
      });
      if (error) throw error;
      setReadiness(data);
    } catch (err) {
      console.error('Error loading readiness:', err);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  const handleRefresh = async () => {
    if (!selectedPeriodId) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { data, error } = await supabase.rpc('refresh_payroll_time', {
        p_pay_period_id: selectedPeriodId,
      });
      if (error) throw error;
      setRefreshResult(data);
      refreshKeyRef.current++;
      await loadPeriods();
      await loadReadiness();
      onRefresh?.();
    } catch (err: any) {
      console.error('Error refreshing payroll time:', err);
      setRefreshError(err.message || 'Failed to refresh payroll time');
    } finally {
      setRefreshing(false);
    }
  };

  const advanceStatus = async () => {
    if (!selectedPeriodId) return;
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (!period) return;

    const currentIdx = VISIBLE_FLOW.indexOf(period.status);
    if (currentIdx < 0 || currentIdx >= MAX_ADVANCEABLE_IDX) return;

    const nextStatus = VISIBLE_FLOW[currentIdx + 1];

    if (nextStatus === 'payroll_approved' && readiness && !readiness.ready_for_submission) {
      alert(
        `Cannot advance to Payroll Approved. ${readiness.unassigned_jurisdiction} segments have unassigned jurisdiction, ${readiness.gps_mismatches} have GPS mismatches, and ${readiness.pending_count} employees are pending approval.`
      );
      return;
    }

    setAdvancing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const actorId = userData.user?.id;
      if (!actorId) throw new Error('Not authenticated');

      if (nextStatus === 'payroll_approved') {
        const { error } = await supabase.rpc('approve_payroll_period', {
          p_pay_period_id: selectedPeriodId,
          p_approved_by: actorId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pay_periods')
          .update({ status: nextStatus })
          .eq('id', selectedPeriodId);
        if (error) throw error;
      }
      await loadPeriods();
      await loadReadiness();
    } catch (err: any) {
      console.error('Error advancing status:', err);
      alert(err.message || 'Failed to advance pay period status');
    } finally {
      setAdvancing(false);
    }
  };

  const createPayPeriod = async () => {
    try {
      const { data: orgData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      const orgId = orgData?.organization_id;
      if (!orgId) return;

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      const { error } = await supabase.from('pay_periods').insert({
        organization_id: orgId,
        period_start_date: startDate.toISOString().split('T')[0],
        period_end_date: endDate.toISOString().split('T')[0],
        period_type: 'weekly',
        status: 'draft',
      });
      if (error) throw error;
      await loadPeriods();
    } catch (err: any) {
      console.error('Error creating pay period:', err);
      alert(err.message || 'Failed to create pay period');
    }
  };

  const handleReopen = async () => {
    if (!selectedPeriodId || !reopenReason.trim()) return;
    setReopening(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('reopen_pay_period', {
        p_pay_period_id: selectedPeriodId,
        p_reopened_by: userData.data.user?.id,
        p_reopen_reason: reopenReason.trim(),
      });
      if (error) throw error;
      setShowReopenModal(false);
      setReopenReason('');
      await loadPeriods();
      await loadReadiness();
      onRefresh?.();
    } catch (err: any) {
      console.error('Error reopening pay period:', err);
      alert(err.message || 'Failed to reopen pay period');
    } finally {
      setReopening(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading pay periods...</div>;
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const currentIdx = selectedPeriod ? VISIBLE_FLOW.indexOf(selectedPeriod.status) : -1;
  const isAdvanceableState = currentIdx >= 0 && currentIdx < MAX_ADVANCEABLE_IDX;
  const isPayrollApproved = selectedPeriod?.status === 'payroll_approved';
  const canRefresh = selectedPeriod && !['locked', 'submitted', 'processed', 'payroll_approved'].includes(selectedPeriod.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Pay Period Summary</h3>
        <button
          onClick={createPayPeriod}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Weekly Period
        </button>
      </div>

      {periods.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
          No pay periods exist yet. Create one to get started.
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriodId(p.id); onPeriodSelect?.(p.id); }}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  p.id === selectedPeriodId
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {new Date(p.period_start_date).toLocaleDateString()} -{' '}
                {new Date(p.period_end_date).toLocaleDateString()}
              </button>
            ))}
          </div>

          {selectedPeriod && (
            <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">
                    {new Date(selectedPeriod.period_start_date).toLocaleDateString()} -{' '}
                    {new Date(selectedPeriod.period_end_date).toLocaleDateString()}
                  </span>
                </div>
                {(() => {
                  const cfg = STATUS_CONFIG[selectedPeriod.status];
                  const Icon = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${cfg.color}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>

              {/* Progress bar: visible advanceable states + grayed-out future states */}
              <div className="flex items-center gap-1">
                {VISIBLE_FLOW.map((s, i) => (
                  <div key={s} className="flex items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                        i <= currentIdx
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {i + 1}
                    </div>
                    {i < VISIBLE_FLOW.length - 1 && (
                      <div className={`w-8 h-0.5 ${i < currentIdx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    )}
                  </div>
                ))}
                {/* Future states shown as locked/disabled */}
                {FUTURE_STATES.map((s, i) => (
                  <div key={s} className="flex items-center">
                    <div
                      className="w-8 h-0.5 bg-slate-200"
                    />
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium bg-slate-100 text-slate-300 border border-slate-200"
                      title={`${STATUS_CONFIG[s].label} — requires payroll provider integration`}
                    >
                      <Lock className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Refresh Payroll Time button */}
              {canRefresh && (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing...' : 'Refresh Payroll Time'}
                </button>
              )}

              {/* Last refresh info */}
              {selectedPeriod.last_refresh_at && (
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last refreshed: {new Date(selectedPeriod.last_refresh_at).toLocaleString()}
                  </span>
                  {selectedPeriod.last_segment_count != null && (
                    <span>
                      Segments created/updated: {selectedPeriod.last_segment_count}
                    </span>
                  )}
                </div>
              )}

              {/* Refresh result summary */}
              {refreshResult && !refreshError && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 space-y-1">
                  <div className="font-medium">Refresh complete</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>Segments: {refreshResult.segments_created_or_updated}</span>
                    <span>Assigned: {refreshResult.segments_assigned}</span>
                    <span>Approvals created: {refreshResult.approvals_created}</span>
                    <span>Jurisdiction — High: {refreshResult.jurisdiction_high} / Medium: {refreshResult.jurisdiction_medium} / Low: {refreshResult.jurisdiction_low} / Unassigned: {refreshResult.jurisdiction_unassigned}</span>
                    {Number(refreshResult.reconciliation_flags) > 0 && (
                      <span className="text-amber-600 font-medium">
                        Reconciliation flags: {refreshResult.reconciliation_flags} (variance: {Number(refreshResult.reconciliation_total_variance || 0).toFixed(2)}h)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {refreshError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {refreshError}
                </div>
              )}

              {readiness && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <div className="p-2 bg-slate-50 rounded text-center">
                    <div className="text-lg font-semibold text-slate-700">
                      {readiness.total_employees ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">Employees</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded text-center">
                    <div className="text-lg font-semibold text-amber-600">
                      {readiness.unassigned_jurisdiction ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">Unassigned Jurisdiction</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded text-center">
                    <div className="text-lg font-semibold text-amber-600">
                      {readiness.gps_mismatches ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">GPS Mismatches</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded text-center">
                    <div className="text-lg font-semibold text-amber-600">
                      {readiness.pending_adjustments ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">Pending Adjustments</div>
                  </div>
                </div>
              )}

              {readiness && Number(readiness.unreviewed_timekeeping_configs) > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{readiness.unreviewed_timekeeping_configs} employee(s) need Timekeeping Configuration Review. Payroll cannot be approved until reviewed.</span>
                </div>
              )}

              {readiness && Number(readiness.unresolved_payroll_flags) > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{readiness.unresolved_payroll_flags} unresolved payroll reconciliation flag(s) must be resolved before approval.</span>
                </div>
              )}

              {isAdvanceableState && (
                <button
                  onClick={advanceStatus}
                  disabled={advancing}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {advancing ? 'Processing...' : `Advance to ${STATUS_CONFIG[VISIBLE_FLOW[currentIdx + 1]].label}`}
                </button>
              )}

              {isPayrollApproved && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 text-center">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    Payroll Approved. This is the final available state until a payroll provider is connected.
                    Submitted, Processed, and Locked states will be controlled by the payroll integration.
                  </div>
                  <button
                    onClick={() => setShowReopenModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reopen to Needs Review
                  </button>
                </div>
              )}

              {showReopenModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">Reopen Pay Period</h3>
                    <p className="text-sm text-slate-600">This will unlock all segments and set the period back to Needs Review. A reason is required for audit purposes.</p>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Reason for reopening..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowReopenModal(false); setReopenReason(''); }}
                        className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReopen}
                        disabled={reopening || !reopenReason.trim()}
                        className="flex-1 px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        {reopening ? 'Reopening...' : 'Reopen Period'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

}

