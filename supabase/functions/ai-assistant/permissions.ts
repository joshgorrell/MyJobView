/** AI access is resolved from current database permissions on every request. */
export interface ModuleRow { id: string; module_key: string }
export interface RoleAccess { module_id: string; has_access: boolean }
export interface UserOverride { module_id: string; override_type: string }

export function allowedModules(role: string, modules: ModuleRow[], roleAccess: RoleAccess[], overrides: UserOverride[]): Set<string> {
  const allowed = new Set<string>();
  for (const key of new Set(modules.map(module => module.module_key))) {
    const ids = new Set(modules.filter(module => module.module_key === key).map(module => module.id));
    const personal = overrides.filter(override => ids.has(override.module_id));
    // An explicit revoke must not be bypassed through a duplicate department entry.
    if (personal.some(override => override.override_type === 'revoke')) continue;
    if (personal.some(override => override.override_type === 'grant')) { allowed.add(key); continue; }
    const grants = roleAccess.filter(access => ids.has(access.module_id));
    if (role === 'admin' || grants.some(access => access.has_access)) allowed.add(key);
  }
  return allowed;
}

const actionModules: Record<string, string[]> = {
  CREATE_PROPOSAL: ['proposals'], CREATE_CONTACT: ['contacts'], CREATE_LEAD: ['leads'],
  CREATE_TASK: ['tasks'], CREATE_SERVICE_REQUEST: ['service_requests'],
  CREATE_SECURITY_CONTRACT: ['security_onboarding'], CREATE_MESSAGE: ['messages'],
  OPEN_PROPOSAL: ['proposals'],
};
export function actionAllowed(action: { type?: unknown; tab?: unknown }, allowed: Set<string>): boolean {
  if (action.type === 'NAVIGATE_TO') return typeof action.tab === 'string' && allowed.has(action.tab);
  if (typeof action.type !== 'string') return false;
  return (actionModules[action.type] || []).some(key => allowed.has(key));
}
export function allowedActionTypes(allowed: Set<string>): string[] {
  return Object.keys(actionModules).filter(type => actionAllowed({ type }, allowed));
}

// No payroll, commission, or employee-efficiency source is connected to AI.
// This is a deterministic refusal for supported sensitive intents, in addition to
// excluding those sources entirely (including browser-provided performance data).
export function unsupportedPersonnelQuestion(text: string): boolean {
  return /\b(payroll|salar(?:y|ies)|wages?|compensation|paychecks?|commissions?|efficien(?:cy|t)|productivity)\b|\bpay\s*(rate|check|stub)s?\b|\b(?:employee|technician|coworker|colleague|staff)\b.{0,80}\b(?:performance|earnings|numbers|stats|statistics)\b|\b(?:performance|earnings|statistics)\b.{0,80}\b(?:employee|technician|coworker|colleague|staff)\b/i.test(text);
}
export const personnelUnavailable = 'I cannot access payroll, compensation, or employee efficiency records through this assistant. Please use the appropriate authorized module.';

export function salesTargetAllowed(callerId: string, role: string, targetId: string, allowed: Set<string>): boolean {
  return allowed.has('sales_dashboard') && (targetId === callerId || ['admin', 'manager', 'sales_manager'].includes(role));
}

/** Only known sales totals reach the model; future RPC additions stay private. */
export function salesSummary(data: Record<string, any>) {
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    repId: data.repId, repName: data.repDisplayName,
    annualQuota: number(data.quota?.annualQuota), bookedSales: number(data.bookedSales?.total),
    bookedCount: number(data.bookedSales?.count), averageSale: number(data.bookedSales?.avgSale),
    pipelineTotal: number(data.pipeline?.total), pipelineCount: number(data.pipeline?.count),
    closeRatePct: number(data.closeRate?.pct), ytdTotal: number(data.ytdTotal),
    previousYearTotal: number(data.prevYearTotal), allTimeTotal: number(data.allTimeTotal),
    runRate90Day: number(data.runRate90Day),
    monthlyTrend: Array.isArray(data.monthlyTrend) ? data.monthlyTrend.slice(0, 12).map((month: any) => ({ month: month.month, total: number(month.total), count: number(month.count) })) : [],
  };
}
