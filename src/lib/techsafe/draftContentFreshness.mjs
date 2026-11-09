// Diagnostic two-read draft freshness check. The source equipment digest alone
// does not cover price, descriptions, or eligibility flags; compare the entire
// projected draft alongside the approved-source revision and generation.
// This cannot close the post-read race and NEVER certifies or dispatches.
import {inspectAndProjectTechsafeDraft} from './inspectedDraftComposition.mjs';
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason,lines:[]});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
export async function preflightTechsafeDraftContent({connectionId,orderId,readConsistentSource,minimumUnitValueCents=0}={}){
 if(!id(connectionId)||!id(orderId))return held('invalid_source_identity');
 if(typeof readConsistentSource!=='function')return held('authoritative_reader_unavailable');
 let firstSource,secondSource,reads=0;
 const wrapped=async identity=>{
  const source=await readConsistentSource(identity);
  reads++;
  if(reads===1)firstSource=source;
  else secondSource=source;
  return source;
 };
 const first=await inspectAndProjectTechsafeDraft({connectionId,orderId,readConsistentSource:wrapped,minimumUnitValueCents});
 if(!first.ok)return held(first.reason);
 const second=await inspectAndProjectTechsafeDraft({connectionId,orderId,readConsistentSource:wrapped,minimumUnitValueCents});
 if(!second.ok)return held(second.reason);
 if(reads!==2)return held('incomplete_source_reads');
 const sourceScope=x=>x&&x.connectionId===connectionId&&x.orderId===orderId&&
  x.salesOrder?.id===orderId&&x.salesOrder?.organizationId===x.connectionOrganizationId&&
  x.salesOrder?.proposalId===x.connectionProposalId;
 if(!sourceScope(firstSource)||!sourceScope(secondSource))return held('source_scope_mismatch');
 if(secondSource.connectionGeneration<firstSource.connectionGeneration||
    (secondSource.connectionGeneration===firstSource.connectionGeneration&&second.revision<first.revision))
  return held('source_revision_rollback');
 if(secondSource.connectionGeneration!==firstSource.connectionGeneration||second.revision!==first.revision)
  return held('source_changed_during_preflight');
 if(firstSource.sourceFingerprint!==secondSource.sourceFingerprint||
    firstSource.ledgerFingerprint!==secondSource.ledgerFingerprint)
  return held('source_fingerprint_changed');
 // Canonicalize projection ordering; a change in price, exclusion, product,
 // description or quantity is a content change even when source revision isn't.
 const canonical=lines=>JSON.stringify([...lines].map(x=>[
  x.sourceLineId,x.productRef,x.productKind,x.description,x.quantity,
  x.unitEquipmentValueCents,x.customerSupplied,x.techsafeExcluded
 ]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
 const canonicalDetails=lines=>JSON.stringify([...lines].map(x=>[
  x.sourceLineId,x.productRef,x.productKind,x.description,
  x.unitEquipmentValueCents,x.customerSupplied,x.techsafeExcluded
 ]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
 if(canonical(first.lines)!==canonical(second.lines)||
    canonicalDetails(firstSource.equipmentDetails)!==canonicalDetails(secondSource.equipmentDetails))
  return held('draft_content_changed_during_preflight');
 return {ok:true,authorized:false,snapshotReady:false,reason:'draft_freshness_not_certified',
  revision:second.revision,lines:second.lines};
}
