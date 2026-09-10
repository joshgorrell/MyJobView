import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Calendar, Lock, CheckCircle, AlertCircle, Clock, FileText } from 'lucide-react';

interface PayPeriod {
  id: string;
  period_start_date: string;
  period_end_date: string;
  pay_date: string | null;
  period_type: string;
  status: string;
  notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'text-slate-600 bg-slate-100', icon: FileText },
  needs_review: { label: 'Needs Review', color: 'text-amber-700 bg-amber-100', icon: AlertCircle },
  payroll_approved: { label: 'Payroll Approved', color: 'text-blue-700 bg-blue-100', icon: CheckCircle },
  submitted: { label: 'Submitted', color: 'text-blue-700 bg-blue-100', icon: CheckCircle },
  processed: { label: 'Processed', color: 'text-green-700 bg-green-100', icon: CheckCircle },
  locked: { label: 'Locked', color: 'text-slate-700 bg-slate-200', icon: Lock },
};

const STATUS_FLOW = ['draft', 'needs_review', 'payroll_approved', 'submitted', 'processed', 'locked'];

export default function PayrollPeriodSummary({ onPeriodSelect }: { onPeriodSelect?: (id: string | null) => void }) {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [advancing, setAdvancing] = useState(false);

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

  const advanceStatus = async () => {
    if (!selectedPeriodId) return;
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (!period) return;

    const currentIdx = STATUS_FLOW.indexOf(period.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return;

    const nextStatus = STATUS_FLOW[currentIdx + 1];

    if (nextStatus === 'payroll_approved' && readiness && !readiness.ready_for_submission) {
      alert(
        `Cannot advance to Payroll Approved. ${readiness.unassigned_jurisdiction} segments have unassigned jurisdiction, ${readiness.gps_mismatches} have GPS mismatches, and ${readiness.pending_count} employees are pending approval.`
      );
      return;
    }

    setAdvancing(true);
    try {
      const updates: Record<string, any> = { status: nextStatus };
      if (nextStatus === 'locked') {
        const { data: userData } = await supabase.auth.getUser();
        const result = await supabase.rpc('lock_pay_period', {
          p_pay_period_id: selectedPeriodId,
          p_locked_by: userData.data.user?.id,
        });
        if (result.error) throw result.error;
      } else {
        const { error } = await supabase
          .from('pay_periods')
          .update(updates)
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

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading pay periods...</div>;
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const currentIdx = selectedPeriod ? STATUS_FLOW.indexOf(selectedPeriod.status) : -1;
  const canAdvance = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1;

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

              <div className="flex items-center gap-1">
                {STATUS_FLOW.map((s, i) => (
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
                    {i < STATUS_FLOW.length - 1 && (
                      <div
                        className={`w-8 h-0.5 ${i < currentIdx ? 'bg-blue-600' : 'bg-slate-200'}`}
                      />
                    )}
                  </div>
                ))}
              </div>

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

              {canAdvance && (
                <button
                  onClick={advanceStatus}
                  disabled={advancing}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {advancing ? 'Processing...' : `Advance to ${STATUS_CONFIG[STATUS_FLOW[currentIdx + 1]].label}`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
