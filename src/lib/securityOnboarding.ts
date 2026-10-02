import { supabase } from './supabase';

// Initial commitment is independent of the month-to-month renewal interval.
export const SECURITY_INITIAL_TERMS: readonly number[] = [12, 24, 36, 48, 60];

export interface SecurityDraftForm {
  personalInfo: { full_name: string; email: string; phone: string };
  propertyInfo: { address_line1: string; city: string; state: string; zip_code: string };
  emergencyContacts: { name: string; phone: string; password: string; canAuthorize: boolean }[];
  paymentMethod: string;
  paymentMethodId: string;
  signature: string;
}

export interface SecurityAgreementDocument {
  contract_number: string;
  monthly_price: number;
  term_months: number;
  renewal_term_months: number | null;
  cancellation_notice_days: number | null;
  template: { name: string; contract_terms: string } | null;
  dealer: {
    company_name: string; company_email: string;
    annual_billing_enabled: boolean; default_billing_preference: 'monthly' | 'annual';
    annual_discount_type: 'percentage' | 'flat'; annual_discount_percentage: number;
    annual_discount_flat_amount: number;
  } | null;
  services: { name: string; monthly_price: number }[];
  personalInfo?: SecurityDraftForm['personalInfo'];
  propertyInfo?: SecurityDraftForm['propertyInfo'];
  paymentMethod?: string;
  billingPreference?: 'monthly' | 'annual';
  accepted_at?: string;
  staff_corrected_at?: string;
  billing_mode: 'autopay' | 'mail';
  mail_invoice_fee: number;
  payment_display?: string;
  autopay_authorization?: string;
}

export interface SecurityContractSummary {
  monthly_price: number; amount_due: number | null; pending_payment_amount: number;
  start_date: string | null; initial_term_end: string | null; term_months: number;
  months_remaining: number | null; initial_term_complete: boolean; renewal_term_months: number | null;
  next_debit_at: string | null; billing_frequency: string; billing_mode: 'autopay' | 'mail';
  mail_invoice_fee: number; autopay_paused: boolean; autopay_revoked_at: string | null;
  latest_billing_status: string | null;
  invoices: { number: string; status: string; total: number; amount_due: number; due_date: string; payment_status: string }[];
}

export interface PortalSecurityAgreement {
  summary?: SecurityContractSummary | null; portal_module_enabled?: boolean;
  id: string; status: string; contact: SecurityDraftForm['personalInfo'] & SecurityDraftForm['propertyInfo'];
  document: SecurityAgreementDocument; document_version: string;
  signed_snapshot_available: boolean; customer_signature: string | null;
  customer_signature_date: string | null; customer_completed_at: string | null;
  draft: { form_data: (SecurityDraftForm & { billingPreference?: 'monthly' | 'annual' }) | null;
    current_step: number; revision: number; saved_at: string | null } | null;
}

export interface SecurityPaymentMethod {
  id: string; payment_type: 'card' | 'ach'; display_brand: string; display_last4: string;
  exp_month: number | null; exp_year: number | null;
}

export async function securityPaymentRequest<T>(action: 'list' | 'add' | 'verify', contractId: string, token: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('security-payment-methods', { body: { action, contractId, token, ...payload } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface SecurityAgreementListItem {
  summary?: SecurityContractSummary;
  id: string; contract_number: string; status: string; monthly_price: number;
  customer_completed_at: string | null; saved_at: string | null; current_step: number;
}

export async function securityOnboardingRequest<T>(
  action: 'list' | 'get' | 'save' | 'submit' | 'revoke_autopay', contractId?: string, token?: string, payload?: unknown
): Promise<T> {
  const { data, error } = await supabase.rpc('portal_security_onboarding', {
    p_action: action, p_contract_id: contractId || null, p_token: token || null, p_payload: payload || {},
  });
  if (error) throw new Error(error.message);
  return data as T;
}

export async function staffSecurityOnboarding<T>(action: 'create' | 'edit' | 'get' | 'paper' | 'review' | 'approve' | 'activate' | 'reject', contractId?: string, payload: unknown = {}): Promise<T> {
  const { data, error } = await supabase.rpc('staff_security_onboarding', { p_action: action, p_id: contractId || null, p_payload: payload });
  if (error) throw new Error(error.message);
  return data as T;
}

const invitationRequests = new Map<string, string>();

export async function sendSecurityInvitation(contractId: string): Promise<void> {
  const requestId = invitationRequests.get(contractId) || crypto.randomUUID();
  invitationRequests.set(contractId, requestId);
  const { data, error } = await supabase.functions.invoke('send-contract-invitation', { body: { contractId, requestId, appOrigin: window.location.origin } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (!data?.success) throw new Error(data?.error || 'Invitation could not be sent.');
  invitationRequests.delete(contractId);
}
