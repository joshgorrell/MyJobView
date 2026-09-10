import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Users, MapPin, AlertTriangle, Scale } from 'lucide-react';

interface EmployeeSummary {
  employee_id: string;
  employee_name: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  pto_hours: number;
  hours_by_state: Record<string, number>;
  unassigned_hours: number;
  gps_mismatches: number;
  pending_adjustments: number;
  payroll_approval_status: string;
  has_reconciliation_flags: boolean;
}

export default function PayrollEmployeeHoursSummary({ payPeriodId }: { payPeriodId: string | null }) {
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!payPeriodId) return;
    setLoading(true);
    try {
      const { data: segments, error } = await supabase
        .from('payroll_time_segments')
        .select(`
          employee_id,
          total_hours,
          overtime_hours,
          time_type,
          work_jurisdiction_state,
          work_jurisdiction_confidence,
          payroll_approval_status,
          employee:profiles!employee_id(full_name)
        `)
        .eq('pay_period_id', payPeriodId);

      if (error) throw error;
      if (!segments) return;

      const byEmployee = new Map<string, EmployeeSummary>();

      for (const seg of segments as any[]) {
        const empId = seg.employee_id;
        if (!byEmployee.has(empId)) {
          byEmployee.set(empId, {
            employee_id: empId,
            employee_name: seg.employee?.full_name || 'Unknown',
            total_hours: 0,
            regular_hours: 0,
            overtime_hours: 0,
            pto_hours: 0,
            hours_by_state: {},
            unassigned_hours: 0,
            gps_mismatches: 0,
            pending_adjustments: 0,
            payroll_approval_status: seg.payroll_approval_status || 'pending',
            has_reconciliation_flags: false,
          });
        }
        const s = byEmployee.get(empId)!;
        const hours = Number(seg.total_hours) || 0;
        s.total_hours += hours;

        if (seg.time_type === 'pto') {
          s.pto_hours += hours;
        } else {
          s.regular_hours += hours;
        }
        s.overtime_hours += Number(seg.overtime_hours) || 0;

        const state = seg.work_jurisdiction_state;
        if (state) {
          s.hours_by_state[state] = (s.hours_by_state[state] || 0) + hours;
        } else {
          s.unassigned_hours += hours;
        }

        if (seg.work_jurisdiction_confidence === 'low') {
          s.gps_mismatches++;
        }
      }

      // Load pending adjustments
      const { data: adjustments } = await supabase
        .from('time_adjustment_requests')
        .select('technician_id')
        .eq('status', 'pending');

      if (adjustments) {
        const adjCounts = new Map<string, number>();
        for (const adj of adjustments) {
          adjCounts.set(adj.technician_id, (adjCounts.get(adj.technician_id) || 0) + 1);
        }
        for (const s of byEmployee.values()) {
          s.pending_adjustments = adjCounts.get(s.employee_id) || 0;
        }
      }

      // Load payroll approvals
      const { data: approvals } = await supabase
        .from('payroll_approvals')
        .select('employee_id, approval_status')
        .eq('pay_period_id', payPeriodId);

      if (approvals) {
        for (const ap of approvals) {
          const s = byEmployee.get(ap.employee_id);
          if (s) s.payroll_approval_status = ap.approval_status;
        }
      }

      // Load reconciliation flags
      const { data: reconFlags } = await supabase
        .from('payroll_reconciliation_flags')
        .select('employee_id, needs_review, resolution_status')
        .eq('pay_period_id', payPeriodId)
        .eq('needs_review', true)
        .eq('resolution_status', 'unresolved')
        .eq('reconciliation_type', 'payroll');

      if (reconFlags) {
        const flaggedEmps = new Set(reconFlags.map((f: any) => f.employee_id));
        for (const s of byEmployee.values()) {
          s.has_reconciliation_flags = flaggedEmps.has(s.employee_id);
        }
      }

      setSummaries(Array.from(byEmployee.values()));
    } catch (err) {
      console.error('Error loading employee summary:', err);
    } finally {
      setLoading(false);
    }
  }, [payPeriodId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading employee hours...</div>;
  }

  if (!payPeriodId) {
    return <div className="p-4 text-sm text-slate-500">Select a pay period to view employee hours.</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
        No payroll time segments found for this period. Run segment generation first.
      </div>
    );
  }

  const readinessColor = (s: EmployeeSummary) => {
    if (s.unassigned_hours > 0 || s.gps_mismatches > 0) return 'bg-red-100 text-red-700';
    if (s.pending_adjustments > 0 || s.payroll_approval_status === 'pending') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-400" />
        <h3 className="text-lg font-semibold text-slate-800">Employee Hours Summary</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Regular</th>
              <th className="px-3 py-2 text-right">OT</th>
              <th className="px-3 py-2 text-right">PTO</th>
              <th className="px-3 py-2">Hours by State</th>
              <th className="px-3 py-2 text-right">Unassigned</th>
              <th className="px-3 py-2 text-right">GPS Mismatch</th>
              <th className="px-3 py-2 text-right">Adj Pending</th>
              <th className="px-3 py-2 text-center">Recon</th>
              <th className="px-3 py-2 text-center">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.employee_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-700">{s.employee_name}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.total_hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.regular_hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.overtime_hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.pto_hours.toFixed(1)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(s.hours_by_state).map(([state, hrs]) => (
                      <span key={state} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-700">
                        <MapPin className="w-2.5 h-2.5" />
                        {state}: {hrs.toFixed(1)}h
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  {s.unassigned_hours > 0 ? (
                    <span className="text-red-600 font-medium">{s.unassigned_hours.toFixed(1)}h</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.gps_mismatches > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {s.gps_mismatches}
                    </span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.pending_adjustments > 0 ? (
                    <span className="text-amber-600 font-medium">{s.pending_adjustments}</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.has_reconciliation_flags ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium" title="Has unresolved reconciliation variance">
                      <Scale className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block w-3 h-3 rounded-full ${readinessColor(s)}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
