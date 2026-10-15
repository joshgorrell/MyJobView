export type IntakePurpose = 'support' | 'sales';
export type IntakeClassification = 'service' | 'task' | 'sales' | 'other' | 'unknown';
export type IntakeRoute = { destination: string; purpose: IntakePurpose; organizationId: string; enabled: boolean };
export function normalizeDealerEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function determineIntakeRoute(route: IntakeRoute, classification: IntakeClassification) {
  if (!route.enabled || !route.organizationId || !normalizeDealerEmail(route.destination)) {
    return { action: 'reject' as const, reason: 'Unverified or disabled dealer destination' };
  }
  if (classification === 'unknown' || classification === 'other') {
    return { action: 'review' as const, reason: 'Unclear request type' };
  }
  if (route.purpose === 'support' && classification === 'sales') {
    return { action: 'review' as const, reason: 'Sales inquiry received at support address' };
  }
  if (route.purpose === 'sales' && classification !== 'sales') {
    return { action: 'review' as const, reason: 'Non-sales request received at leads address' };
  }
  return { action: 'route' as const, destination: route.purpose === 'sales' ? 'lead_queue' as const : classification === 'task' ? 'task_queue' as const : 'service_queue' as const };
}
