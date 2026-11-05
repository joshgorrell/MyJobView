import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AssignmentEmployee } from '../components/Invoices/InvoiceAssignmentPicker';

interface EmployeeDirectoryState {
  employees: AssignmentEmployee[];
  loading: boolean;
  error: string | null;
}

/**
 * Employee options for invoice attribution, not a commission eligibility decision.
 * Inactive employees are retained if already assigned to preserve historical context.
 * Final write permissions and commission eligibility must be enforced server-side.
 */
export function useInvoiceAssignmentEmployees(assignedIds: Array<string | null> = []): EmployeeDirectoryState {
  const [state, setState] = useState<EmployeeDirectoryState>({
    employees: [], loading: true, error: null,
  });
  const assignedKey = assignedIds.filter(Boolean).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    setState(previous => ({ ...previous, loading: true, error: null }));
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_active')
        .order('full_name');
      if (cancelled) return;
      if (error) {
        setState({ employees: [], loading: false, error: error.message });
        return;
      }
      const selected = new Set(assignedKey.split(',').filter(Boolean));
      const employees = (data || [])
        .filter(person => person.is_active || selected.has(person.id))
        .map(person => ({
          id: person.id,
          name: person.full_name?.trim() || person.email || 'Unnamed employee',
          eligible: person.is_active === true,
        }));
      setState({ employees, loading: false, error: null });
    }
    void load();
    return () => { cancelled = true; };
  }, [assignedKey]);
  return state;
}
