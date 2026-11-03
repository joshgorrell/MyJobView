import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveIntakeDestination(db: SupabaseClient, channel: 'email' | 'sms' | 'mms', recipient: string) {
  if (!recipient.trim()) throw new Error('Missing recipient');
  const { data, error } = await db.from('intake_destinations').select('organization_id,office_id').eq('channel', channel).eq('destination_address', recipient.trim().toLowerCase()).eq('enabled', true);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error('Recipient is not mapped to exactly one dealer');
  return { organizationId: data[0].organization_id, officeId: data[0].office_id };
}
