import { supabase } from './supabase';

export interface ServiceApprovalFields {
  service_approval_required?: boolean;
  service_terms?: string;
  service_accepted_at?: string | null;
  service_accepted_by?: string | null;
  service_payment_method_id?: string | null;
  service_waived_at?: string | null;
  service_waived_by?: string | null;
  service_waiver_reason?: string | null;
  service_waived_by_profile?: {full_name: string} | null;
}
export function serviceApprovalPending(request: ServiceApprovalFields): boolean {
  return !!request.service_approval_required && !request.service_waived_at &&
    (!request.service_accepted_at || !request.service_payment_method_id);
}
export async function servicePaymentRequest<T>(action: 'list' | 'add' | 'verify', requestId: string, token: string, payload: Record<string, unknown> = {}): Promise<T> {
  const {data,error} = await supabase.functions.invoke('service-approval-payment-methods', {body:{action,requestId,token,...payload}});
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
const deliveries = new Map<string,string>();
export async function sendServiceApproval(requestId: string): Promise<void> {
  const deliveryId = deliveries.get(requestId) || crypto.randomUUID();
  deliveries.set(requestId,deliveryId);
  const {data,error} = await supabase.functions.invoke('send-service-approval', {body:{requestId,deliveryId}});
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (!data?.success) throw new Error(data?.error || 'Request email could not be sent');
  deliveries.delete(requestId);
}
