import {supabase} from './supabase';
export function workDate(now:Date,timezone:string) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export async function getEmployeeTimeContext(userId:string) {
  const {data:profile,error:profileError}=await supabase.from('profiles').select('organization_id,employment_type,requires_daily_clock').eq('id',userId).single();
  if(profileError) throw profileError;
  const {data:org,error:orgError}=await supabase.from('organizations').select('timezone').eq('id',profile.organization_id).single();
  if(orgError) throw orgError;
  const timezone=org.timezone || 'America/Chicago';
  const date=workDate(new Date(),timezone);
  const {data:employee,error:employeeError}=await supabase.from('employees').select('id').eq('user_id',userId).maybeSingle();
  if(employeeError) throw employeeError;
  if(employee) {
    const {data:config,error}=await supabase.from('employee_payroll_configs').select('payroll_time_basis,requires_daily_clock')
      .eq('employee_id',employee.id).lte('effective_from',date).or(`effective_to.is.null,effective_to.gte.${date}`)
      .order('effective_from',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    if(config) return {timezone,basis:config.payroll_time_basis,dailyClock:config.payroll_time_basis!=='work_allocation' && config.requires_daily_clock};
  }
  return {timezone,basis:profile.employment_type==='job_time'?'work_allocation':profile.employment_type==='salary'?'salary':'daily_clock',dailyClock:profile.employment_type!=='job_time' && !!profile.requires_daily_clock};
}
