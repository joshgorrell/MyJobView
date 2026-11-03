import {prepareSalesEquipment} from './techsafe-sales-equipment.mjs';
import {assessDraftEligibility} from './techsafe-draft-eligibility.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const statuses={pending_deposit:'open',pending_po:'open',planning:'open',active:'open',complete:'completed',closed:'completed'};
/** Detached business content only, never a complete authorized source snapshot. */
export function prepareOrderContent(input){
 if(!object(input)||!id(input.organizationId)||input.currency!=='USD'||!object(input.order)||!object(input.customer))fail('invalid_order_context');
 const {order,customer}=input;
 if(!id(order.id)||!id(order.proposal_id)||order.organization_id!==input.organizationId)fail('order_binding_mismatch');
 if(!id(customer.id)||customer.id!==order.contact_id||customer.organization_id!==input.organizationId)fail('customer_binding_mismatch');
 if(!Object.hasOwn(statuses,order.status))fail('unresolved_order_status');
 const readiness=assessDraftEligibility(input);
 if(!readiness.eligible)return {valid:false,draftEligible:false,content:null,excluded:[],issues:[{code:readiness.reason}],snapshotReady:false,quoteReady:false};
 let siteRef=order.id; // Stable order-specific location reference; no invented address.
 if(input.site!==null&&input.site!==undefined){
  if(!object(input.site)||!id(input.site.id)||input.site.organization_id!==input.organizationId||input.site.order_id!==order.id)fail('site_binding_mismatch');
  siteRef=input.site.id;
 }
 const customerName=customer.full_name; // Same field as MJV SalesOrdersView/Detail.
 if(typeof customerName!=='string'||!customerName.trim()||customerName.length>256||/[\u0000-\u001f\u007f]/.test(customerName)){
  return {valid:false,draftEligible:true,content:null,excluded:[],issues:[{code:'customer_name_unresolved'}],snapshotReady:false,quoteReady:false};
 }
 const selected=prepareSalesEquipment({organizationId:input.organizationId,orderId:order.id,proposalId:order.proposal_id,
  minimumUnitValueCents:input.minimumUnitValueCents,lines:input.lines});
 const content=selected.valid?Object.freeze({schemaVersion:2,organizationId:input.organizationId,orderId:order.id,
  orderStatus:statuses[order.status],currency:'USD',minimumUnitValueCents:input.minimumUnitValueCents,
  customerRef:customer.id,customerName,siteRef,lines:Object.freeze([...selected.equipment])}):null;
 return {valid:selected.valid,draftEligible:true,content,excluded:selected.excluded,issues:selected.issues,snapshotReady:false,quoteReady:false};
}

