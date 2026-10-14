import type { SupabaseClient } from '@supabase/supabase-js';

export type IntakeCustomerContext = {
  id: string;
  name: string;
  email: string | null;
  suggestedWorkOrders: { id: string; label: string; status: string }[];
};

/** Read-only customer context. Never infer an attachment's owner from its filename. */
export async function loadIntakeCustomerContext(
  db: SupabaseClient, organizationId: string, contactId: string | null,
): Promise<IntakeCustomerContext | null> {
  if (!organizationId || !contactId) return null;
  const { data: contact, error } = await db.from('contacts')
    .select('id,company_name,contact_name,email')
    .eq('organization_id', organizationId).eq('id', contactId).maybeSingle();
  if (error) throw error;
  if (!contact) return null;
  const { data: orders, error: ordersError } = await db.from('work_orders')
    .select('id,work_order_number,title,status')
    .eq('organization_id', organizationId).eq('contact_id', contact.id)
    .order('created_at', { ascending: false }).limit(10);
  if (ordersError) throw ordersError;
  return {
    id: contact.id,
    name: contact.company_name || contact.contact_name || contact.email || 'Customer',
    email: contact.email ?? null,
    suggestedWorkOrders: (orders ?? []).map(order => ({
      id: order.id,
      label: [order.work_order_number, order.title].filter(Boolean).join(' · ') || 'Work order',
      status: order.status || 'Unknown',
    })),
  };
}
