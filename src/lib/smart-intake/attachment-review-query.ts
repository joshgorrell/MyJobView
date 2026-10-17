import type { SupabaseClient } from '@supabase/supabase-js';

export type IntakeAttachmentReview = {
  id: string;
  intake_message_id: string;
  original_filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  scan_status: 'pending' | 'clean' | 'blocked' | 'failed';
  disposition: 'pending' | 'discarded' | 'customer_media' | 'work_order' | 'both';
  expires_at: string;
  created_at: string;
};

/** Metadata only. Quarantine storage paths and signed download URLs are never exposed. */
export async function listIntakeAttachmentReviews(
  db: SupabaseClient,
  organizationId: string,
  intakeId: string,
): Promise<IntakeAttachmentReview[]> {
  if (!organizationId || !intakeId) throw new Error('Organization and intake required');
  // Check parent in the caller's RLS-scoped organization first.
  const { data: parent, error: parentError } = await db.from('intake_items')
    .select('id').eq('id', intakeId).eq('organization_id', organizationId).maybeSingle();
  if (parentError) throw parentError;
  if (!parent) throw new Error('Intake not found or access denied');
  const { data: messages, error: messagesError } = await db.from('intake_messages')
    .select('id').eq('intake_id', intakeId).limit(100);
  if (messagesError) throw messagesError;
  const ids = (messages ?? []).map(message => message.id);
  if (!ids.length) return [];
  const { data, error } = await db.from('intake_attachments')
    .select('id,intake_message_id,original_filename,mime_type,byte_size,scan_status,disposition,expires_at,created_at')
    .in('intake_message_id', ids).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []) as IntakeAttachmentReview[];
}
