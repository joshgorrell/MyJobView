import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrganizationTimezone } from '../lib/timezoneUtils';
import type { SalesSources } from '../lib/salesDashboardRecords';

// Page through results instead of silently truncating statistics at the API row limit.
export async function readAllSalesRows(query: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query().order('id').range(offset, offset + 499);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export function useSalesDashboardRecords(repId: string | null, organizationId: string | undefined, refreshKey: number) {
  const [state, setState] = useState<{ source: SalesSources | null; loading: boolean; error: string | null; scope: string }>({ source: null, loading: true, error: null, scope: '' });
  const scope = `${organizationId}:${repId}`;
  useEffect(() => {
    let cancelled = false;
    if (!repId || !organizationId) return;
    setState({ source: null, loading: true, error: null, scope });
    const scoped = (table: string, columns: string) => supabase.from(table).select(columns).eq('organization_id', organizationId);
    void Promise.all([
      getOrganizationTimezone(organizationId),
      readAllSalesRows(() => scoped('proposals', '*,contact:contacts!proposals_contact_id_fkey(full_name,company_name)').eq('created_by', repId)),
      readAllSalesRows(() => scoped('leads', 'id,company_name,contact_name,status,priority,estimated_value,created_at,last_contact_date,reminder_date').eq('assigned_to', repId)),
      readAllSalesRows(() => scoped('contacts', 'id,full_name,company_name,contact_type,created_at,created_by,assigned_to,next_follow_up').or(`created_by.eq.${repId},assigned_to.eq.${repId}`)),
      readAllSalesRows(() => scoped('connections', 'id,connection_type,connection_date,notes,reminder_date,follow_up_needed,completed_at,contact:contacts!connections_contact_id_fkey(full_name,company_name)').eq('user_id', repId)),
      readAllSalesRows(() => scoped('sales_orders', 'id,order_number,status,booked_at,created_at,contract_total,contact:contacts(full_name,company_name)').or(`sales_rep_id.eq.${repId},and(sales_rep_id.is.null,created_by.eq.${repId})`)),
      readAllSalesRows(() => scoped('sales_monthly_stats', 'id,year,month,total_sales,sales_order_count').eq('user_id', repId)),
      readAllSalesRows(() => scoped('scheduled_connection_occurrences', 'id,prospect_id,scheduled_date,contact:contacts!scheduled_connection_occurrences_prospect_id_fkey(full_name,company_name),schedule:scheduled_connections!inner(created_by_user_id,default_notes)').eq('schedule.created_by_user_id', repId).eq('is_completed', false).eq('is_skipped', false)),
    ]).then(([timezone, proposals, leads, contacts, connections, orders, months, occurrences]) => {
      if (!cancelled) setState({ source: { proposals, leads: leads.map(l => ({ ...l, next_follow_up: l.reminder_date })), contacts: contacts.map(c => ({ ...c, createdByRep: c.created_by === repId, assignedToRep: c.assigned_to === repId })), connections, orders, months, occurrences, timezone }, loading: false, error: null, scope });
    }).catch(error => { if (!cancelled) setState({ source: null, loading: false, error: error.message || 'Unable to load sales records', scope }); });
    return () => { cancelled = true; };
  }, [repId, organizationId, refreshKey, scope]);
  return state.scope === scope ? state : { source: null, loading: true, error: null, scope };
}
