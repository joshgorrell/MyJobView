/** Manual entry is a separate permission from recording one's own work-order time. */
export const TIME_MANAGER_ROLES = ['admin', 'manager', 'service_manager', 'office_manager', 'production_manager', 'sales_manager'];
export function canManageTime(role?: string | null) {
  return !!role && TIME_MANAGER_ROLES.includes(role);
}
export type PayrollTimeBasis = 'daily_clock' | 'work_allocation' | 'salary';
