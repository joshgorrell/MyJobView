import {normalizeSoldEquipmentItems} from './normalizeSoldEquipmentItems.mjs';
// Trusted server-only reader. No writes, credentials, or delivery authority.
// Reads the current approved Sales Order's committed proposal lines, including
// custom sold items with no catalog ID. Unreconciled legacy changes hold the snapshot.
const uuid = x => typeof x==='string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const held = reason => ({ready:false,reason,items:[]});
export function createTechsafeCustomSoldScopeReader(client) {
  if (!client || typeof client.query !== 'function') throw TypeError('trusted_postgres_client_required');
  return async ({connectionId,orderId,minimumEligibleUnitPrice=0}={}) => {
    if (!uuid(connectionId) || !uuid(orderId)) return held('invalid_binding');
    let connection, lines, pending;
    try {
      const result=await client.query(`SELECT c.organization_id,c.proposal_id,c.sales_order_id,c.enabled,c.status,
        so.proposal_id actual_proposal_id,p.status approval_status,
        p.approved_at,p.approval_completed_at
        FROM techsafe_source.integration_connections c
        JOIN public.sales_orders so ON so.id=c.sales_order_id AND so.organization_id=c.organization_id
        JOIN public.proposals p ON p.id=so.proposal_id AND p.organization_id=c.organization_id
        WHERE c.connection_id=$1 AND c.sales_order_id=$2`,[connectionId,orderId]);
      if(result.rows?.length!==1) return held('connection_not_found');
      connection=result.rows[0];
      if(connection.enabled!==true || connection.status!=='active') return held('connection_not_active');
      if(connection.proposal_id!==connection.actual_proposal_id || connection.approval_status!=='approved' ||
        !(connection.approved_at || connection.approval_completed_at)) return held('sales_order_not_approved');
      // Fail closed until every approved change has a committed representation.
      pending=await client.query(`SELECT count(*)::int AS count FROM public.change_orders co
        WHERE co.sales_order_id=$1 AND co.organization_id=$2
          AND co.status='approved' AND (
            co.is_locked IS DISTINCT FROM true OR co.is_active IS DISTINCT FROM false OR
            EXISTS (SELECT 1 FROM public.change_order_line_items li
              WHERE li.change_order_id=co.id AND li.organization_id=co.organization_id
                AND li.action_type='add' AND NOT EXISTS (
                  SELECT 1 FROM public.proposal_line_items pli
                  WHERE pli.organization_id=co.organization_id AND pli.proposal_id=$3
                    AND pli.committed_change_order_line_id=li.id)))`,
        [orderId,connection.organization_id,connection.proposal_id]);
      if(Number(pending.rows?.[0]?.count)!==0) return held('approved_change_scope_unreconciled');
      lines=await client.query(`SELECT id AS \"lineId\",product_id AS \"productId\",description,
          quantity,unit_price AS \"unitPrice\",COALESCE(labor_total,0) AS \"soldLabor\",
          COALESCE(is_customer_supplied,false) AS customer_supplied,item_type
        FROM public.proposal_line_items
        WHERE proposal_id=$1 AND organization_id=$2
          AND COALESCE(item_type,'part')<>'labor' AND quantity>0
        ORDER BY id`,[connection.proposal_id,connection.organization_id]);
    } catch {return held('source_query_failed');}
    try {
      const items=normalizeSoldEquipmentItems(lines.rows.map(line=>({
        ...line,minimumEligibleUnitPrice,
        // Customer-supplied equipment isn't dealer-sold product.
        sold:line.customer_supplied!==true
      })));
      return {ready:true,reason:null,items,
        eligibleItems:items.filter(item=>item.eligibleByUnitMinimum),
        equipmentCents:items.reduce((n,item)=>n+item.equipmentTotalCents,0),
        equipmentLinkedLaborCents:items.reduce((n,item)=>n+item.soldLaborCents,0)};
    } catch {return held('invalid_committed_equipment_scope');}
  };
}
