import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Bridge processed voicemail into MJV's existing Flow event and notification tables.
 * Never expose transcripts or recordings in notification bodies.
 * This is a best-effort delivery: failed handoff is logged for reconciliation.
 * A database uniqueness constraint on (source_table, source_id, event_type)
 * is required before enabling live ingestion to guarantee concurrency safety.
 */
export async function publishVoicemailToFlow(
  db: SupabaseClient,
  input: { id: string; organizationId: string; department: string | null;
    summary: string | null; state: 'ready' | 'review' | 'quarantined'; urgent: boolean },
): Promise<void> {
  if (input.state === 'quarantined') return;
  const eventType = 'voicemail_messages.processed';
  const { data: existing, error: lookupError } = await db.from('flow_events')
    .select('id').eq('organization_id', input.organizationId)
    .eq('source_table', 'voicemail_messages').eq('source_id', input.id)
    .eq('event_type', eventType).limit(1);
  if (lookupError) throw Error('voicemail_flow_lookup_failed');
  if (!existing?.length) {

  const department = input.department ?? 'Unclassified';
  const { error: eventError } = await db.from('flow_events').insert({
    organization_id: input.organizationId,
    category: 'service',
    event_type: eventType,
    summary: input.urgent ? 'Urgent voicemail needs attention' : 'New voicemail needs attention',
    details: `Department: ${department}; status: ${input.state}. Review the Phone Voicemail inbox.`,
    source_table: 'voicemail_messages',
    source_id: input.id,
    required_module: 'feed',
    is_internal: true,
  });
  if (eventError && eventError.code !== '23505') throw Error('voicemail_flow_insert_failed');
  }

  // Department grants are the only source of notification recipients. Do not
  // guess recipients based on a receiving RingCentral mailbox.
  if (input.state !== 'ready' || !input.department) return;
  const { data: recipients, error: recipientsError } = await db.from('phone_voicemail_department_access')
    .select('user_id').eq('organization_id', input.organizationId)
    .eq('department', input.department);
  if (recipientsError) throw Error('voicemail_recipient_lookup_failed');
  if (!recipients?.length) return;
  const { data: alreadyNotified, error: notifiedError } = await db.from('notifications')
    .select('user_id').eq('organization_id', input.organizationId)
    .eq('related_id', input.id).eq('type', 'phone_voicemail');
  if (notifiedError) throw Error('voicemail_notification_lookup_failed');
  const notified = new Set((alreadyNotified ?? []).map(({ user_id }) => user_id));
  const pending = recipients.filter(({ user_id }) => !notified.has(user_id));
  if (!pending.length) return;
  for (const { user_id } of pending) {
    const { error: notificationError } = await db.from('notifications').insert({
      organization_id: input.organizationId, user_id, type: 'phone_voicemail',
      title: input.urgent ? 'Urgent voicemail' : 'New department voicemail',
      body: `A ${input.department} voicemail is ready for review in MJV.`,
      related_id: input.id,
    });
    if (notificationError && notificationError.code !== '23505') throw Error('voicemail_notification_insert_failed');
  }
}
