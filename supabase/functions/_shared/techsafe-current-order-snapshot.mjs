// Compose the receiver's v2 payload from CURRENT Sales Order product/labor facts.
// This is a pure mapping function, not approval certification or network authority.
import {projectCurrentSalesOrderForTechsafe} from '../../../src/lib/techsafe/projectCurrentSalesOrderForTechsafe.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>=1;
const held=(reason,issues=[])=>({ready:false,reason,issues,snapshot:null});
export function prepareCurrentSalesOrderTechsafeSnapshot({source,connection,revision,eventId,
 sourceInstanceId,environment='sandbox',orderStatus='open',customerName,siteRef,
 minimumUnitValueCents}={}){
 const projection=projectCurrentSalesOrderForTechsafe(source,{minimumUnitValueCents});
 if(!projection.ok)return held(projection.reason,projection.issues);
 if(!connection||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(connection[k]))||
    connection.organizationId!==source.organizationId||
    connection.orderId!==source.orderId||connection.proposalId!==source.proposalId||
    !positive(connection.generation)||!positive(revision)||!id(eventId)||
    !id(sourceInstanceId)||!id(source.contactId)||!id(siteRef)||
    !['sandbox','production'].includes(environment)||
    !['open','completed','cancelled','deleted'].includes(orderStatus)||
    typeof customerName!=='string'||!customerName.trim()||customerName.length>256)
  return held('current_sales_order_snapshot_identity_unverified');
 if(['cancelled','deleted'].includes(orderStatus)&&projection.lines.length)
  return held('cancelled_order_has_equipment');
 const snapshot=Object.freeze({schemaVersion:2,environment,
  connectionId:connection.connectionId,sourceInstanceId,
  organizationId:connection.organizationId,orderId:connection.orderId,
  eventId,generation:connection.generation,revision,complete:true,
  scopeState:'committed',orderStatus,currency:'USD',
  minimumUnitValueCents,soldLaborCents:projection.soldLaborCents,
  customerRef:source.contactId,customerName,siteRef,
  lines:projection.lines});
 return Object.freeze({ready:true,reason:null,snapshot,
  // A valid payload is not a transport certificate.
  authorized:false,snapshotReady:false});
}
