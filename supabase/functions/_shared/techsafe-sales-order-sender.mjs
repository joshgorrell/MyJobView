// Single server-only orchestration point for a certified MJV Sales Order.
// The source authority provider MUST be a trusted backend with its own
// transaction/approval-history gate. Nothing in preflight or the fingerprint
// can mint an authority. Never call from browser or expose credentials.
import {createLiveSalesOrderPreflight} from './techsafe-live-sales-order-preflight.mjs';
import {fingerprintCurrentSalesOrder} from './techsafe-current-order-fingerprint.mjs';
import {sendTechsafeV2Snapshot} from './techsafe-v2-snapshot-http.mjs';
import {validateTechsafeCurrentEquipmentSnapshot} from './techsafe-current-snapshot-consistency.mjs';
const held=reason=>({accepted:false,reason});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export function createTechsafeSalesOrderSender({client,digest,certifySource,authorizeForDelivery,fetchImpl}={}){
 if(!client||typeof client.query!=='function'||typeof digest!=='function')
  throw TypeError('private_source_reader_required');
 const preflight=createLiveSalesOrderPreflight(client);
 return async function send({connectionId,orderId,endpoint,token,allowedOrigin,enabled=false}={}){
  if(enabled!==true)return held('integration_disabled');
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  // Never invoke a delivery adapter with synthetic authority or a caller-supplied
  // source certificate. A trusted backend must provide both callbacks.
  if(typeof certifySource!=='function'||typeof authorizeForDelivery!=='function')
   return held('trusted_source_authority_unavailable');
  const observed=await preflight({connectionId,orderId});
  if(observed.reason!=='source_certificate_and_revision_required'||!observed.source)
   return held(observed.reason);
  const fingerprint=await fingerprintCurrentSalesOrder(observed.source,digest);
  if(!fingerprint.valid)return held(fingerprint.reason);
  const b=observed.source.binding;
  const binding={connectionId:b.connection_id,organizationId:b.organization_id,
   orderId:b.sales_order_id,proposalId:b.proposal_id};
  let certificate;
  try{
   // This function must independently verify customer approval provenance,
   // applied change history, scope, prices, persisted revision, generation,
   // fingerprint and dealer binding; it must not trust these observed rows.
   certificate=await certifySource({binding:{...binding},generation:Number(b.connection_generation),
    fingerprint:fingerprint.fingerprint});
  }catch{return held('source_certification_failed');}
  if(!certificate||certificate.verified!==true||certificate.sourceAuthorized!==true||
   certificate.scopeVerified!==true||certificate.snapshotReady!==true||
   certificate.connectionId!==binding.connectionId||certificate.organizationId!==binding.organizationId||
   certificate.orderId!==binding.orderId||certificate.proposalId!==binding.proposalId||
   certificate.generation!==Number(b.connection_generation)||
   !Number.isSafeInteger(certificate.revision)||certificate.revision<1||
   !uuid(certificate.eventId)||certificate.fingerprint!==fingerprint.fingerprint)
   return held('source_certificate_unverified');
  const consistency=validateTechsafeCurrentEquipmentSnapshot(observed.source,certificate.snapshot);
  if(!consistency.valid)return held(consistency.reason);
  const source={valid:true,connection_id:binding.connectionId,organization_id:binding.organizationId,
   sales_order_id:binding.orderId,approved_proposal_id:binding.proposalId,equipment:[]};
  return sendTechsafeV2Snapshot({endpoint,token,allowedOrigin,binding,source,
   authority:certificate,revision:certificate.revision,eventId:certificate.eventId,
   enabled:true,authorizeForDelivery,fetchImpl});
 };
}
