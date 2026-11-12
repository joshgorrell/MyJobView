// Read-only preflight before any legacy addition repair. Never inserts or edits.
// A missing lineage ID alone is not proof that a sold item is missing.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const hold=reason=>({ok:false,repairReady:false,authorized:false,reason});
export function createLegacyAdditionRepairPreflight(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return hold('invalid_scope');
  let result;
  try{result=await client.query(
   `SELECT li.id AS change_line_id,li.organization_id AS line_organization_id,
     co.organization_id AS change_organization_id,co.proposal_id AS change_proposal_id,
     co.status,co.is_active,co.is_locked,co.approval_date,
     co.requires_customer_approval,co.customer_approved,
     li.product_id,li.product_name,li.product_description,
     li.new_quantity::text AS quantity,li.new_unit_price::text AS unit_price,
     linked.id AS linked_line_id,
     (SELECT count(*)::integer FROM public.proposal_line_items candidate
       WHERE candidate.organization_id=$2 AND candidate.proposal_id=$3
         AND candidate.product_id IS NOT DISTINCT FROM li.product_id
         AND candidate.description=COALESCE(li.product_description,li.product_name)
         AND candidate.unit_price=li.new_unit_price
         AND candidate.quantity=li.new_quantity
     ) AS exact_current_matches
     FROM public.change_orders co
     JOIN public.change_order_line_items li ON li.change_order_id=co.id
     LEFT JOIN public.proposal_line_items linked
       ON linked.committed_change_order_line_id=li.id
     WHERE co.sales_order_id=$1 AND li.action_type='add'
     ORDER BY li.id`,[orderId,organizationId,proposalId]);
  }catch{return hold('legacy_addition_repair_preflight_read_failed');}
  if(!Array.isArray(result.rows)||result.rows.length>10000)return hold('invalid_preflight_rows');
  const seen=new Set(),findings=[];
  for(const row of result.rows){
   if(!uuid(row.change_line_id)||seen.has(row.change_line_id)||
      row.line_organization_id!==organizationId||
      row.change_organization_id!==organizationId||
      row.change_proposal_id!==proposalId)
    return hold('legacy_addition_scope_mismatch');
   seen.add(row.change_line_id);
   const applied=row.status==='approved'&&row.is_active===false&&
    row.is_locked===true&&Boolean(row.approval_date)&&
    (row.requires_customer_approval!==true||row.customer_approved===true);
   const matches=Number(row.exact_current_matches);
   if(!Number.isSafeInteger(matches)||matches<0)return hold('invalid_match_count');
   const state=!applied?'not_proven_applied':
    row.linked_line_id!==null?'already_linked':
    matches>0?'possible_legacy_match_requires_manual_review':
    'missing_current_addition_requires_manual_review';
   findings.push(Object.freeze({changeLineId:row.change_line_id,state,
    exactCurrentMatches:matches,quantity:row.quantity,unitPrice:row.unit_price,
    productName:row.product_description||row.product_name||null}));
  }
  return Object.freeze({ok:true,repairReady:false,authorized:false,
   reason:'legacy_addition_repair_requires_manual_review',
   findings:Object.freeze(findings),noWritesPerformed:true});
 };
}
