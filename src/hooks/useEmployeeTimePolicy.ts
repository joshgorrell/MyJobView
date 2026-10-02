import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateInTimezone, getOrganizationTimezone } from '../lib/timezoneUtils';
import { canManageTime, PayrollTimeBasis } from '../lib/employeeTimePolicy';

export function useEmployeeTimePolicy() {
  const { profile } = useAuth();
  const [policy, setPolicy] = useState<{ basis: PayrollTimeBasis; dailyClock: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setPolicy(null);
    async function load() {
      if (!profile) return;
      try {
        const day = formatDateInTimezone(new Date().toISOString(), await getOrganizationTimezone());
        const { data: employee, error: employeeError } = await supabase.from('employees')
          .select('id').eq('user_id', profile.id).eq('organization_id', profile.organization_id).maybeSingle();
        if (employeeError) throw employeeError;
        if (employee) {
          const { data: config, error } = await supabase.from('employee_payroll_configs')
            .select('payroll_time_basis, requires_daily_clock').eq('employee_id', employee.id)
            .lte('effective_from', day).or(`effective_to.is.null,effective_to.gte.${day}`)
            .order('effective_from', { ascending: false }).limit(1).maybeSingle();
          if (error) throw error;
          if (config && !disposed) {
            setPolicy({ basis: config.payroll_time_basis as PayrollTimeBasis,
              dailyClock: config.payroll_time_basis !== 'work_allocation' && config.requires_daily_clock });
            return;
          }
        }
        if (!disposed) setPolicy({ basis: profile.employment_type === 'job_time' ? 'work_allocation' :
          profile.employment_type === 'salary' ? 'salary' : 'daily_clock',
          dailyClock: profile.employment_type !== 'job_time' && !!profile.requires_daily_clock });
      } catch (error) {
        console.error('Unable to load employee time configuration', error);
        // No direct payable entry while the configuration cannot be verified.
      } finally { if (!disposed) setLoading(false); }
    }
    void load();
    return () => { disposed = true; };
  }, [profile?.id, profile?.organization_id, profile?.employment_type, profile?.requires_daily_clock]);
  return { ...policy, loading, ready: policy !== null, canManage: canManageTime(profile?.role) };
}
