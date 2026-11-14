import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const ids={removed:'837c4be8-4d88-4852-8c42-38eb98c2520c',kept:'08c377e8-ca56-46cf-a09f-f20794fcf2cd',labor:'11111111-1111-4111-8111-111111111111',add:'77fb33c9-3446-4427-8b4f-098eb260ee0b',remove:'7a34774a-47d5-404e-ba31-1b88be5297d6'};
const base={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const lines=[{id:ids.removed,productId:'b8fd83ac-ff9e-4224-9db0-de6b24148b86',catalogOwned:true,description:'AMP',quantity:1,unitPrice:799.95,soldLabor:100,isMisc:false},
{id:ids.kept,productId:'51dea668-c813-4c47-a449-207232ea8f0b',catalogOwned:true,description:'Speaker',quantity:1,unitPrice:299.95,soldLabor:50,isMisc:false},
{id:ids.labor,laborOnly:true,description:'Labor only',quantity:1,unitPrice:0,soldLabor:200}];
const removal={id:ids.remove,actionType:'remove',sourceLineId:ids.removed,removeScope:'parts_and_labor',originalQuantity:1,newQuantity:0,locked:true,active:false};
const addition={id:ids.add,actionType:'add',locked:true,active:false};
const read=({changes=[removal],source=lines,binding=base}={})=>createTechsafeCatalogSoldScopeReader({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[binding]};
 if(sql.includes('FROM public.change_orders co'))return {rows:changes};
 if(sql.includes('FROM public.proposal_line_items pli'))return {rows:source};
 throw Error('unexpected SQL');
}})({connectionId,orderId,minimumEligibleUnitPrice:250});
const ok=await read();assert.equal(ok.ready,true);assert.equal(ok.items.length,1);
assert.equal(ok.soldLaborTotalCents,25000);assert.equal(ok.equipmentCents,29995);
assert.deepEqual(ok.removedSourceLineIds,[ids.removed]);
assert.equal((await read({changes:[removal,addition]})).reason,'approved_addition_unreconciled');
assert.equal((await read({changes:[{...removal,newQuantity:0.5}]})).reason,'approved_removal_unreconciled');
assert.equal((await read({changes:[{...removal,locked:false}]})).reason,'approved_change_not_committed');
assert.equal((await read({source:[{...lines[0],catalogOwned:false},...lines.slice(1)]})).reason,'invalid_source_line');
assert.equal((await read({binding:{...base,enabled:false}})).reason,'connection_not_active');
const added={...lines[1],id:'22222222-2222-4222-8222-222222222222',committedChangeLineId:ids.add};
// A catalog item that was validly sold must remain eligible for historical
// warranty imports after its catalog entry is deactivated. Inactive products
// must not be re-enabled merely to send an already-approved Sales Order.
const inactiveSold=await read({changes:[],source:[{
  id:ids.kept,productId:'397ad80d-69ac-43f4-8f5a-818fcf8e397c',
  catalogOwned:true,catalogActive:false,description:'Internal receiver fixture',
  quantity:1,unitPrice:500,soldLabor:125,isMisc:false
}]});
assert.equal(inactiveSold.ready,true);
assert.equal(inactiveSold.eligibleItems.length,1);
assert.equal(inactiveSold.equipmentCents,50000);
assert.equal(inactiveSold.soldLaborTotalCents,12500);

const applied=await read({changes:[removal,addition],source:[...lines,added]});
assert.equal(applied.ready,true);assert.equal(applied.items.length,2);
console.log('PASS: reader approved change reconciliation, sold labor, eligibility, and holds');
