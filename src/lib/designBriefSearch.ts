import type { SupabaseClient } from '@supabase/supabase-js';

// Quote PostgREST values so names containing commas, quotes or parentheses
// cannot change the filter expression. Each word must match a name field.
export function nameFilters(query: string, fields: string[]): string[] {
  return query.trim().split(/[\s,]+/).filter(Boolean).map(token => {
    const literal = token.replace(/\\/g, '\\\\').replace(/[%_*]/g, char => `\\${char}`);
    const value = JSON.stringify(`%${literal}%`);
    return fields.map(field => `${field}.ilike.${value}`).join(',');
  });
}

export async function searchBriefCustomers(client: SupabaseClient, organizationId: string, query: string) {
  if (!organizationId) throw new Error('Organization profile required.');
  const contactFields = ['full_name', 'contact_name', 'first_name', 'last_name', 'company_name'];
  const leadFields = ['contact_name', 'company_name'];
  let contactsQuery = client.from('contacts')
    .select('id, contact_name, first_name, last_name, full_name, company_name, city, state, contact_type, is_prospect')
    .eq('organization_id', organizationId);
  let leadsQuery = client.from('leads').select('id, contact_name, company_name')
    .eq('organization_id', organizationId);
  for (const filter of nameFilters(query, contactFields)) contactsQuery = contactsQuery.or(filter);
  for (const filter of nameFilters(query, leadFields)) leadsQuery = leadsQuery.or(filter);
  const [contacts, leads] = await Promise.all([
    contactsQuery.order('contact_name').order('id').limit(30),
    leadsQuery.order('contact_name').order('id').limit(30),
  ]);
  return {
    contacts: [
      ...(contacts.data || []).map(c => ({ ...c, source: 'contact' as const })),
      ...(leads.data || []).map(c => ({ ...c, source: 'lead' as const, contact_type: 'lead' })),
    ],
    failed: !!contacts.error || !!leads.error,
    limited: contacts.data?.length === 30 || leads.data?.length === 30,
  };
}
