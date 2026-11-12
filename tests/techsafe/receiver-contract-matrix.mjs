import assert from 'node:assert/strict';
import {sendTechsafeDraft} from '../../supabase/functions/_shared/techsafe-draft-http-transport.mjs';
import {prepareTechsafeTransportSnapshot} from '../../supabase/functions/_shared/techsafe-transport-contract.mjs';
// No customer records or network traffic. Simulates Techsafe's actual mjv-import
// HTTP receipt contract with the production MJV sender and authority gate.
const binding={connectionId:'conn',organizationId:'org',orderId:'order',proposalId:'approved'};
const source={valid:true,sales_order_id:'order',approved_proposal_id:'approved',organization_id:'org',connection_id:'conn',equipment:[]};
const equipment=(sourceLineId,unitEquipmentValueCents=25000)=>({sourceLineId,productRef:'speaker',productKind:'equipment',scope:'included',customerSupplied:false,techsafeExcluded:false,quantity:1,unitEquipmentValueCents});
const labor=(sourceLineId,unitEquipmentValueCents)=>({sourceLineId,productRef:null,productKind:'labor',scope:'included',customerSupplied:false,techsafeExcluded:false,quantity:1,unitEquipmentValueCents});
const snapshot={schemaVersion:2,environment:'sandbox',connectionId:'conn',sourceInstanceId:'mjv',organizationId:'org',orderId:'order',eventId:'event1',generation:1,revision:7,complete:true,scopeState:'committed',orderStatus:'open',currency:'USD',minimumUnitValueCents:25000,customerRef:'customer',customerName:'Test Customer',siteRef:'site',lines:[equipment('original'),equipment('change:approved_item'),equipment('cheap',10000),labor('installation',75000)]};
const authority={verified:true,sourceAuthorized:true,scopeVerified:true,snapshotReady:true,connectionId:'conn',organizationId:'org',orderId:'order',proposalId:'approved',generation:1,revision:7,snapshot};
const prepared=prepareTechsafeTransportSnapshot({source,authority,binding,revision:7,eventId:'event1'});
assert.equal(prepared.ready,true,prepared.reason);
assert.equal(prepared.snapshot.lines.length,4,'Keep all equipment and labor for receiver eligibility selection');
assert.equal(prepared.snapshot.lines.find(x=>x.sourceLineId==='change:approved_item').productKind,'equipment');
assert.equal(prepared.snapshot.lines.find(x=>x.sourceLineId==='installation').unitEquipmentValueCents,75000);
const captured=[];
const receiver=(action,proposalId)=>async(url,init)=>{
 assert.equal(new URL(url).protocol,'https:');
 assert.equal(init.method,'POST');
 assert.equal(init.headers['Idempotency-Key'],'conn:order:7');
 const body=JSON.parse(init.body);captured.push(body);
 assert.deepEqual(body,prepared.snapshot);
 assert.equal(body.lines.find(x=>x.sourceLineId==='cheap').unitEquipmentValueCents,10000);
 assert.equal(body.lines.find(x=>x.sourceLineId==='installation').productKind,'labor');
 return {status:200,json:async()=>({accepted:true,connectionId:'conn',orderId:'order',sourceRevision:'7',generation:1,eventId:'event1',action,...(proposalId?{proposalId}:{})})};
};
const args={endpoint:'https://techsafe.example.com/functions/v1/mjv-import',token:'x'.repeat(40),binding,sourceRevision:'7',content:prepared.snapshot};
for(const [action,proposalId] of [['created','native'],['updated','native'],['duplicate',null],['ignore_older',null],['preserve_coverage_snapshot',null],['suppressed',null]]){
 const result=await sendTechsafeDraft({...args,fetchImpl:receiver(action,proposalId)});
 assert.equal(result.accepted,true,action);
 assert.equal(result.action,action);
}
assert.equal(captured.length,6);
const malicious={...snapshot,internalCostCents:100};
assert.equal(prepareTechsafeTransportSnapshot({source,authority:{...authority,snapshot:malicious},binding,revision:7,eventId:'event1'}).ready,false);
const changed={...snapshot,revision:8};
assert.equal(prepareTechsafeTransportSnapshot({source,authority:{...authority,snapshot:changed},binding,revision:7,eventId:'event1'}).ready,false);
const noApproval={...source,approved_proposal_id:'draft'};
assert.equal(prepareTechsafeTransportSnapshot({source:noApproval,authority,binding,revision:7,eventId:'event1'}).ready,false);
const forged=await sendTechsafeDraft({...args,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'conn',orderId:'order',sourceRevision:'7',generation:1,eventId:'wrong',action:'created',proposalId:'native'})})});
assert.equal(forged.reason,'receiver_receipt_unverified');
console.log('PASS: MJV trusted snapshot -> v2 wire -> Techsafe receiver receipts, approved change orders, labor, replay, purchased snapshot, and fail-closed cases');
