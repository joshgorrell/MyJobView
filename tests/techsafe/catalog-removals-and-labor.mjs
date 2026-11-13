import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const bound={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const mock=(removed)=>({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[bound]};
 if(sql.includes('FROM public.change_orders co')&&sql.includes("li.action_type='remove'"))return {rows:[{count:removed}]};
 if(sql.includes('FROM public.change_orders co'))return {rows:[{count:0}]};
 if(sql.includes('COALESCE(SUM(CASE'))return {rows:[{total:'337.50'}]};
 return {rows:[{lineId:'dc758ebe-4547-4759-9e9e-07e2dfa17ff3',productId:'715017c5-c899-4cc0-8b83-b2c2a634c380',description:'Misc mount',quantity:1,unitPrice:'449.95',soldLabor:'67.50',catalog_found:true,isMisc:true}]};
}});
const held=await createTechsafeCatalogSoldScopeReader(mock(1))({connectionId,orderId});
assert.equal(held.ready,false);assert.equal(held.reason,'approved_removal_scope_requires_reconciliation');
const ok=await createTechsafeCatalogSoldScopeReader(mock(0))({connectionId,orderId});
assert.equal(ok.ready,true);assert.equal(ok.soldLaborTotalCents,33750);
assert.equal(ok.equipmentLinkedLaborCents,6750);
console.log('PASS: approved removals held and labor-only/customer-supplied labor preserved in total');
