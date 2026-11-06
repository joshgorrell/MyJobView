import { supabase } from '../../lib/supabase';
import { isValidLastEmployeeDate } from './employeeConversionDates';

export async function convertEmployee(userId: string, lastEmployeeDate: string): Promise<void> {
  if (!isValidLastEmployeeDate(lastEmployeeDate)) throw new Error('Invalid last employee date');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('You must be signed in');
  const { error } = await supabase.rpc('convert_employee_to_non_employee', {
    p_user_id: userId,
    p_last_employee_date: lastEmployeeDate,
    p_reviewed_by: user.id,
  });
  if (error) throw error;
}
