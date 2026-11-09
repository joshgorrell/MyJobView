// Server-side diagnostic composition only. The callback must be backed by a
// trusted transaction in a future adapter; no caller-supplied data is authority.
// Neither a successful inspection nor a projected draft permits synchronization.
import {inspectVerifiedSalesOrderEquipment} from './verifiedSourceRead.mjs';
import {projectTechsafeEquipment} from './equipmentTransportProjection.mjs';
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason,lines:[]});
export async function inspectAndProjectTechsafeDraft({connectionId,orderId,readConsistentSource,readEquipmentDetails,minimumUnitValueCents=0}={}){
  // Equipment details must be fetched from the same locked authoritative read,
  // not a separate post-inspection query vulnerable to source changes.
  if(typeof readEquipmentDetails==='function') return held('separate_equipment_read_forbidden');
  let details;
  const inspection=await inspectVerifiedSalesOrderEquipment({
    connectionId,orderId,
    readConsistentSource:typeof readConsistentSource==='function'?async identity=>{
      const source=await readConsistentSource(identity);
      // The source reader returns details alongside the verified Sales Order
      // and change-order rows from one transaction. Never fill gaps from a
      // second request or a caller-provided details array.
      details=source?.equipmentDetails;
      return source;
    }:undefined
  });
  if(!inspection.ok) return held(inspection.reason);
  if(!Array.isArray(details)) return held('equipment_details_missing_from_source');
  const projected=projectTechsafeEquipment({inspection,details,minimumUnitValueCents});
  if(!projected.ok) return held(projected.reason);
  return {...projected,authorized:false,snapshotReady:false,reason:'inspected_draft_not_certified'};
}
