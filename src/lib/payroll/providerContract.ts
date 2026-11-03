/**
 * Provider-independent payroll integration boundary.
 * No browser-side Paylocity credentials or API requests.
 * The dealer tenant must be derived from the authenticated server context.
 */
export type PayrollProvider = 'paylocity';
export type PayrollIntegrationMode = 'disabled' | 'sandbox' | 'production';
export type PayrollSyncStatus = 'pending' | 'submitted' | 'needs_review' | 'reconciled';

export interface PayrollProviderConnection {
  tenantId: string;
  provider: PayrollProvider;
  mode: PayrollIntegrationMode;
  externalCompanyId: string;
  enabledCapabilities: Array<'employee_read' | 'punch_import' | 'pto_read' | 'pto_write'>;
}

export interface PayrollEmployeeMapping {
  tenantId: string;
  employeeId: string;
  provider: PayrollProvider;
  externalCompanyId: string;
  /** Paylocity Time & Labor employee number; may differ from HR/payroll employee ID. */
  externalTimeLaborEmployeeId: string;
  externalPayrollEmployeeId?: string;
  verifiedAt?: string;
}

export interface FinalizedPayrollPunch {
  id: string;
  tenantId: string;
  employeeId: string;
  workDate: string;
  timestamp: string;
  kind: 'in' | 'out' | 'lunch_start' | 'lunch_end';
  approved: true;
  /** Immutable source revision, used for reconciliation and idempotency. */
  sourceRevision: string;
}

export interface PayrollSubmissionBatch {
  id: string;
  tenantId: string;
  provider: PayrollProvider;
  externalCompanyId: string;
  mode: Exclude<PayrollIntegrationMode, 'disabled'>;
  status: PayrollSyncStatus;
  sourceFingerprint: string;
  punches: FinalizedPayrollPunch[];
}

export const PAYLOCITY_MAX_PUNCH_RECORDS = 500;

/** Only validated, approved time may be queued. No actual API call occurs here. */
export function validatePayrollBatch(batch: PayrollSubmissionBatch): string[] {
  const errors: string[] = [];
  if (!batch.tenantId || !batch.externalCompanyId) errors.push('Missing tenant or provider company mapping');
  if (batch.provider !== 'paylocity') errors.push('Unsupported provider');
  if (batch.punches.length === 0 || batch.punches.length > PAYLOCITY_MAX_PUNCH_RECORDS) errors.push('Punch batch must contain 1–500 records');
  if (!batch.sourceFingerprint) errors.push('Missing idempotency fingerprint');
  for (const punch of batch.punches) {
    if (punch.tenantId !== batch.tenantId) errors.push('Cross-tenant punch rejected');
    if (punch.approved !== true) errors.push('Unapproved punch rejected');
    if (!punch.employeeId || !punch.id || !punch.sourceRevision) errors.push('Incomplete source punch');
    if (!Number.isFinite(Date.parse(punch.timestamp))) errors.push('Invalid punch timestamp');
  }
  return [...new Set(errors)];
}
