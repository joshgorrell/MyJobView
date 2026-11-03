// Inactive original-approval-to-observed-history diagnostic.
// Never confers authority to sync, activate or check out coverage.
import {assessEquipmentContinuity} from './techsafe-equipment-continuity.mjs';
import {equipmentRowsEqual} from './techsafe-equipment-effects.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function assessOriginalHistoryAnchor(bundle,binding){
 const result={anchored:false,checkedApplications:0,issues:[],scopeVerified:false,snapshotReady:false,quoteReady:false};
 const hold=code=>{result.issues.push({code});return result;};
 if(!object(bundle)||!object(bundle.basis)||!object(bundle.currentModel)||!Array.isArray(bundle.pairs)||!object(binding))
  return hold('history_anchor_unavailable');
 const continuity=assessEquipmentContinuity({currentModel:bundle.currentModel,pairs:bundle.pairs},binding);
 if(!continuity.historyContinuous)return hold(continuity.issues[0]?.code??'equipment_history_unverified');
 result.checkedApplications=continuity.checkedApplications;
 const basis=bundle.basis;
 if(basis.basisVersion!==1||basis.sourceKind!=='customer_portal_approval'||!object(basis.binding)
  ||!['connectionId','organizationId','orderId','proposalId'].every(k=>basis.binding[k]===binding[k])
  ||!Array.isArray(basis.lines)||basis.lines.length>10000)
  return hold('original_approval_basis_unverified');
 const first=[...bundle.pairs].sort((a,b)=>BigInt(a.startedOrder)<BigInt(b.startedOrder)?-1:1)[0];
 if(!first||basis.approvedRowsHash!==first.beforeScopeHash||
  !equipmentRowsEqual(basis.lines,first.beforeLines,binding))
  return hold('original_approval_history_gap');
 // Equality to a portal receipt candidate cannot establish receipt authenticity,
 // hidden-original membership, completeness of all mutation paths, or commit order.
 result.anchored=true;
 return result;
}
