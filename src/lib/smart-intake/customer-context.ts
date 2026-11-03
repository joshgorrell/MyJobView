import type { SupabaseClient } from '@supabase/supabase-js';

export type IntakeCustomerContext = {
  id: string;
  name: string;
  email: string | null;
};

/** Identify an existing customer for triage, before any service request or work order exists. */
export async function loadIntakeCustomerContext(
  db: SupabaseClient, organizationId: string, contactId: string | null,
): Promise<IntakeCustomerContext | null> {
  if (!organizationId || !contactId) return null;
  const { data: contact, error } = await db.from('contacts')
    .select('id,company_name,contact_name,email')
    .eq('organization_id', organizationId).eq('id', contactId).maybeSingle();
  if (error) throw error;
  if (!contact) return null;
  return {
    id: contact.id,
    name: contact.company_name || contact.contact_name || contact.email || 'Customer',
    email: contact.email ?? null,
  };
}
