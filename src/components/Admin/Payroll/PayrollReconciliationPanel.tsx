import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Scale, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface ReconciliationFlag {
  id: string;
  employee_id: string;
  employee_name: string;
  segment_date: string;
  daily_clock_hours: number;
  segment_hours: number;
  variance_hours: number;
  needs_review: boolean;
  resolution_status: string;
  resolution_note: string | null;
  excluded_hours: number;
  exclusion_reason: string | null;
  reconciliation_type: string;
}

export default function PayrollReconciliationPanel({ payPeriodId }: { payPeriodId: string | null }) {
  const [flags, setFlags] = useState<ReconciliationFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string>('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    if (!payPeriodId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll_reconciliation_flags')
        .select(`
          id, employee_id, segment_date, daily_clock_hours, segment_hours,
          variance_hours, needs_review, resolution_status, resolution_note,
          excluded_hours, exclusion_reason, reconciliation_type,
          employee:profiles!employee_id(full_name)
        `)
        .eq('pay_period_id', payPeriodId)
        .order('segment_date', { ascending: true });

      if (error) throw error;

      const mapped: ReconciliationFlag[] = (data || []).map((f: any) => ({
        id: f.id,
        employee_id: f.employee_id,
        employee_name: f.employee?.full_name || 'Unknown',
        segment_date: f.segment_date,
        daily_clock_hours: Number(f.daily_clock_hours) || 0,
        segment_hours: Number(f.segment_hours) || 0,
        variance_hours: Number(f.variance_hours) || 0,
        needs_review: f.needs_review,
        resolution_status: f.resolution_status,
        resolution_note: f.resolution_note,
        excluded_hours: Number(f.excluded_hours) || 0,
        exclusion_reason: f.exclusion_reason,
        reconciliation_type: f.reconciliation_type || 'payroll',
      }));

      setFlags(mapped);
    } catch (err) {
      console.error('Error loading reconciliation flags:', err);
    } finally {
      setLoading(false);
    }
  }, [payPeriodId]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const resolveFlag = async (flagId: string, status: 'resolved' | 'ignored') => {
    setResolving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('payroll_reconciliation_flags')
        .update({
          resolution_status: status,
          resolution_note: resolveNote || null,
          resolved_by: userData.data.user?.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', flagId);
      if (error) throw error;
      setResolvingId(null);
      setResolveNote('');
      await loadFlags();
    } catch (err: any) {
      console.error('Error resolving flag:', err);
      alert(err.message || 'Failed to resolve flag');
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading reconciliation...</div>;
  }

  if (!payPeriodId) {
    return <div className="p-4 text-sm text-slate-500">Select a pay period to view reconciliation.</div>;
  }

  const needsReviewFlags = flags.filter((f) => f.needs_review && f.resolution_status === 'unresolved' && f.reconciliation_type === 'payroll');
  const resolvedFlags = flags.filter((f) => f.resolution_status !== 'unresolved' && f.reconciliation_type === 'payroll');
  const allClearFlags = flags.filter((f) => !f.needs_review && f.reconciliation_type === 'payroll');
  const attendanceFlags = flags.filter((f) => f.reconciliation_type === 'attendance');
  const allocationFlags = flags.filter((f) => f.reconciliation_type === 'allocation');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-slate-400" />
        <h3 className="text-lg font-semibold text-slate-800">Reconciliation</h3>
      </div>

      {flags.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
          No reconciliation data yet. Click "Refresh Payroll Time" above to run the reconciliation check.
        </div>
      ) : needsReviewFlags.length === 0 && allClearFlags.length > 0 ? (
        <div className="p-4 text-center text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-4 h-4 inline mr-1" />
          All employee days reconcile within tolerance. No variances detected.
        </div>
      ) : (
        <>
          {needsReviewFlags.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {needsReviewFlags.length} day(s) have hour variances that need review.
              Daily clock hours and payroll segment hours must reconcile before payroll approval.
            </div>
          )}

          <div className="space-y-2">
            {needsReviewFlags.map((f) => (
              <div
                key={f.id}
                className="p-3 border border-amber-200 bg-amber-50 rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">
                      {f.employee_name} - {new Date(f.segment_date).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-slate-600 flex gap-4">
                      <span>Daily clock: <strong>{f.daily_clock_hours.toFixed(2)}h</strong></span>
                      <span>Segments: <strong>{f.segment_hours.toFixed(2)}h</strong></span>
                      <span className={f.variance_hours > 0 ? 'text-red-600' : 'text-amber-600'}>
                        Variance: <strong>{f.variance_hours > 0 ? '+' : ''}{f.variance_hours.toFixed(2)}h</strong>
                      </span>
                      {f.excluded_hours > 0 && (
                        <span className="text-red-600">
                          Excluded: <strong>{f.excluded_hours.toFixed(2)}h</strong>
                          {f.exclusion_reason && ` (${f.exclusion_reason})`}
                        </span>
                      )}
                    </div>
                    {f.variance_hours > 0 && (
                      <div className="text-xs text-red-600">
                        Employee has {f.variance_hours.toFixed(2)}h more daily clock time than payroll segments. Time may be missing from segments.
                      </div>
                    )}
                    {f.variance_hours < 0 && (
                      <div className="text-xs text-amber-600">
                        Employee has {Math.abs(f.variance_hours).toFixed(2)}h more segment time than daily clock. Check for duplicate or extra segments.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {resolvingId === f.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          placeholder="Resolution note (optional)"
                          className="px-2 py-1 text-xs border border-slate-300 rounded w-48"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => resolveFlag(f.id, 'resolved')}
                            disabled={resolving}
                            className="px-2 py-1 text-xs text-green-700 bg-green-100 hover:bg-green-200 rounded"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => resolveFlag(f.id, 'ignored')}
                            disabled={resolving}
                            className="px-2 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Ignore
                          </button>
                          <button
                            onClick={() => { setResolvingId(null); setResolveNote(''); }}
                            className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResolvingId(f.id)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {resolvedFlags.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-xs text-slate-400 font-medium">Resolved ({resolvedFlags.length})</div>
              {resolvedFlags.map((f) => (
                <div key={f.id} className="p-2 border border-slate-100 bg-slate-50 rounded text-xs text-slate-500">
                  {f.employee_name} - {new Date(f.segment_date).toLocaleDateString()}
                  {' | '}Variance: {f.variance_hours.toFixed(2)}h
                  {f.excluded_hours > 0 && ` | Excluded: ${f.excluded_hours.toFixed(2)}h`}
                  {' | '}{f.resolution_status}
                  {f.resolution_note && ` | ${f.resolution_note}`}
                </div>
              ))}
            </div>
          )}

          {attendanceFlags.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-xs text-blue-500 font-medium">Attendance Flags ({attendanceFlags.length}) - Informational only, does not block approval</div>
              {attendanceFlags.slice(0, 10).map((f) => (
                <div key={f.id} className="p-2 border border-blue-100 bg-blue-50 rounded text-xs text-blue-600">
                  {f.employee_name} - {new Date(f.segment_date).toLocaleDateString()}
                  {' | '}Expected: {f.variance_hours.toFixed(2)}h
                  {f.resolution_note && ` | ${f.resolution_note}`}
                </div>
              ))}
            </div>
          )}

          {allocationFlags.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-xs text-cyan-500 font-medium">Allocation Flags ({allocationFlags.length}) - Informational only, does not block approval</div>
              {allocationFlags.slice(0, 10).map((f) => (
                <div key={f.id} className="p-2 border border-cyan-100 bg-cyan-50 rounded text-xs text-cyan-600">
                  {f.employee_name} - {new Date(f.segment_date).toLocaleDateString()}
                  {' | '}Variance: {f.variance_hours.toFixed(2)}h
                  {f.resolution_note && ` | ${f.resolution_note}`}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
