import type { SupabaseClient } from '@supabase/supabase-js';

const OPEN_STATUSES = ['received', 'analyzing', 'awaiting_customer', 'awaiting_employee', 'needs_review', 'ready', 'failed_retryable'];

/** For use by an authenticated server route with verified organization membership. */
export async function listOpenIntake(
  db: SupabaseClient,
  organizationId: string,
  limit = 50,
) {
  if (!organizationId) throw new Error('Organization required');
  const { data, error } = await db.from('intake_items')
    .select('id, organization_id, channel, source_address, subject, status, classification, priority, created_at, last_activity_at')
    .eq('organization_id', organizationId)
    .in('status', OPEN_STATUSES)
    .order('last_activity_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}
