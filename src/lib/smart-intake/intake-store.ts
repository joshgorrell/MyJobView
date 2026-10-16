import type { SupabaseClient } from '@supabase/supabase-js';

export interface IncomingIntake {
  organizationId: string;
  officeId?: string | null;
  channel: 'email' | 'sms' | 'mms';
  provider: string;
  providerEventId: string;
  sender: string;
  destination: string;
  subject?: string | null;
  body?: string | null;
}

/**
 * Called only after authenticating the provider and resolving the destination
 * to a verified dealer. Does not create contacts, leads, or service requests.
 */
export async function persistIncomingIntake(db: SupabaseClient, input: IncomingIntake) {
  if (!input.organizationId || !input.providerEventId || !input.destination) {
    throw new Error('Missing verified intake identifiers');
  }
  const payload = {
    organization_id: input.organizationId,
    office_id: input.officeId ?? null,
    channel: input.channel,
    provider: input.provider,
    provider_event_id: input.providerEventId,
    source_address: input.sender,
    destination_address: input.destination,
    subject: input.subject ?? null,
    raw_body: input.body ?? null,
    status: 'received',
  };
  const { data, error } = await db
    .from('intake_items')
    .upsert(payload, {
      onConflict: 'organization_id,channel,provider,provider_event_id',
      ignoreDuplicates: true,
    })
    .select('id, status')
    .maybeSingle();
  if (error) throw error;
  if (data) return { id: data.id as string, status: data.status as string, duplicate: false };
  const existing = await db.from('intake_items')
    .select('id, status')
    .eq('organization_id', input.organizationId)
    .eq('channel', input.channel)
    .eq('provider', input.provider)
    .eq('provider_event_id', input.providerEventId)
    .single();
  if (existing.error || !existing.data) throw existing.error ?? new Error('Intake lookup failed');
  return { id: existing.data.id as string, status: existing.data.status as string, duplicate: true };
}
