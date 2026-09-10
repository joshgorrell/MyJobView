import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface EmployeeSummary {
  employee_id: string;
  user_id: string;
  full_name: string;
  requires_daily_clock: boolean;
  requires_time_allocation: boolean;
  available_hours: number | null;
  allocated_hours: number;
  unallocated_hours: number | null;
  overallocated_hours: number;
  status: string;
}

export function AttendanceAllocationSummary({ payPeriodId }: { payPeriodId: string | null }) {
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (payPeriodId) {
      loadSummaries(payPeriodId);
    } else {
      setSummaries([]);
    }
  }, [payPeriodId]);

  async function loadSummaries(periodId: string) {
    setLoading(true);
    try {
      const { data: period } = await supabase
        .from('pay_periods')
        .select('period_start_date, period_end_date, organization_id')
        .eq('id', periodId)
        .maybeSingle();

      if (!period) { setSummaries([]); return; }

      const { data: segments } = await supabase
        .from('payroll_time_segments')
        .select('employee_id')
        .eq('pay_period_id', periodId);

      if (!segments || segments.length === 0) { setSummaries([]); return; }

      const empIds = [...new Set(segments.map(s => s.employee_id))];
      const { data: employees } = await supabase
        .from('employees')
        .select('id, user_id, organization_id')
        .in('id', empIds);

      if (!employees) { setSummaries([]); return; }

      const { data: configs } = await supabase
        .from('employee_payroll_configs')
        .select('*')
        .in('employee_id', empIds)
        .is('effective_to', null);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', employees.map(e => e.user_id));

      const configMap = new Map((configs || []).map(c => [c.employee_id, c]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      const result: EmployeeSummary[] = [];

      for (const emp of employees) {
        const config = configMap.get(emp.id);
        if (!config) continue;

        const startDate = new Date(period.period_start_date);
        const endDate = new Date(period.period_end_date);

        let availableHours: number | null = null;
        if (config.requires_daily_clock) {
          const { data: clockEntries } = await supabase
            .from('daily_clock_entries')
            .select('total_hours')
            .eq('technician_id', emp.user_id)
            .gte('entry_date', period.period_start_date)
            .lte('entry_date', period.period_end_date)
            .eq('status', 'clocked_out');
          availableHours = (clockEntries || []).reduce((sum, e) => sum + (Number(e.total_hours) || 0), 0);
        }

        const { data: timeEntries } = await supabase
          .from('time_entries')
          .select('total_hours')
          .eq('technician_id', emp.user_id)
          .gte('entry_date', period.period_start_date)
          .lte('entry_date', period.period_end_date)
          .eq('status', 'approved');
        let allocatedHours = (timeEntries || []).reduce((sum, e) => sum + (Number(e.total_hours) || 0), 0);

        const { data: internalSessions } = await supabase
          .from('internal_time_sessions')
          .select('predetermined_hours')
          .eq('assigned_to', emp.user_id)
          .gte('session_date', period.period_start_date)
          .lte('session_date', period.period_end_date)
          .eq('status', 'approved');
        allocatedHours += (internalSessions || []).reduce((sum, s) => sum + (Number(s.predetermined_hours) || 0), 0);

        let unallocatedHours: number | null = null;
        let overallocatedHours = 0;
        if (availableHours !== null) {
          const diff = availableHours - allocatedHours;
          if (diff < 0) {
            overallocatedHours = Math.abs(diff);
            unallocatedHours = 0;
          } else {
            unallocatedHours = diff;
          }
        }

        let status = 'Complete';
        if (!config.requires_daily_clock && !config.requires_time_allocation) {
          status = 'N/A';
        } else if (config.requires_daily_clock && availableHours === 0) {
          status = 'No clock';
        } else if (config.requires_daily_clock && availableHours !== null && availableHours < 1) {
          status = 'Incomplete';
        } else if (config.requires_time_allocation && unallocatedHours !== null && unallocatedHours > 0.01) {
          status = 'Unallocated';
        } else if (overallocatedHours > 0.01) {
          status = 'Overallocated';
        }

        result.push({
          employee_id: emp.id,
          user_id: emp.user_id,
          full_name: profileMap.get(emp.user_id) || 'Unknown',
          requires_daily_clock: config.requires_daily_clock,
          requires_time_allocation: config.requires_time_allocation,
          available_hours: availableHours,
          allocated_hours: allocatedHours,
          unallocated_hours: unallocatedHours,
          overallocated_hours: overallocatedHours,
          status,
        });
      }

      setSummaries(result);
    } catch (error) {
      console.error('Error loading attendance/allocation summaries:', error);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }

  if (!payPeriodId) return null;
  if (loading) return <div className="text-sm text-gray-500 p-4">Loading attendance summary...</div>;
  if (summaries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          Attendance & Allocation Summary
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unallocated</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Overallocated</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {summaries.map(s => (
              <tr key={s.employee_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-900 font-medium">{s.full_name}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-700">
                  {s.available_hours !== null ? s.available_hours.toFixed(1) : 'N/A'}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-700">{s.allocated_hours.toFixed(1)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-700">
                  {s.unallocated_hours !== null ? s.unallocated_hours.toFixed(1) : 'N/A'}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-700">
                  {s.overallocated_hours > 0 ? s.overallocated_hours.toFixed(1) : '-'}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    s.status === 'Complete' ? 'bg-green-100 text-green-700' :
                    s.status === 'N/A' ? 'bg-gray-100 text-gray-500' :
                    s.status === 'No clock' || s.status === 'Incomplete' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {s.status === 'Complete' && <CheckCircle className="w-3 h-3" />}
                    {(s.status === 'No clock' || s.status === 'Incomplete') && <XCircle className="w-3 h-3" />}
                    {s.status === 'Unallocated' && <AlertCircle className="w-3 h-3" />}
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-gray-400">
        Available hours only shown for employees with Daily Clock requirement. Employees without time allocation requirement never show red for zero project hours.
      </div>
    </div>
  );
}
