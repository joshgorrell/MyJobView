// Inspection-only bridge to MJV's existing current Sales Order equipment model.
// MJV has already applied approved change orders to its current order lines.
// Never replay change_order_line_items or independently calculate quantities.
import {prepareOrderContent} from '../../../supabase/functions/_shared/techsafe-order-content.mjs';
const held=(reason)=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason,lines:[]});
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function inspectMjvCurrentSalesOrderEquipment({source,minimumUnitValueCents=0}={}){
 try{
  // This is a trusted-source DATA ADAPTER, not an authority check. The caller
  // must independently verify approval, tenant, transaction and revision.
  if(!source||source.trustedCurrentOrderRead!==true||
     source.currentEquipmentComplete!==true||source.approvedSalesOrder!==true||
     !id(source.organizationId)||!source.order||!id(source.order.id)||
     source.order.organization_id!==source.organizationId||
     !id(source.order.proposal_id)||!Array.isArray(source.lines)||
     source.lines.length>10000||!source.customer)
   return held('current_sales_order_source_unverified');
  // Existing MJV equipment preparation resolves exclusions, source membership,
  // selling prices and quantities; do not invent a second change-order reducer.
  const prepared=prepareOrderContent({...source,minimumUnitValueCents});
  if(prepared.valid!==true||!prepared.content)
   return held('current_sales_order_equipment_incomplete');
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,quoteReady:false,
   reason:'mjv_current_equipment_inspected_not_authorized',
   orderId:source.order.id,organizationId:source.organizationId,
   lines:prepared.content.lines,excluded:prepared.excluded});
 }catch{return held('current_sales_order_projection_failed');}
}
