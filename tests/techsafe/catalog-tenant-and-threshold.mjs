import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const bound={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const line={lineId:'dc758ebe-4547-4759-9e9e-07e2dfa17ff3',productId:'715017c5-c899-4cc0-8b83-b2c2a634c380',description:'Misc special',quantity:1,unitPrice:449.95,soldLabor:67.5,catalog_found:true,isMisc:true};
const reader=(row=line)=>createTechsafeCatalogSoldScopeReader({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[bound]};
 if(sql.includes('FROM public.change_orders co')&&sql.includes('li.original_quantity'))return {rows:[]};
 if(sql.includes('FROM public.change_orders co'))return {rows:[{count:0}]};
 if(sql.includes('COALESCE(SUM(CASE'))return {rows:[{total:'67.50'}]};
 return {rows:[row]};
}});
assert.equal((await reader()({connectionId,orderId})).reason,'dealer_eligibility_minimum_required');
assert.equal((await reader()({connectionId,orderId,minimumEligibleUnitPrice:0})).reason,'dealer_eligibility_minimum_required');
assert.equal((await reader({...line,catalog_found:false})({connectionId,orderId,minimumEligibleUnitPrice:250})).reason,'catalog_product_reconciliation_required');
const ok=await reader()({connectionId,orderId,minimumEligibleUnitPrice:250});
assert.equal(ok.ready,true);assert.equal(ok.eligibleItems.length,1);
console.log('PASS dealer minimum and catalog tenant guard');
