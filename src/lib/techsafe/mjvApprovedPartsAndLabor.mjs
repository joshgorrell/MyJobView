// One inspection boundary for MJV's committed Sales Order parts and labor.
// This is not a source attestation, sender, or permission to change Techsafe plans.
import {inspectMjvCurrentSalesOrderEquipment} from './mjvCurrentEquipmentAdapter.mjs';
import {inspectApprovedSalesOrderLabor} from './mjvApprovedLaborInspection.mjs';
const held=reason=>Object.freeze({ok:false,reason,authorized:false,snapshotReady:false,quoteReady:false,lines:[]});
export function inspectMjvApprovedPartsAndLabor({source,minimumUnitValueCents=0}={}){
 const equipment=inspectMjvCurrentSalesOrderEquipment({source,minimumUnitValueCents});
 if(!equipment.ok)return held(equipment.reason);
 const labor=inspectApprovedSalesOrderLabor({source});
 if(!labor.ok)return held(labor.reason);
 const seen=new Set(equipment.lines.map(x=>x.sourceLineId));
 const lines=[...equipment.lines];
 for(const item of labor.labor){
  if(seen.has(item.sourceLineId))return held('parts_labor_source_overlap');
  seen.add(item.sourceLineId);
  // Preserve source labor as labor, not equipment. Never derive from CO rows.
  lines.push(Object.freeze({...item,scope:'included',productRef:null,
   customerSupplied:false,techsafeExcluded:false}));
 }
 lines.sort((a,b)=>a.sourceLineId.localeCompare(b.sourceLineId));
 return Object.freeze({ok:true,reason:'parts_and_labor_inspected_not_authorized',
  authorized:false,snapshotReady:false,quoteReady:false,
  orderId:source.order.id,organizationId:source.organizationId,
  lines:Object.freeze(lines),excluded:equipment.excluded});
}
