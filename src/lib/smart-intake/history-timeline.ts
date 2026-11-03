import type { SupabaseClient } from '@supabase/supabase-js';

/** Scoped history detail. Authorization must be enforced by RLS and caller membership. */
export async function loadIntakeTimeline(db: SupabaseClient, organizationId: string, intakeId: string) {
  if (!organizationId || !intakeId) throw new Error('Organization and intake ID required');
  const { data: item, error: itemError } = await db.from('intake_items')
    .select('id,organization_id,channel,source_address,destination_address,subject,raw_body,status,classification,priority,created_at,service_request_id,lead_id,contact_id,missing_fields')
    .eq('organization_id', organizationId).eq('id', intakeId).single();
  if (itemError) throw itemError;
  const [messages, events, attempts, delivery] = await Promise.all([
    db.from('intake_messages').select('id,direction,sender_address,body,created_at').eq('intake_id', item.id).order('created_at'),
    db.from('intake_events').select('id,actor_type,event_type,detail,created_at').eq('intake_id', item.id).order('created_at'),
    db.from('intake_processing_attempts').select('id,attempt_number,outcome,reason_code,created_at').eq('intake_id', item.id).order('created_at'),
    db.from('intake_delivery_events').select('id,event_kind,delivery_status,occurred_at').eq('intake_id', item.id).order('occurred_at'),
  ]);
  for (const result of [messages, events, attempts, delivery]) if (result.error) throw result.error;
  return { item, messages: messages.data ?? [], events: events.data ?? [], attempts: attempts.data ?? [], delivery: delivery.data ?? [] };
}
