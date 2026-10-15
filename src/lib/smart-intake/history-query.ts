import type { SupabaseClient } from '@supabase/supabase-js';

export type IntakeHistoryFilters = {
  organizationId: string;
  search?: string;
  channel?: 'email' | 'sms' | 'mms';
  status?: string;
  unmatchedOnly?: boolean;
  statuses?: string[];
  before?: string;
  from?: string;
  to?: string;
  limit?: number;
};

/** Caller must be authenticated and authorized for this organization.
 * Do not pass a service-role client to a browser or trust a client-supplied org ID.
 */
export async function listIntakeHistory(db: SupabaseClient, filters: IntakeHistoryFilters) {
  if (!filters.organizationId) throw new Error('Organization required');
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 100));
  let query = db.from('intake_items')
    .select('id,channel,source_address,destination_address,subject,status,classification,priority,created_at,last_activity_at,service_request_id,lead_id,contact_id')
    .eq('organization_id', filters.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.unmatchedOnly) query = query.is('contact_id', null).in('status', ['received','analyzing','awaiting_customer','awaiting_employee','needs_review','failed_retryable']);
  if (filters.channel) query = query.eq('channel', filters.channel);
  if (filters.status) query = query.eq('status', filters.status);
  else if (filters.statuses?.length) query = query.in('status', filters.statuses);
  if (filters.before) {
    if (!Number.isFinite(Date.parse(filters.before))) throw new Error('Invalid pagination timestamp');
    query = query.lt('created_at', filters.before);
  }
  if (filters.from && (!/^\d{4}-\d{2}-\d{2}$/.test(filters.from) || !Number.isFinite(Date.parse(filters.from + 'T00:00:00.000Z')))) throw new Error('Invalid start date');
  if (filters.to && (!/^\d{4}-\d{2}-\d{2}$/.test(filters.to) || !Number.isFinite(Date.parse(filters.to + 'T00:00:00.000Z')))) throw new Error('Invalid end date');
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('Invalid date range');
  if (filters.from) query = query.gte('created_at', filters.from + 'T00:00:00.000Z');
  if (filters.to) query = query.lt('created_at', new Date(Date.parse(filters.to + 'T00:00:00.000Z') + 86400000).toISOString());
  if (filters.search?.trim()) {
    const value = filters.search.trim().replace(/[%_,()]/g, '');
    if (value) query = query.or(['source_address.ilike.%' + value + '%','destination_address.ilike.%' + value + '%','subject.ilike.%' + value + '%'].join(','));
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
