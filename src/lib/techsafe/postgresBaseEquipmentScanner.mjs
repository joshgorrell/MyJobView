// Private, read-only PostgreSQL scanner for CURRENT Sales Order equipment.
// public.apply_change_order mutates proposal_line_items: these are NOT an
// original pre-change baseline. Does not attest approval or history.
// Its output must NEVER be passed as a certified sourceManifest.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const safeCount=x=>Number.isSafeInteger(x)&&x>=0&&x<=10000;
const quantity=x=>{
 if(typeof x!=='number'&&typeof x!=='string')return null;
 if(!/^\d{1,5}(?:\.0{1,6})?$/.test(String(x)))return null;
 const n=Number(x);return safeCount(n)?n:null;
};
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createPostgresBaseEquipmentScanner(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return hold('invalid_source_scope');
  // Actual Sales Order record, never the unapproved proposal alone.
  const order=await client.query(
   `SELECT id,organization_id,proposal_id FROM public.sales_orders
     WHERE id=$1 AND organization_id=$2 AND proposal_id=$3 FOR SHARE`,
   [orderId,organizationId,proposalId]);
  if(order.rows?.length!==1||order.rows[0]?.id!==orderId||
     order.rows[0]?.organization_id!==organizationId||
     order.rows[0]?.proposal_id!==proposalId)
   return hold('sales_order_scope_unverified');
  // The approved Sales Order references proposal_line_items through proposal_id.
  // Read all CURRENT lines; no product filtering that could conceal data.
  const lines=await client.query(
   `SELECT * FROM public.proposal_line_items
     WHERE organization_id=$1 AND proposal_id=$2 ORDER BY id FOR SHARE`,
   [organizationId,proposalId]);
  if(!Array.isArray(lines.rows)||!safeCount(lines.rows.length))
   return hold('base_equipment_count_invalid');
  const seen=new Set(),baseLines=[];
  for(const line of lines.rows){
   const count=quantity(line.quantity);
   if(!uuid(line.id)||seen.has(line.id)||line.organization_id!==organizationId||
      line.proposal_id!==proposalId||(line.product_id!==null&&!uuid(line.product_id))||
      count===null)
    return hold('base_equipment_row_unverified');
   seen.add(line.id);
   baseLines.push(Object.freeze({id:line.id,organizationId,proposalId,
    productId:line.product_id,quantity:count}));
  }
  // This is intentionally NOT readConsistentSource. An authoritative reader
  // must independently prove approval, exhaustive change orders, revisions,
  // full equipment details and a transaction-consistent source manifest.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'current_lines_read_approval_and_change_orders_unverified',
   baseLinesAreCurrent:true,baseLineSource:'current_proposal_line_items',
   orderId,organizationId,proposalId,baseLines:Object.freeze(baseLines),
   baseLineCount:baseLines.length,approvalVerified:false,sourceManifestComplete:false});
 };
}
