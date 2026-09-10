import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { CheckCircle, XCircle, Users } from 'lucide-react';

interface ApprovalRow {
  id: string;
  employee_id: string;
  employee_name: string;
  approval_status: string;
  total_hours: number | null;
  regular_hours: number | null;
  overtime_hours: number | null;
  pto_hours: number | null;
  exclusion_reason: string | null;
}

export default function PayrollApprovalPanel({ payPeriodId }: { payPeriodId: string | null }) {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadApprovals = useCallback(async () => {
    if (!payPeriodId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll_approvals')
        .select(`
          id, employee_id, approval_status, total_hours, regular_hours,
          overtime_hours, pto_hours, exclusion_reason,
          employee:profiles!employee_id(full_name)
        `)
        .eq('pay_period_id', payPeriodId);

      if (error) throw error;

      const mapped: ApprovalRow[] = (data || []).map((a: any) => ({
        id: a.id,
        employee_id: a.employee_id,
        employee_name: a.employee?.full_name || 'Unknown',
        approval_status: a.approval_status,
        total_hours: a.total_hours,
        regular_hours: a.regular_hours,
        overtime_hours: a.overtime_hours,
        pto_hours: a.pto_hours,
        exclusion_reason: a.exclusion_reason,
      }));

      setApprovals(mapped);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      setLoading(false);
    }
  }, [payPeriodId]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const updateApproval = async (employeeId: string, status: 'approved' | 'excluded', reason?: string) => {
    if (!payPeriodId) return;
    setUpdating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const existing = approvals.find((a) => a.employee_id === employeeId);

      if (existing) {
        const { error } = await supabase
          .from('payroll_approvals')
          .update({
            approval_status: status,
            approved_by: status === 'approved' ? userData.data.user?.id : null,
            approved_at: status === 'approved' ? new Date().toISOString() : null,
            exclusion_reason: status === 'excluded' ? reason || null : null,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data: orgData } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', userData.data.user?.id)
          .maybeSingle();

        const { error } = await supabase.from('payroll_approvals').insert({
          organization_id: orgData?.organization_id,
          pay_period_id: payPeriodId,
          employee_id: employeeId,
          approval_status: status,
          approved_by: status === 'approved' ? userData.data.user?.id : null,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
          exclusion_reason: status === 'excluded' ? reason || null : null,
        });
        if (error) throw error;
      }
      await loadApprovals();
    } catch (err: any) {
      console.error('Error updating approval:', err);
      alert(err.message || 'Failed to update approval');
    } finally {
      setUpdating(false);
    }
  };

  const approveAll = async () => {
    if (!payPeriodId) return;
    setUpdating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: orgData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userData.data.user?.id)
        .maybeSingle();

      const pending = approvals.filter((a) => a.approval_status === 'pending');
      for (const p of pending) {
        if (p.id) {
          await supabase
            .from('payroll_approvals')
            .update({
              approval_status: 'approved',
              approved_by: userData.data.user?.id,
              approved_at: new Date().toISOString(),
            })
            .eq('id', p.id);
        } else {
          await supabase.from('payroll_approvals').insert({
            organization_id: orgData?.organization_id,
            pay_period_id: payPeriodId,
            employee_id: p.employee_id,
            approval_status: 'approved',
            approved_by: userData.data.user?.id,
            approved_at: new Date().toISOString(),
          });
        }
      }
      await loadApprovals();
    } catch (err: any) {
      console.error('Error approving all:', err);
      alert(err.message || 'Failed to approve all');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading payroll approvals...</div>;
  }

  if (!payPeriodId) {
    return <div className="p-4 text-sm text-slate-500">Select a pay period to manage approvals.</div>;
  }

  if (approvals.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Payroll Approval</h3>
        </div>
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
          No payroll approval records yet. Approvals are separate from job/time approvals.
        </div>
      </div>
    );
  }

  const allApproved = approvals.every((a) => a.approval_status === 'approved' || a.approval_status === 'excluded');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-800">Payroll Approval</h3>
        </div>
        {!allApproved && (
          <button
            onClick={approveAll}
            disabled={updating}
            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            Approve All Ready
          </button>
        )}
      </div>

      <div className="space-y-2">
        {approvals.map((a) => (
          <div
            key={a.id || a.employee_id}
            className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
          >
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-slate-700">{a.employee_name}</div>
              <div className="text-xs text-slate-500">
                Total: {Number(a.total_hours || 0).toFixed(1)}h
                {' | '}Reg: {Number(a.regular_hours || 0).toFixed(1)}h
                {' | '}OT: {Number(a.overtime_hours || 0).toFixed(1)}h
                {' | '}PTO: {Number(a.pto_hours || 0).toFixed(1)}h
              </div>
              {a.exclusion_reason && (
                <div className="text-xs text-slate-400">Excluded: {a.exclusion_reason}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {a.approval_status === 'approved' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-100 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Approved
                </span>
              )}
              {a.approval_status === 'excluded' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded-full">
                  <XCircle className="w-3 h-3" /> Excluded
                </span>
              )}
              {a.approval_status === 'pending' && (
                <>
                  <button
                    onClick={() => updateApproval(a.employee_id, 'approved')}
                    disabled={updating}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors"
                  >
                    <CheckCircle className="w-3 h-3" /> Approve
                  </button>
                  <button
                    onClick={() => updateApproval(a.employee_id, 'excluded', 'Excluded by admin')}
                    disabled={updating}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 rounded transition-colors"
                  >
                    <XCircle className="w-3 h-3" /> Exclude
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
