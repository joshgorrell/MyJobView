export type IntakeHistoryRole = 'dealer_admin' | 'service_manager' | 'service_staff' | 'other';
export function canViewIntakeHistory(role: IntakeHistoryRole): boolean {
  return role === 'dealer_admin' || role === 'service_manager';
}
export function canRetryIntake(role: IntakeHistoryRole): boolean {
  return role === 'dealer_admin' || role === 'service_manager';
}
// UI affordance only. Server-side authorization and RLS are mandatory.
