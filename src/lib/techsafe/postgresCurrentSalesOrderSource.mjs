// Read MJV's CURRENT approved Sales Order directly. MJV owns change orders;
// Techsafe only needs current sold products and labor, not their edit history.
// This is a nonauthorizing source preview until MJV's write/approval boundary
// can guarantee no pending unapproved edits are present in the current rows.
import {createPostgresBaseEquipmentScanner} from './postgresBaseEquipmentScanner.mjs';
import {createSalesOrderApprovalEvidenceReader} from './postgresSalesOrderApprovalEvidence.mjs';
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
const cents=n=>Number.isSafeInteger(n)&&n>=0;
export function createCurrentSalesOrderSourceReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 const scan=createPostgresBaseEquipmentScanner(client);
 const approval=createSalesOrderApprovalEvidenceReader(client);
 return async ({orderId,organizationId,proposalId}={})=>{
  const isolation=await client.query('SHOW transaction_isolation');
  if(isolation?.rows?.[0]?.transaction_isolation!=='serializable')
   return hold('serializable_transaction_required');
  const approved=await approval({orderId,organizationId,proposalId});
  if(approved.ok!==true)return hold(approved.reason||'sales_order_approval_unverified');
  const current=await scan({orderId,organizationId,proposalId});
  if(current.ok!==true)return hold(current.reason||'current_sales_order_unverified');
  const items=[],issues=[];let soldLaborCents=0;
  for(const row of current.baseLines){
   if(row.hidden!==false||row.customerSupplied!==false){
    issues.push({lineId:row.id,reason:'line_eligibility_unverified'});
    continue;
   }
   if(!cents(row.laborSaleTotalCents)){
    issues.push({lineId:row.id,reason:'labor_amount_unresolved'});
   }else{
    soldLaborCents+=row.laborSaleTotalCents;
    if(!Number.isSafeInteger(soldLaborCents))return hold('sold_labor_overflow');
   }
   if(row.productId===null){
    if(row.itemType!=='labor')issues.push({lineId:row.id,reason:'unclassified_nonproduct_line'});
    continue; // Standalone labor, never a product.
   }
   if(!cents(row.unitSalePriceCents)||!cents(row.lineSaleTotalCents)){
    issues.push({lineId:row.id,reason:'product_sold_price_unresolved'});
    continue;
   }
   if(row.itemType!=='material'){
    issues.push({lineId:row.id,reason:'product_type_or_split_unverified'});
    continue;
   }
   // Eligibility is determined from unit SELLING price, not line extension.
   // An adjusted line total may reflect discounts or labor; it must not
   // silently replace the source's explicit per-unit selling price.
   if(!Number.isSafeInteger(row.quantity)||row.quantity<1){
    issues.push({lineId:row.id,reason:'product_quantity_invalid'});
    continue;
   }
   items.push(Object.freeze({sourceLineId:row.id,productRef:row.productId,
    quantity:row.quantity,unitSalePriceCents:row.unitSalePriceCents,
    lineSaleTotalCents:row.lineSaleTotalCents,
    laborSaleTotalCents:row.laborSaleTotalCents}));
  }
  const sourceComplete=issues.length===0;
  return Object.freeze({ok:sourceComplete,authorized:false,snapshotReady:false,
   reason:sourceComplete?'current_sales_order_read_pending_edit_approval_boundary':'current_sales_order_contains_unresolved_lines',
   orderId,organizationId,proposalId,contactId:approved.contactId,
   source:'current_approved_sales_order',equipment:Object.freeze(items),
   soldLaborCents,issues:Object.freeze(issues),sourceComplete,
   currentRowsInspected:current.baseLineCount,
   pendingEditExclusionVerified:false,
   noChangeOrderReplay:true});
 };
}
