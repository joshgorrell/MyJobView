import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const removed='837c4be8-4d88-4852-8c42-38eb98c2520c';
const kept='dc758ebe-4547-4759-9e9e-07e2dfa17ff3';
const misc='715017c5-c899-4cc0-8b83-b2c2a634c380';
const base={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const run=async removal=>createTechsafeCatalogSoldScopeReader({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[base]};
 if(sql.includes('FROM public.change_orders co')&&sql.includes('li.original_quantity'))return {rows:[removal]};
 if(sql.includes('FROM public.change_orders co'))return {rows:[{count:0}]};
 if(sql.includes('COALESCE(SUM(CASE'))return {rows:[{total:'337.50'}]};
 return {rows:[{lineId:removed,productId:misc,description:'Removed AMP',quantity:1,unitPrice:799.95,soldLabor:100,catalog_found:true,isMisc:false},
 {lineId:kept,productId:misc,description:'Sold Misc mount',quantity:1,unitPrice:449.95,soldLabor:67.5,catalog_found:true,isMisc:true}]};
}})({connectionId,orderId});
const removal={line_id:removed,original_quantity:1,new_quantity:0,current_quantity:1,current_labor:100,remove_scope:'parts_and_labor'};
const ok=await run(removal);assert.equal(ok.ready,true);assert.equal(ok.items.length,1);
assert.deepEqual(ok.removedSourceLineIds,[removed]);assert.equal(ok.soldLaborTotalCents,23750);
assert.equal((await run({...removal,new_quantity:0.5})).reason,'approved_removal_scope_requires_reconciliation');
assert.equal((await run({...removal,line_id:null})).reason,'approved_removal_scope_requires_reconciliation');
assert.equal((await run({...removal,remove_scope:'parts_only'})).reason,'approved_removal_scope_requires_reconciliation');
console.log('PASS: full provenance-linked removals excluded; partial/ambiguous held');
