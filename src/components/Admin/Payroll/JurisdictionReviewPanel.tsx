import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { MapPin, AlertTriangle, CheckCircle, Edit3, X } from 'lucide-react';

interface Segment {
  id: string;
  employee_id: string;
  employee_name: string;
  segment_date: string;
  start_time: string;
  end_time: string | null;
  total_hours: number;
  time_type: string;
  work_jurisdiction_state: string | null;
  work_jurisdiction_source: string | null;
  work_jurisdiction_confidence: string | null;
  physical_work_location_state: string | null;
  work_order_id: string | null;
  job_state: string | null;
  is_locked: boolean;
}

const CONFIDENCE_STYLES: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-green-600' },
  medium: { label: 'Medium', color: 'text-amber-600' },
  low: { label: 'Needs Review', color: 'text-red-600' },
  unassigned: { label: 'Unassigned', color: 'text-red-600' },
};

export default function JurisdictionReviewPanel({ payPeriodId }: { payPeriodId: string | null }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'needs_review' | 'unassigned'>('needs_review');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideState, setOverrideState] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const loadSegments = useCallback(async () => {
    if (!payPeriodId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll_time_segments')
        .select(`
          id, employee_id, segment_date, start_time, end_time, total_hours,
          time_type, work_jurisdiction_state, work_jurisdiction_source,
          work_jurisdiction_confidence, physical_work_location_state,
          work_order_id, is_locked,
          employee:profiles!employee_id(full_name),
          work_order:work_orders!work_order_id(job_state)
        `)
        .eq('pay_period_id', payPeriodId)
        .order('segment_date', { ascending: true });

      if (error) throw error;

      const mapped: Segment[] = (data || []).map((s: any) => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: s.employee?.full_name || 'Unknown',
        segment_date: s.segment_date,
        start_time: s.start_time,
        end_time: s.end_time,
        total_hours: s.total_hours,
        time_type: s.time_type,
        work_jurisdiction_state: s.work_jurisdiction_state,
        work_jurisdiction_source: s.work_jurisdiction_source,
        work_jurisdiction_confidence: s.work_jurisdiction_confidence,
        physical_work_location_state: s.physical_work_location_state,
        work_order_id: s.work_order_id,
        job_state: s.work_order?.job_state || null,
        is_locked: s.is_locked,
      }));

      setSegments(mapped);
    } catch (err) {
      console.error('Error loading segments:', err);
    } finally {
      setLoading(false);
    }
  }, [payPeriodId]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const filtered = segments.filter((s) => {
    if (filter === 'needs_review') return s.work_jurisdiction_confidence === 'low' || s.work_jurisdiction_confidence === 'unassigned';
    if (filter === 'unassigned') return !s.work_jurisdiction_state;
    return true;
  });

  const saveOverride = async (segmentId: string) => {
    if (!overrideState.trim() || !overrideReason.trim()) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('payroll_time_segments')
        .update({
          work_jurisdiction_state: overrideState.trim().toUpperCase(),
          work_jurisdiction_source: 'manual_override',
          work_jurisdiction_confidence: 'high',
          work_jurisdiction_override_by: userData.data.user?.id,
          work_jurisdiction_override_reason: overrideReason.trim(),
        })
        .eq('id', segmentId);

      if (error) throw error;
      setEditingId(null);
      setOverrideState('');
      setOverrideReason('');
      await loadSegments();
    } catch (err: any) {
      console.error('Error saving override:', err);
      alert(err.message || 'Failed to save override');
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading jurisdiction review...</div>;
  }

  if (!payPeriodId) {
    return <div className="p-4 text-sm text-slate-500">Select a pay period to review jurisdictions.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Jurisdiction Review</h3>
        <div className="flex gap-1">
          {(['needs_review', 'unassigned', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'needs_review' ? 'Needs Review' : f === 'unassigned' ? 'Unassigned' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
          {filter === 'needs_review'
            ? 'No segments need jurisdiction review. All clear!'
            : 'No segments found for this period.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const isMismatch =
              s.physical_work_location_state &&
              s.job_state &&
              s.physical_work_location_state.toUpperCase() !== s.job_state.toUpperCase();
            const confStyle = CONFIDENCE_STYLES[s.work_jurisdiction_confidence || 'unassigned'];

            return (
              <div
                key={s.id}
                className={`p-3 border rounded-lg ${
                  s.work_jurisdiction_confidence === 'low' || s.work_jurisdiction_confidence === 'unassigned'
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">
                      {s.employee_name} - {new Date(s.segment_date).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(s.start_time).toLocaleTimeString()} -{' '}
                      {s.end_time ? new Date(s.end_time).toLocaleTimeString() : 'In progress'}
                      {' | '}
                      {s.total_hours?.toFixed(1) || '0'}h
                      {' | '}
                      {s.time_type}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">
                        Job: <strong>{s.job_state || '-'}</strong>
                      </span>
                      <span className="text-slate-600">
                        Physical location: <strong>{s.physical_work_location_state || '-'}</strong>
                      </span>
                      <span className={confStyle.color}>
                        Payroll jurisdiction:{' '}
                        <strong>
                          {s.work_jurisdiction_state || (
                            <span className="inline-flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" /> Needs Review
                            </span>
                          )}
                        </strong>
                      </span>
                    </div>
                    {isMismatch && (
                      <div className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        GPS/job state mismatch - payroll admin must decide
                      </div>
                    )}
                  </div>

                  {!s.is_locked && editingId !== s.id && (
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setOverrideState(s.work_jurisdiction_state || '');
                        setOverrideReason('');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      Override
                    </button>
                  )}
                  {s.is_locked && (
                    <span className="text-xs text-slate-400 px-2 py-1">Locked</span>
                  )}
                </div>

                {editingId === s.id && (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={overrideState}
                        onChange={(e) => setOverrideState(e.target.value)}
                        placeholder="State (e.g., KS, MO)"
                        maxLength={2}
                        className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Reason for override"
                        className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setOverrideState('');
                          setOverrideReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                      <button
                        onClick={() => saveOverride(s.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        <CheckCircle className="w-3 h-3" /> Save Override
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
