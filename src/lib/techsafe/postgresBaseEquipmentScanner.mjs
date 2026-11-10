// Private, read-only PostgreSQL source scanner for approved Sales Order base
// equipment. This does not attest approval or completeness of change orders.
// Its output must NEVER be passed as a certified sourceManifest.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const safeCount=x=>Number.isSafeInteger(x)&&x>=0&&x<=10000;
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
  if(order.rows?.length!==1)return hold('sales_order_scope_unverified');
  // The approved Sales Order references proposal_line_items through proposal_id.
  // Read all base lines; no product filtering that could conceal incomplete data.
  const lines=await client.query(
   `SELECT * FROM public.proposal_line_items
     WHERE organization_id=$1 AND proposal_id=$2 ORDER BY id FOR SHARE`,
   [organizationId,proposalId]);
  if(!Array.isArray(lines.rows)||!safeCount(lines.rows.length))
   return hold('base_equipment_count_invalid');
  const seen=new Set(),baseLines=[];
  for(const line of lines.rows){
   if(!uuid(line.id)||seen.has(line.id)||line.organization_id!==organizationId||
      line.proposal_id!==proposalId||!uuid(line.product_id)||
      !safeCount(line.quantity))
    return hold('base_equipment_row_unverified');
   seen.add(line.id);
   baseLines.push(Object.freeze({id:line.id,organizationId,proposalId,
    productId:line.product_id,quantity:line.quantity}));
  }
  // This is intentionally NOT readConsistentSource. An authoritative reader
  // must independently prove approval, exhaustive change orders, revisions,
  // full equipment details and a transaction-consistent source manifest.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'base_lines_read_approval_and_change_orders_unverified',
   orderId,organizationId,proposalId,baseLines:Object.freeze(baseLines),
   baseLineCount:baseLines.length,approvalVerified:false,sourceManifestComplete:false});
 };
}
