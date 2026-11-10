// Inspection-only composition of MJV's existing private application evidence and
// equipment-history checks. Does not replay change orders or authorize export.
import {assessApplicationEvidence} from '../../../supabase/functions/_shared/techsafe-application-evidence.mjs';
import {assessEquipmentContinuity} from '../../../supabase/functions/_shared/techsafe-equipment-continuity.mjs';
const held=(reason,details={})=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason,...details});
export function inspectMjvEquipmentHistory({model,pairs,binding}={}){
 try{
  if(!model||!binding||!Array.isArray(pairs))return held('private_history_source_missing');
  // These are existing MJV diagnostics. Their input must be supplied by a
  // trusted, private server-side read, never an API/browser payload.
  const application=assessApplicationEvidence(model,binding);
  if(application.applicationEvidenceCurrent!==true)
   return held('application_evidence_unverified',{issues:application.issues});
  const continuity=assessEquipmentContinuity({currentModel:model,pairs},binding);
  if(continuity.historyContinuous!==true)
   return held('equipment_history_unverified',{issues:continuity.issues});
  // Even a perfect observed span cannot establish original customer-approved
  // scope, all historical coverage, selling prices or revision freshness.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,quoteReady:false,
   reason:'observed_history_continuous_original_scope_unverified',
   checkedApplications:continuity.checkedApplications,originalScopeVerified:false,scopeVerified:false});
 }catch{return held('equipment_history_inspection_failed');}
}
