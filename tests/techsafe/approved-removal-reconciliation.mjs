import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const removed='837c4be8-4d88-4852-8c42-38eb98c2520c',kept='dc758ebe-4547-4759-9e9e-07e2dfa17ff3';
const misc='715017c5-c899-4cc0-8b83-b2c2a634c380';
const base={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const removal={id:'7a34774a-47d5-404e-ba31-1b88be5297d6',actionType:'remove',sourceLineId:removed,originalQuantity:1,newQuantity:0,removeScope:'parts_and_labor',locked:true,active:false};
const source=[{id:removed,productId:misc,description:'Removed AMP',quantity:1,unitPrice:799.95,soldLabor:100,catalogOwned:true,isMisc:false},
{id:kept,productId:misc,description:'Sold Misc mount',quantity:1,unitPrice:449.95,soldLabor:67.5,catalogOwned:true,isMisc:true},
{id:'11111111-1111-4111-8111-111111111111',laborOnly:true,description:'Labor only',quantity:1,unitPrice:0,soldLabor:270}];
const run=async change=>createTechsafeCatalogSoldScopeReader({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[base]};
 if(sql.includes('FROM public.change_orders co'))return {rows:[change]};
 if(sql.includes('FROM public.proposal_line_items pli'))return {rows:source};
 throw Error('unexpected SQL');
}})({connectionId,orderId,minimumEligibleUnitPrice:250});
const ok=await run(removal);assert.equal(ok.ready,true);assert.equal(ok.items.length,1);
assert.deepEqual(ok.removedSourceLineIds,[removed]);assert.equal(ok.soldLaborTotalCents,33750);
assert.equal((await run({...removal,newQuantity:0.5})).reason,'approved_removal_unreconciled');
assert.equal((await run({...removal,sourceLineId:null})).reason,'approved_removal_unreconciled');
assert.equal((await run({...removal,removeScope:'parts_only'})).reason,'approved_removal_unreconciled');
console.log('PASS: full provenance-linked removals excluded; partial/ambiguous held');
