// Read-only preflight against the deployed MJV schema. Not a source certificate.
// The trusted sender must separately verify original approval, change history,
// financial facts and a monotonic revision before invoking the v2 transport.
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hold = reason => ({ready:false,reason,source:null});
const sql = `WITH binding AS (
 SELECT c.connection_id,c.organization_id,c.sales_order_id,c.proposal_id,c.connection_generation,
        so.contact_id,so.status AS order_status,p.status AS proposal_status,
        p.approved_at,p.approval_completed_at,ct.full_name,ct.contact_name
 FROM techsafe_source.integration_connections c
 JOIN public.sales_orders so ON so.id=c.sales_order_id AND so.organization_id=c.organization_id AND so.proposal_id=c.proposal_id
 JOIN public.proposals p ON p.id=so.proposal_id AND p.organization_id=so.organization_id AND p.status='approved'
 JOIN public.contacts ct ON ct.id=so.contact_id AND ct.organization_id=so.organization_id
 WHERE c.connection_id=$1::uuid AND c.sales_order_id=$2::uuid AND c.enabled=true AND c.status='active'
), lines AS (
 SELECT li.id,li.product_id,li.item_type,li.quantity,li.unit_price,li.is_hidden,
        li.is_customer_supplied,li.parent_item_id,li.display_mode,li.description,
        pr.name AS product_name,pr.manufacturer,pr.model_number,pr.sku,pr.item_type AS catalog_item_type,
        pr.organization_id AS product_organization_id
 FROM public.proposal_line_items li
 JOIN binding b ON li.proposal_id=b.proposal_id AND li.organization_id=b.organization_id
 LEFT JOIN public.products pr ON pr.id=li.product_id
), changes AS (
 SELECT co.id,co.status,co.is_active,co.requires_customer_approval,co.customer_approved,
        co.approval_date,co.updated_at
 FROM public.change_orders co JOIN binding b ON co.sales_order_id=b.sales_order_id AND co.organization_id=b.organization_id
)
SELECT to_jsonb(b) AS binding,
 (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM lines l) AS lines,
 (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM changes c) AS changes,
 (SELECT count(*) FROM lines) AS line_count,
 (SELECT count(*) FROM changes) AS change_count
FROM binding b`;
export function createLiveSalesOrderPreflight(client){
 if(!client || typeof client.query!=='function')throw new TypeError('private_postgres_client_required');
 return async function inspect({connectionId,orderId}={}){
  if(!uuid(connectionId)||!uuid(orderId))return hold('invalid_binding');
  let rows;
  try{({rows}=await client.query(sql,[connectionId,orderId]));}catch{return hold('source_read_failed');}
  if(rows?.length!==1)return hold('connection_or_approved_order_unavailable');
  const record=rows[0],b=record.binding,lines=record.lines,changes=record.changes;
  if(!b||b.connection_id!==connectionId||b.sales_order_id!==orderId||b.proposal_status!=='approved'||
     !Array.isArray(lines)||!Array.isArray(changes)||lines.length>10000||changes.length>1000||
     Number(record.line_count)!==lines.length||Number(record.change_count)!==changes.length)
   return hold('source_incomplete');
  if(!b.approved_at&&!b.approval_completed_at)return hold('approval_evidence_unavailable');
  if(!String(b.full_name||b.contact_name||'').trim())return hold('customer_name_unavailable');
  const allowedChanges=new Set(['draft','pending_approval','approved','completed']);
  if(changes.some(c=>!allowedChanges.has(c.status)))return hold('change_order_state_unknown');
  // MJV applies approved changes into existing proposal_line_items. Drafts
  // are not sold equipment and must not block the approved current order.
  if(changes.some(c=>['approved','completed'].includes(c.status)&&
      (c.is_active!==false||!c.approval_date||
       (c.requires_customer_approval===true&&c.customer_approved!==true))))
   return hold('change_order_application_unverified');
  if(lines.some(l=>l.product_id&&l.product_organization_id!==b.organization_id))
   return hold('cross_tenant_product');
  if(lines.some(l=>l.quantity===null||!Number.isInteger(Number(l.quantity))||Number(l.quantity)<0||
      Number(l.quantity)>10000||l.unit_price===null||Number(l.unit_price)<0))
   return hold('line_price_or_quantity_unresolved');
  // This is only a source observation; never emit verified/snapshotReady or send it.
  return {ready:false,reason:'source_certificate_and_revision_required',source:{binding:b,lines,changes}};
 };
}
