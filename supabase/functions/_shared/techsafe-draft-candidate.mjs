// Inactive composition of trusted private reads. No sender, persistence or
// checkout authority. Original visible approval rows establish the supported
// initial membership; original hidden rows never imply removal.
import {assessDraftEligibility} from './techsafe-draft-eligibility.mjs';
import {assessApprovedRowsConnection} from './techsafe-approved-rows-connection.mjs';
import {assessEquipmentEffects} from './techsafe-equipment-effects.mjs';
import {resolveStandaloneSellingPrice} from './techsafe-unit-selling-price.mjs';
import {prepareOrderContent} from './techsafe-order-content.mjs';
export function prepareTechsafeDraftCandidate(input,binding){
 const result={valid:false,content:null,excluded:[],issues:[],equipmentMembershipResolved:false,scopeVerified:false,snapshotReady:false,quoteReady:false};
 const stop=code=>{throw Error(code);};
 try{
  const model=input?.currentModel;
  const readiness=assessDraftEligibility(model);
  if(!readiness.eligible)stop(readiness.reason);
  // Do not inspect an early order's approval or application history.
  const basis=input.basis,pairs=input.pairs;
  const connection=assessApprovedRowsConnection({currentModel:model,basis,pairs},binding);
  if(!connection.approvedRowsConnected)stop(connection.issues[0]?.code??'approved_rows_not_connected');
  const membership=new Map(basis.lines.map(row=>[row.line.id,row.line.is_hidden?'unverified':'included']));
  const ordered=[...pairs].sort((a,b)=>BigInt(a.startedOrder)<BigInt(b.startedOrder)?-1:1);
  for(const pair of ordered){
   const effects=assessEquipmentEffects(pair);
   if(!effects.equipmentEffectsMatch)stop('application_effects_unverified');
   for(const add of effects.addedLineBindings){
    if(membership.has(add.sourceLineId))stop('addition_membership_conflict');
    membership.set(add.sourceLineId,'included');
   }
   for(const removed of effects.removedLineIds){
    if(!membership.has(removed))stop('removal_membership_missing');
    membership.set(removed,'removed');
   }
  }
  const lines=model.lines.map(row=>{
   const scope=membership.get(row.line.id)??'unverified';
   const price=resolveStandaloneSellingPrice({row,context:model.sellingPriceContext},binding);
   // Explicit fields only; never spread cost/catalog/financial source dumps.
   return {line:row.line,product:row.product,exclusion:row.exclusion,
    membership:{orderId:binding.orderId,sourceLineId:row.line.id,scope,verified:scope!=='unverified'},
    salesPriceResolved:price.salesPriceResolved,unitSalePrice:price.unitSalePrice};
  });
  const prepared=prepareOrderContent({organizationId:model.organizationId,currency:model.currency,order:model.order,customer:model.customer,
   completion:model.completion,site:model.site,minimumUnitValueCents:model.minimumUnitValueCents,lines});
  result.excluded=prepared.excluded;result.issues=prepared.issues;
  if(!prepared.valid)return result;
  if(!prepared.content.lines.length){result.issues.push({code:'no_eligible_equipment'});return result;}
  result.valid=true;result.content=prepared.content;result.equipmentMembershipResolved=true;
 }catch(error){result.issues.push({code:error.message||'draft_candidate_unavailable'});}
 // A prepared business candidate is still not an authorized source envelope.
 return result;
}
