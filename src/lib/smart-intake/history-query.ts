import type { SupabaseClient } from '@supabase/supabase-js';

export type IntakeHistoryFilters = {
  organizationId: string;
  search?: string;
  channel?: 'email' | 'sms' | 'mms';
  status?: string;
  before?: string;
  limit?: number;
};

/** Caller must be authenticated and authorized for this organization.
 * Do not pass a service-role client to a browser or trust a client-supplied org ID.
 */
export async function listIntakeHistory(db: SupabaseClient, filters: IntakeHistoryFilters) {
  if (!filters.organizationId) throw new Error('Organization required');
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 100));
  let query = db.from('intake_items')
    .select('id,channel,source_address,destination_address,subject,status,classification,priority,created_at,last_activity_at,service_request_id,lead_id')
    .eq('organization_id', filters.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.channel) query = query.eq('channel', filters.channel);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.before) query = query.lt('created_at', filters.before);
  if (filters.search?.trim()) {
    const value = filters.search.trim().replace(/[%_,()]/g, '');
    if (value) query = query.or(['source_address.ilike.%' + value + '%','destination_address.ilike.%' + value + '%','subject.ilike.%' + value + '%'].join(','));
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
