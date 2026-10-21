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
export function useSalesDashboardRecords(repId: string | null, organizationId: string | undefined, refreshKey: number, allSales = false) {
  const [state, setState] = useState<{ source: SalesSources | null; loading: boolean; error: string | null; scope: string }>({ source: null, loading: true, error: null, scope: '' });
  const scope = `${organizationId}:${allSales ? "all" : repId}`;
  useEffect(() => {
    let cancelled = false;
    if ((!repId && !allSales) || !organizationId) return;
    setState({ source: null, loading: true, error: null, scope });
    const scoped = (table: string, columns: string) => supabase.from(table).select(columns).eq('organization_id', organizationId);
    const forRep = (query: any, column: string) => allSales ? query : query.eq(column, repId);
    const forRepOr = (query: any, filter: string) => allSales ? query : query.or(filter);
    void Promise.all([
      getOrganizationTimezone(organizationId),
      readAllSalesRows(() => forRep(scoped('proposals', 'id,proposal_number,title,status,total,created_at,sent_at,approved_at,declined_at,decline_reason,decline_notes,declined_by,archived_loss_status,expires_at,valid_until,contact:contacts!proposals_contact_id_fkey(full_name,company_name)'), 'created_by')),
      readAllSalesRows(() => forRep(scoped('leads', 'id,company_name,contact_name,status,priority,estimated_value,created_at,last_contact_date,reminder_date'), 'assigned_to')),
      readAllSalesRows(() => forRepOr(scoped('contacts', 'id,full_name,company_name,contact_type,created_at,created_by,assigned_to,next_follow_up'), `created_by.eq.${repId},assigned_to.eq.${repId}`)),
      readAllSalesRows(() => forRep(scoped('connections', 'id,connection_type,connection_date,notes,reminder_date,follow_up_needed,completed_at,contact:contacts!connections_contact_id_fkey(full_name,company_name)'), 'user_id')),
      readAllSalesRows(() => forRepOr(scoped('sales_orders', 'id,sales_rep_id,created_by,order_number,status,booked_at,created_at,contract_total,contact:contacts(full_name,company_name)'), `sales_rep_id.eq.${repId},and(sales_rep_id.is.null,created_by.eq.${repId})`)),
      readAllSalesRows(() => forRep(scoped('sales_monthly_stats', 'id,user_id,year,month,total_sales,sales_order_count'), 'user_id')),
      readAllSalesRows(() => forRep(scoped('scheduled_connection_occurrences', 'id,prospect_id,scheduled_date,contact:contacts!scheduled_connection_occurrences_prospect_id_fkey(full_name,company_name),schedule:scheduled_connections!inner(created_by_user_id,default_notes)'), 'schedule.created_by_user_id').eq('is_completed', false).eq('is_skipped', false)),
    ]).then(([timezone, proposals, leads, contacts, connections, orders, months, occurrences]) => {
      if (!cancelled) setState({ source: { proposals, leads: leads.map(l => ({ ...l, next_follow_up: l.reminder_date })), contacts: contacts.map(c => ({ ...c, createdByRep: (allSales || c.created_by === repId), assignedToRep: (allSales || c.assigned_to === repId) })), connections, orders, months, occurrences, timezone }, loading: false, error: null, scope });
    }).catch(error => { if (!cancelled) setState({ source: null, loading: false, error: error.message || 'Unable to load sales records', scope }); });
    return () => { cancelled = true; };
  }, [repId, organizationId, refreshKey, scope, allSales]);
  return state.scope === scope ? state : { source: null, loading: true, error: null, scope };
}
